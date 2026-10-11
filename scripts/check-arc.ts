/**
 * Read-only health check of the Arc credential setup. Sends NO transactions and spends nothing.
 *   npm run arc:check
 */
import { createPublicClient, defineChain, formatEther, http, isAddress, isHex, keccak256, toBytes, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import artifact from '../src/server/chain/artifact.json';

const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => { console.error(`  ✗ ${m}`); process.exitCode = 1; };
const warn = (m: string) => console.log(`  ! ${m}`);

const rpc = process.env.ARC_RPC_URL;
const chainId = Number(process.env.ARC_CHAIN_ID);
const contract = process.env.ARC_CREDENTIAL_CONTRACT_ADDRESS;
const rawKey = process.env.ARC_ISSUER_PRIVATE_KEY?.trim();
const key = rawKey ? (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) : undefined;

console.log('Arc configuration');
if (!rpc || !chainId) { bad('ARC_RPC_URL and ARC_CHAIN_ID are required.'); process.exit(1); }
const chain = defineChain({ id: chainId, name: 'Arc', nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const pub = createPublicClient({ chain, transport: http(rpc) });

try {
  const reported = await pub.getChainId();
  reported === chainId ? ok(`RPC is chain ${reported}${chainId === 5042 ? ' (Arc MAINNET)' : ''}, block ${await pub.getBlockNumber()}`) : bad(`RPC reports chain ${reported} but ARC_CHAIN_ID is ${chainId}`);

  let issuer: Address | null = null;
  if (!key) warn('ARC_ISSUER_PRIVATE_KEY is not set yet (needed to issue credentials).');
  else if (!isHex(key, { strict: true }) || key.length !== 66) bad('ARC_ISSUER_PRIVATE_KEY is not a 0x-prefixed 32-byte hex key.');
  else {
    issuer = privateKeyToAccount(key).address;
    const bal = await pub.getBalance({ address: issuer });
    const gasPrice = await pub.getGasPrice();
    const perIssue = gasPrice * 120_000n;
    ok(`issuer wallet ${issuer} holds ${formatEther(bal)} USDC (≈ ${perIssue > 0n ? bal / perIssue : 0n} credentials of gas)`);
    if (bal === 0n) bad('issuer wallet has no USDC for gas — fund it before issuing.');
    else if (bal / perIssue < 50n) warn('issuer wallet is running low; top it up soon.');
  }

  if (!contract) warn('ARC_CREDENTIAL_CONTRACT_ADDRESS is not set yet — deploy first (npm run contracts:deploy).');
  else if (!isAddress(contract)) bad('ARC_CREDENTIAL_CONTRACT_ADDRESS is not a valid address.');
  else {
    const code = await pub.getCode({ address: contract as Address });
    if (!code || code === '0x') bad('no contract exists at that address on this network.');
    else {
      code.toLowerCase() === (artifact as { deployedBytecode: string }).deployedBytecode.toLowerCase() ? ok('contract code is byte-for-byte the audited build in this repo') : bad('contract code does NOT match this repo\'s build — do not use it.');
      const owner = (await pub.readContract({ address: contract as Address, abi: artifact.abi, functionName: 'owner' })) as Address;
      ok(`contract owner: ${owner}`);
      if (issuer) {
        const allowed = (await pub.readContract({ address: contract as Address, abi: artifact.abi, functionName: 'issuers', args: [issuer] })) as boolean;
        allowed ? ok('issuer wallet is authorised on the contract') : bad('issuer wallet is NOT authorised — the owner must call setIssuer.');
        if (owner.toLowerCase() === issuer.toLowerCase()) warn('the issuer is also the owner; use a separate owner wallet so a leaked app key cannot change permissions.');
      }
      const probe = (await pub.readContract({ address: contract as Address, abi: artifact.abi, functionName: 'get', args: [keccak256(toBytes('recallmap:healthcheck'))] })) as readonly [Hex, Address, bigint, boolean];
      /^0x0{40}$/.test(probe[1]) ? ok('public lookup works (unknown id correctly reports "not found")') : bad('unexpected data for a never-issued id');
    }
  }
} catch (e) {
  bad(e instanceof Error ? e.message.split('\n')[0] : String(e));
}
console.log(process.exitCode ? '\nArc setup has problems — see ✗ above.' : '\nArc check finished.');
