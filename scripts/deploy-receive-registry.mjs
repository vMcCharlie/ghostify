import { readFileSync } from 'node:fs';
import solc from 'solc';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const rpcUrl = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) throw new Error('Set a disposable testnet PRIVATE_KEY.');
const chain = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } };
const source = readFileSync('contracts/src/ReceiveKeyRegistry.sol', 'utf8');
const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'ReceiveKeyRegistry.sol': { content: source } }, settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } })));
if (output.errors?.some(error => error.severity === 'error')) throw new Error(output.errors.map(error => error.formattedMessage).join('\n'));
const artifact = output.contracts['ReceiveKeyRegistry.sol'].ReceiveKeyRegistry;
const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
const hash = await walletClient.deployContract({ account, abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(JSON.stringify({ registry: receipt.contractAddress, startBlock: receipt.blockNumber.toString() }, null, 2));