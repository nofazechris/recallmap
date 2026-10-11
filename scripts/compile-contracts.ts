/**
 * Compiles contracts/src/CredentialRegistry.sol with solc-js and writes the ABI + bytecode the app and tests use.
 * Run with: npm run contracts:build
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const solc = require('solc');

const file = 'contracts/src/CredentialRegistry.sol';
const input = {
  language: 'Solidity',
  sources: { [file]: { content: readFileSync(file, 'utf8') } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors ?? []).filter((e: { severity: string }) => e.severity === 'error');
if (errors.length) {
  console.error(errors.map((e: { formattedMessage: string }) => e.formattedMessage).join('\n'));
  process.exit(1);
}
for (const w of out.errors ?? []) console.warn(w.formattedMessage);

const c = out.contracts[file].CredentialRegistry;
mkdirSync('src/server/chain', { recursive: true });
writeFileSync('src/server/chain/artifact.json', JSON.stringify({ contractName: 'CredentialRegistry', solc: solc.version(), abi: c.abi, bytecode: `0x${c.evm.bytecode.object}`, deployedBytecode: `0x${c.evm.deployedBytecode.object}` }, null, 2) + '\n');
// Exactly what was compiled, in the format block explorers accept for source verification.
writeFileSync('contracts/standard-json-input.json', JSON.stringify({
  language: 'Solidity', sources: input.sources,
  settings: { optimizer: input.settings.optimizer, evmVersion: input.settings.evmVersion, outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } } },
}, null, 2) + '\n');
console.log(`Compiled CredentialRegistry with solc ${solc.version()} (${c.evm.bytecode.object.length / 2} bytes)`);
