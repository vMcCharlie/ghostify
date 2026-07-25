import { defineChain } from 'viem';

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' } },
  testnet: true,
});

export const ANNOUNCER_ABI = [{ type: 'event', name: 'Announcement', inputs: [
  { indexed: true, name: 'schemeId', type: 'uint256' }, { indexed: false, name: 'stealthAddress', type: 'address' },
  { indexed: false, name: 'ephemeralPubKey', type: 'bytes' }, { indexed: false, name: 'metadata', type: 'bytes' }
] }, { type: 'function', name: 'announce', stateMutability: 'nonpayable', inputs: [
  { name: 'schemeId', type: 'uint256' }, { name: 'stealthAddress', type: 'address' }, { name: 'ephemeralPubKey', type: 'bytes' }, { name: 'metadata', type: 'bytes' }
], outputs: [] }] as const;
