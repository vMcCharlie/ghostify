import { readFileSync } from 'node:fs';
import solc from 'solc';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createCode } from 'circomlibjs/src/mimc7_gencontract.js';

const rpcUrl = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) throw new Error('Set a disposable testnet PRIVATE_KEY in your environment.');
const chain = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } };
const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

function compile(file, contractName) {
  const source = readFileSync(file, 'utf8');
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { [file]: { content: source } }, settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } })));
  if (output.errors?.some(error => error.severity === 'error')) throw new Error(output.errors.map(error => error.formattedMessage).join('\n'));
  const artifact = output.contracts[file][contractName];
  return { abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` };
}
async function deploy(artifact, args = []) {
  const hash = await walletClient.deployContract({ ...artifact, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error(`Deployment failed: ${hash}`);
  return receipt.contractAddress;
}

const verifier = await deploy(compile('contracts/src/ShieldedSpendVerifier.sol', 'Groth16Verifier'));
const mimc = await deploy({ abi: [{ type: 'function', name: 'MiMCpe7', stateMutability: 'pure', inputs: [{ type: 'uint256', name: 'in_x' }, { type: 'uint256', name: 'in_k' }], outputs: [{ type: 'uint256', name: 'out_x' }] }], bytecode: createCode('mimc', 91) });
const pool = await deploy(compile('contracts/src/ShieldedPool.sol', 'ShieldedPool'), [mimc, verifier]);
console.log(JSON.stringify({ verifier, mimc, pool }, null, 2));
