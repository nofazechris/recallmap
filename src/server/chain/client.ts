import { createPublicClient, createWalletClient, defineChain, http, isAddress, isHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { env } from '../config';
import { HttpError } from '../lib/errors';
import artifact from './artifact.json';

const abi = artifact.abi;

export interface OnchainCredential { payloadHash: Hex; issuer: Address; issuedAt: number; revoked: boolean }
export interface Receipt { status: 'success' | 'reverted'; blockNumber: bigint; blockTimestamp: number }

/** Everything the app needs from the chain. The viem implementation below is the only production one. */
export interface ChainClient {
  chainId: number;
  contract: Address;
  /** Address of the key that submits issuance transactions (null for a read-only client). */
  issuer: Address | null;
  explorerUrl: string | null;
  issue(id: Hex, payloadHash: Hex): Promise<Hex>;
  getReceipt(txHash: Hex): Promise<Receipt | null>;
  read(id: Hex): Promise<OnchainCredential | null>;
}

export type ChainMode = 'read' | 'write';

let override: ChainClient | null = null;
/** Test seam only. Production code never calls this. */
export const __setChainForTests = (c: ChainClient | null) => { override = c; };

export const chainStatus = () => {
  if (override) return { read: true, write: true };
  const e = env();
  const read = !!(e.ARC_RPC_URL && e.ARC_CHAIN_ID && e.ARC_CREDENTIAL_CONTRACT_ADDRESS);
  return { read, write: read && !!e.ARC_ISSUER_PRIVATE_KEY };
};

const cache: Partial<Record<ChainMode, ChainClient>> = {};

/** Real Arc client built from environment variables. Throws a friendly error when Arc isn't configured. */
export function getChain(mode: ChainMode): ChainClient {
  if (override) return override;
  if (cache[mode]) return cache[mode]!;
  const e = env();
  const st = chainStatus();
  if (!(mode === 'write' ? st.write : st.read)) {
    throw new HttpError(503, 'arc_not_configured', mode === 'write'
      ? 'Arc credentials aren’t set up on this server yet (ARC_RPC_URL, ARC_CHAIN_ID, ARC_CREDENTIAL_CONTRACT_ADDRESS and ARC_ISSUER_PRIVATE_KEY).'
      : 'On-chain verification isn’t available: Arc isn’t configured on this server.');
  }
  const contract = e.ARC_CREDENTIAL_CONTRACT_ADDRESS as string;
  if (!isAddress(contract)) throw new HttpError(500, 'arc_misconfigured', 'ARC_CREDENTIAL_CONTRACT_ADDRESS is not a valid address.');
  const chain = defineChain({
    id: e.ARC_CHAIN_ID!, name: 'Arc', nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [e.ARC_RPC_URL!] } },
    blockExplorers: e.ARC_EXPLORER_URL ? { default: { name: 'Explorer', url: e.ARC_EXPLORER_URL } } : undefined,
  });
  const pub = createPublicClient({ chain, transport: http(e.ARC_RPC_URL, { timeout: 15_000, retryCount: 2 }) });

  let wallet: ReturnType<typeof createWalletClient> | null = null;
  let account: ReturnType<typeof privateKeyToAccount> | null = null;
  if (mode === 'write') {
    const raw = e.ARC_ISSUER_PRIVATE_KEY!.trim();
    const key = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;
    if (!isHex(key, { strict: true }) || key.length !== 66) throw new HttpError(500, 'arc_misconfigured', 'ARC_ISSUER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key.');
    account = privateKeyToAccount(key);
    wallet = createWalletClient({ account, chain, transport: http(e.ARC_RPC_URL, { timeout: 30_000 }) });
  }

  // Guard against pointing the app at the wrong network: the node must report the chain id we were configured with.
  let checked = false;
  const assertChain = async () => {
    if (checked) return;
    const id = await pub.getChainId();
    if (id !== e.ARC_CHAIN_ID) throw new Error(`RPC reports chain ${id} but ARC_CHAIN_ID is ${e.ARC_CHAIN_ID}.`);
    checked = true;
  };

  const client: ChainClient = {
    chainId: e.ARC_CHAIN_ID!, contract: contract as Address, issuer: account?.address ?? null, explorerUrl: e.ARC_EXPLORER_URL ?? null,
    async issue(id, payloadHash) {
      await assertChain();
      if (!wallet || !account) throw new Error('No issuer key configured.');
      // Gas on Arc is paid in USDC from the issuer wallet. Fail with a clear message instead of a cryptic RPC error.
      if ((await pub.getBalance({ address: account.address })) === 0n) throw new Error(`The issuer wallet ${account.address} has no USDC for gas. Top it up and retry.`);
      return wallet.writeContract({ address: contract as Address, abi, functionName: 'issue', args: [id, payloadHash], account, chain });
    },
    async getReceipt(txHash) {
      await assertChain();
      try {
        const r = await pub.getTransactionReceipt({ hash: txHash });
        const block = await pub.getBlock({ blockNumber: r.blockNumber });
        return { status: r.status === 'success' ? 'success' : 'reverted', blockNumber: r.blockNumber, blockTimestamp: Number(block.timestamp) };
      } catch (err) {
        if (err instanceof Error && /could not be found|not found/i.test(err.message)) return null;
        throw err;
      }
    },
    async read(id) {
      await assertChain();
      const [payloadHash, issuer, issuedAt, revoked] = (await pub.readContract({ address: contract as Address, abi, functionName: 'get', args: [id] })) as readonly [Hex, Address, bigint, boolean];
      if (/^0x0{40}$/.test(issuer)) return null;
      return { payloadHash, issuer, issuedAt: Number(issuedAt), revoked };
    },
  };
  cache[mode] = client;
  return client;
}
