import { defineChain } from 'viem';

export const monadTestnet = defineChain({
  id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' } }, testnet: true,
});

export const SHIELDED_POOL_ABI = [
  { type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [{ name: 'pA', type: 'uint256[2]' }, { name: 'pB', type: 'uint256[2][2]' }, { name: 'pC', type: 'uint256[2]' }, { name: 'commitment', type: 'bytes32' }], outputs: [{ name: 'leafIndex', type: 'uint32' }] },
  { type: 'function', name: 'privateTransfer', stateMutability: 'nonpayable', inputs: [{ name: 'pA', type: 'uint256[2]' }, { name: 'pB', type: 'uint256[2][2]' }, { name: 'pC', type: 'uint256[2]' }, { name: 'root', type: 'bytes32' }, { name: 'nullifierHash', type: 'bytes32' }, { name: 'newCommitment', type: 'bytes32' }, { name: 'encryptedNote', type: 'bytes' }], outputs: [] },
  { type: 'function', name: 'privateWithdraw', stateMutability: 'nonpayable', inputs: [{ name: 'pA', type: 'uint256[2]' }, { name: 'pB', type: 'uint256[2][2]' }, { name: 'pC', type: 'uint256[2]' }, { name: 'root', type: 'bytes32' }, { name: 'nullifierHash', type: 'bytes32' }, { name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'event', name: 'Deposit', inputs: [{ indexed: true, name: 'commitment', type: 'bytes32' }, { indexed: false, name: 'amount', type: 'uint256' }, { indexed: false, name: 'leafIndex', type: 'uint32' }, { indexed: false, name: 'newRoot', type: 'bytes32' }] },
  { type: 'event', name: 'PrivateTransfer', inputs: [{ indexed: true, name: 'nullifierHash', type: 'bytes32' }, { indexed: true, name: 'newCommitment', type: 'bytes32' }, { indexed: false, name: 'encryptedNote', type: 'bytes' }, { indexed: false, name: 'newRoot', type: 'bytes32' }] },
  { type: 'event', name: 'PrivateWithdrawal', inputs: [{ indexed: true, name: 'nullifierHash', type: 'bytes32' }, { indexed: true, name: 'recipient', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }, { indexed: false, name: 'recipientHash', type: 'bytes32' }] },
] as const;
export const RECEIVE_KEY_REGISTRY_ABI = [{ type: 'function', name: 'register', stateMutability: 'nonpayable', inputs: [{ name: 'receiveKey', type: 'bytes' }], outputs: [] }, { type: 'function', name: 'keyOf', stateMutability: 'view', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ name: '', type: 'bytes' }] }] as const;
