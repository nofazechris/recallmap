/**
 * Deploys CredentialRegistry to the Arc network in .env.local (MAINNET: chain 5042).
 *
 * Safe by default — running it only SIMULATES the deployment and shows what it would cost:
 *   DEPLOYER_PRIVATE_KEY=0x… npm run contracts:deploy
 * To really broadcast (irreversible, spends real USDC):
 *   DEPLOYER_PRIVATE_KEY=0x… CONFIRM_MAINNET=yes npm run contracts:deploy -- --broadcast
 *
 * The deployer becomes the contract OWNER (can add/remove issuers, revoke, transfer ownership).
 * The issuer is the app's ARC_ISSUER_PRIVATE_KEY address (can only issue + revoke its own credentials).
 * Use two different wallets. Keep the deployer key out of .env.local.
 */
import { createPublicClient, createWalletClient, defineChain, encodeDeployData, formatEther, http, isHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import artifact from '../src/server/chain/artifact.json';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) { console.error(`Missing ${k}`); process.exit(1); }
  return v;
};

const rpc = need('ARC_RPC_URL');
const chainId = Number(need('ARC_CHAIN_ID'));
const norm = (k: string | undefined) => { const v = (k ?? '').trim(); return v && !v.startsWith('0x') ? `0x${v}` : v; };
const deployerKey = norm(process.env.DEPLOYER_PRIVATE_KEY);
const deployerAddressOnly = process.env.DEPLOYER_ADDRESS as Address | undefined; // dry run only: no key needed to estimate the cost
const issuerKey = norm(process.env.ARC_ISSUER_PRIVATE_KEY);
const broadcast = process.argv.includes('--broadcast');
if (broadcast && (!isHex(deployerKey, { strict: true }) || deployerKey.length !== 66)) { console.error('DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key to broadcast.'); process.exit(1); }
if (!broadcast && !deployerKey && !deployerAddressOnly) { console.error('For a dry run set DEPLOYER_ADDRESS (public address) or DEPLOYER_PRIVATE_KEY.'); process.exit(1); }

const deployer = deployerKey ? privateKeyToAccount(deployerKey as Hex) : ({ address: deployerAddressOnly! } as { address: Address });
const issuer = process.env.ISSUER_ADDRESS ?? (issuerKey && issuerKey.length === 66 ? privateKeyToAccount(issuerKey as Hex).address : null);
if (!issuer) { console.error('Set ARC_ISSUER_PRIVATE_KEY in .env.local (or ISSUER_ADDRESS) so the contract knows who may issue.'); process.exit(1); }
if (issuer.toLowerCase() === deployer.address.toLowerCase()) { console.error('Use a DIFFERENT wallet for the deployer (owner) and the issuer (the app key).'); process.exit(1); }

const chain = defineChain({ id: chainId, name: 'Arc', nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const pub = createPublicClient({ chain, transport: http(rpc) });
const wallet = deployerKey ? createWalletClient({ account: deployer as ReturnType<typeof privateKeyToAccount>, chain, transport: http(rpc) }) : null;

const reported = await pub.getChainId();
if (reported !== chainId) { console.error(`RPC reports chain ${reported}, expected ${chainId}. Aborting.`); process.exit(1); }
const mainnet = chainId === 5042;

const balance = await pub.getBalance({ address: deployer.address });
const gasPrice = await pub.getGasPrice();
const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode as Hex, args: [issuer] });
const gasWithArgs = await pub.estimateGas({ account: deployer.address, data }).catch((e) => { console.error('Simulation failed:', e instanceof Error ? e.message.split('\n')[0] : e); return null; });
if (!gasWithArgs) process.exit(1);
const cost = gasWithArgs * gasPrice;

console.log(`Network        : Arc ${mainnet ? 'MAINNET' : 'chain ' + chainId} (chain id ${reported})`);
console.log(`Deployer/owner : ${deployer.address}  (balance ${formatEther(balance)} USDC)`);
console.log(`Issuer         : ${issuer}`);
console.log(`Estimated cost : ${formatEther(cost)} USDC  (${gasWithArgs} gas @ ${gasPrice} wei)`);
if (balance < cost * 2n) { console.error('\nThe deployer wallet needs more USDC for gas. Aborting.'); process.exit(1); }

if (!broadcast) { console.log('\nDRY RUN — nothing was sent. Re-run with  --broadcast  (and CONFIRM_MAINNET=yes on mainnet) to deploy.'); process.exit(0); }
if (mainnet && process.env.CONFIRM_MAINNET !== 'yes') { console.error('\nThis is MAINNET. Set CONFIRM_MAINNET=yes to confirm you want to spend real USDC.'); process.exit(1); }

console.log('\nBroadcasting…');
const hash = await wallet!.sendTransaction({ data, account: deployer as ReturnType<typeof privateKeyToAccount>, chain });
console.log('Transaction:', hash);
const receipt = await pub.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success' || !receipt.contractAddress) { console.error('Deployment failed.'); process.exit(1); }
const addr = receipt.contractAddress;

// Trust, but verify: the code on-chain must be byte-for-byte what we compiled, with the right owner and issuer.
const code = await pub.getCode({ address: addr });
const same = code?.toLowerCase() === (artifact as { deployedBytecode: string }).deployedBytecode.toLowerCase();
const owner = (await pub.readContract({ address: addr, abi: artifact.abi, functionName: 'owner' })) as string;
const isIssuer = (await pub.readContract({ address: addr, abi: artifact.abi, functionName: 'issuers', args: [issuer] })) as boolean;
console.log(`\nDeployed at  ${addr}`);
console.log(`  on-chain code matches build : ${same ? 'YES' : 'NO  <-- do not use this contract'}`);
console.log(`  owner is the deployer       : ${owner.toLowerCase() === deployer.address.toLowerCase() ? 'YES' : 'NO'}`);
console.log(`  issuer authorised           : ${isIssuer ? 'YES' : 'NO'}`);
console.log(`\nNext: set ARC_CREDENTIAL_CONTRACT_ADDRESS=${addr} in .env.local, then run  npm run arc:check`);
if (!same || !isIssuer) process.exit(1);
