import { readFileSync } from 'node:fs';
import solc from 'solc';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mimc7Contract } from 'circomlibjs';

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
  return { address: receipt.contractAddress, blockNumber: receipt.blockNumber };
}

const depositVerifier = await deploy(compile('contracts/src/ShieldedDepositVerifier.sol', 'Groth16Verifier'));
const transferVerifier = await deploy(compile('contracts/src/ShieldedSpendVerifier.sol', 'Groth16Verifier'));
const withdrawVerifier = await deploy(compile('contracts/src/ShieldedWithdrawVerifier.sol', 'Groth16Verifier'));
const mimc = await deploy({ abi: [{ type: 'function', name: 'MiMCpe7', stateMutability: 'pure', inputs: [{ type: 'uint256', name: 'in_x' }, { type: 'uint256', name: 'in_k' }], outputs: [{ type: 'uint256', name: 'out_x' }] }], bytecode: mimc7Contract.createCode('mimc', 91) });
const pool = await deploy(compile('contracts/src/ShieldedPool.sol', 'ShieldedPool'), [mimc.address, depositVerifier.address, transferVerifier.address, withdrawVerifier.address]);
console.log(JSON.stringify({ depositVerifier: depositVerifier.address, transferVerifier: transferVerifier.address, withdrawVerifier: withdrawVerifier.address, mimc: mimc.address, pool: pool.address, poolStartBlock: pool.blockNumber.toString() }, null, 2));