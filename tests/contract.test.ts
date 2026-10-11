/**
 * REAL contract tests: the compiled CredentialRegistry bytecode (artifact.json, built by `npm run contracts:build`)
 * is executed on an in-process EVM. Nothing about the contract is mocked.
 * The same behaviours exist as a Foundry suite in contracts/test for `forge test`.
 */
import { Common, Mainnet } from '@ethereumjs/common';
import { createEVM, type EVM } from '@ethereumjs/evm';
import { bytesToHex, createAccount, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeErrorResult, decodeEventLog, decodeFunctionResult, encodeDeployData, encodeFunctionData, keccak256, toBytes, type Abi, type Hex } from 'viem';
import artifact from '../src/server/chain/artifact.json';

const abi = artifact.abi as Abi;
const issuer = '0x00000000000000000000000000000000000a11ce';
const stranger = '0x0000000000000000000000000000000000000bad';
const deployer = '0x00000000000000000000000000000000000de910';
const id = keccak256(toBytes('credential-1'));
const hash = keccak256(toBytes('payload-1'));

let evm: EVM;
let registry: ReturnType<typeof createAddressFromString>;

const addr = (a: string) => createAddressFromString(a);

async function call(from: string, functionName: string, args: unknown[] = []) {
  const data = encodeFunctionData({ abi, functionName, args } as never);
  // Each call is its own "transaction": persist state on success, discard it on revert.
  await evm.journal.checkpoint();
  const res = await evm.runCall({ caller: addr(from), to: registry, data: hexToBytes(data), gasLimit: 5_000_000n });
  if (res.execResult.exceptionError) await evm.journal.revert(); else await evm.journal.commit();
  return res;
}
const revertName = (res: Awaited<ReturnType<typeof call>>) => {
  if (!res.execResult.exceptionError) return null;
  try { return decodeErrorResult({ abi, data: bytesToHex(res.execResult.returnValue) }).errorName; } catch { return 'unknown'; }
};

beforeAll(async () => {
  evm = await createEVM({ common: new Common({ chain: Mainnet, hardfork: 'shanghai' }) });
  for (const a of [issuer, stranger, deployer]) await evm.stateManager.putAccount(addr(a), createAccount({ balance: 10n ** 20n }));
  const data = encodeDeployData({ abi, bytecode: artifact.bytecode as Hex, args: [issuer] });
  await evm.journal.checkpoint();
  const res = await evm.runCall({ caller: addr(deployer), data: hexToBytes(data), gasLimit: 5_000_000n });
  expect(res.execResult.exceptionError).toBeUndefined();
  await evm.journal.commit();
  registry = res.createdAddress!;
});

describe('CredentialRegistry (compiled bytecode on a real EVM)', () => {
  it('rejects issuance from anyone who is not an authorised issuer', async () => {
    expect(revertName(await call(stranger, 'issue', [id, hash]))).toBe('NotIssuer');
  });

  it('lets the issuer anchor a credential and emits CredentialIssued', async () => {
    const res = await call(issuer, 'issue', [id, hash]);
    expect(res.execResult.exceptionError).toBeUndefined();
    const log = res.execResult.logs![0];
    const ev = decodeEventLog({ abi, data: bytesToHex(log[2]), topics: log[1].map((t) => bytesToHex(t)) as [Hex, ...Hex[]] }) as { eventName: string; args: { credentialId: Hex; payloadHash: Hex; issuer: string } };
    expect(ev.eventName).toBe('CredentialIssued');
    expect(ev.args.credentialId).toBe(id);
    expect(ev.args.payloadHash).toBe(hash);
    expect(ev.args.issuer.toLowerCase()).toBe(issuer);
  });

  it('serves a public lookup and verifies only the exact hash', async () => {
    const got = decodeFunctionResult({ abi, functionName: 'get', data: bytesToHex((await call(stranger, 'get', [id])).execResult.returnValue) }) as readonly [Hex, string, bigint, boolean];
    expect(got[0]).toBe(hash);
    expect(got[1].toLowerCase()).toBe(issuer);
    expect(got[3]).toBe(false);

    const ok = decodeFunctionResult({ abi, functionName: 'verify', data: bytesToHex((await call(stranger, 'verify', [id, hash])).execResult.returnValue) });
    const tampered = decodeFunctionResult({ abi, functionName: 'verify', data: bytesToHex((await call(stranger, 'verify', [id, keccak256(toBytes('tampered'))])).execResult.returnValue) });
    const unknown = decodeFunctionResult({ abi, functionName: 'verify', data: bytesToHex((await call(stranger, 'verify', [keccak256(toBytes('nope')), hash])).execResult.returnValue) });
    expect([ok, tampered, unknown]).toEqual([true, false, false]);
  });

  it('refuses duplicate credential ids, empty ids and empty hashes', async () => {
    expect(revertName(await call(issuer, 'issue', [id, keccak256(toBytes('other'))]))).toBe('AlreadyIssued');
    expect(revertName(await call(issuer, 'issue', [`0x${'00'.repeat(32)}`, hash]))).toBe('EmptyId');
    expect(revertName(await call(issuer, 'issue', [keccak256(toBytes('x')), `0x${'00'.repeat(32)}`]))).toBe('EmptyHash');
  });

  it('only the issuer or owner can revoke, and a revoked credential no longer verifies', async () => {
    expect(revertName(await call(stranger, 'revoke', [id]))).toBe('NotAllowedToRevoke');
    expect(revertName(await call(issuer, 'revoke', [keccak256(toBytes('missing'))]))).toBe('NotFound');
    expect((await call(issuer, 'revoke', [id])).execResult.exceptionError).toBeUndefined();
    const v = decodeFunctionResult({ abi, functionName: 'verify', data: bytesToHex((await call(stranger, 'verify', [id, hash])).execResult.returnValue) });
    expect(v).toBe(false);
  });

  it('owner manages issuers; others cannot', async () => {
    expect(revertName(await call(stranger, 'setIssuer', [stranger, true]))).toBe('NotOwner');
    expect((await call(deployer, 'setIssuer', [stranger, true])).execResult.exceptionError).toBeUndefined();
    expect((await call(stranger, 'issue', [keccak256(toBytes('by-stranger')), hash])).execResult.exceptionError).toBeUndefined();
    expect((await call(deployer, 'setIssuer', [stranger, false])).execResult.exceptionError).toBeUndefined();
    expect(revertName(await call(stranger, 'issue', [keccak256(toBytes('again')), hash]))).toBe('NotIssuer');
  });
});
