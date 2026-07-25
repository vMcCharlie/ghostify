'use client';

import { useState } from 'react';
import { createPublicClient, createWalletClient, custom, http, isAddress, parseEther } from 'viem';
import { monadTestnet, ANNOUNCER_ABI, REGISTRY_ABI } from '@/lib/chain';
import { makeStealthPayment, parseMetaAddress, type MetaAddress } from '@/lib/stealth';

const announcer = process.env.NEXT_PUBLIC_ANNOUNCER_ADDRESS as `0x${string}` | undefined;
const registry = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}` | undefined;
const client = createPublicClient({ chain: monadTestnet, transport: http() });

export default function SendPage() {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

  async function resolveRecipient(): Promise<MetaAddress | null> {
    const direct = parseMetaAddress(recipient);
    if (direct) return direct;
    if (!isAddress(recipient)) { setStatus('Paste a Monad wallet address or a Ghostify receive address.'); return null; }
    if (!registry) { setStatus('Wallet address lookup is not configured yet. Use a Ghostify receive address.'); return null; }
    setStatus('Looking up the receiver secure payment profile...');
    const [spendingPublicKey, viewingPublicKey] = await client.readContract({ address: registry, abi: REGISTRY_ABI, functionName: 'resolve', args: [recipient] });
    if (spendingPublicKey === '0x' || viewingPublicKey === '0x') { setStatus('This wallet has not enabled Ghostify receiving yet. Ask them to open Receive and register their wallet.'); return null; }
    return { spendingPublicKey, viewingPublicKey };
  }

  async function send() {
    let value: bigint;
    try { value = parseEther(amount); if (value <= 0n) throw new Error(); } catch { return setStatus('Enter a MON amount greater than zero.'); }
    if (!window.ethereum) return setStatus('Install or unlock a wallet such as MetaMask, then try again.');
    setSending(true);
    try {
      const parsed = await resolveRecipient();
      if (!parsed) return;
      setStatus('Creating a one-time private payment address...');
      const wallet = createWalletClient({ chain: monadTestnet, transport: custom(window.ethereum) });
      const [account] = await wallet.requestAddresses();
      if (await wallet.getChainId() !== monadTestnet.id) throw new Error('Switch your wallet to Monad Testnet (chain ID 10143).');
      const payment = makeStealthPayment(parsed);
      setStatus('Confirm the private MON transfer in your wallet...');
      const transferHash = await wallet.sendTransaction({ account, chain: monadTestnet, to: payment.stealthAddress, value });
      await client.waitForTransactionReceipt({ hash: transferHash });
      if (!announcer) throw new Error('Announcement registry is not configured.');
      setStatus('Publishing the private payment announcement...');
      const announcementHash = await wallet.writeContract({ account, address: announcer, abi: ANNOUNCER_ABI, functionName: 'announce', args: [1n, payment.stealthAddress, payment.ephemeralPubKey, '0x'] });
      await client.waitForTransactionReceipt({ hash: announcementHash });
      setStatus(`Private transfer complete. Announcement: ${announcementHash.slice(0, 10)}...`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Transaction was not completed.'); }
    finally { setSending(false); }
  }

  return <main className="shell grid-bg px-4 py-5 sm:p-8"><div className="mx-auto max-w-6xl"><Header /><section className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
    <div className="panel rounded-3xl p-6 sm:p-9"><div className="mb-8 flex items-center justify-between"><div><p className="text-sm font-medium text-violet-300">SEND PRIVATELY</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Private MON transfer</h1></div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">Monad Testnet</span></div>
      <label className="mb-2 block text-sm font-medium text-slate-300">Send to</label><input aria-label="Receiver wallet or Ghostify address" className="field font-mono text-sm" placeholder="0x wallet address or st:monad:..." value={recipient} onChange={e => setRecipient(e.target.value)} />
      <p className="mt-2 text-xs leading-5 text-slate-500">Paste their wallet address. Ghostify finds their registered private receive profile automatically.</p>
      <div className="mt-6"><label className="mb-2 block text-sm font-medium text-slate-300">Amount</label><div className="relative"><input aria-label="Amount in MON" inputMode="decimal" className="field pr-16 text-xl font-semibold" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /><span className="absolute right-4 top-3.5 text-sm font-bold text-violet-300">MON</span></div></div>
      <button className="primary mt-7 w-full" disabled={sending} onClick={send}>{sending ? 'Processing securely...' : 'Send privately'}</button>{status && <p role="status" className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm leading-6 text-slate-300">{status}</p>}</div>
    <aside className="panel rounded-3xl p-6 sm:p-9"><p className="text-sm font-medium text-violet-300">HOW IT WORKS</p><h2 className="mt-2 text-2xl font-bold">Send with an address they already know.</h2><div className="mt-8 space-y-6">{[['01','Receiver opts in','They connect their wallet once and register public receive keys.'],['02','Paste a wallet address','Ghostify resolves the public receive profile on Monad.'],['03','Transfer privately','A one-time address protects the link to their primary wallet.']].map(([n,t,d]) => <div key={n} className="flex gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 font-mono text-sm font-bold text-violet-300">{n}</span><div><h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm leading-5 text-slate-400">{d}</p></div></div>)}</div><div className="mt-8 rounded-2xl border border-violet-400/15 bg-violet-400/5 p-4 text-sm leading-6 text-violet-200">Testnet prototype: payment amount and timing remain public.</div></aside>
  </section></div></main>;
}
function WalletConnectButton() {
  const [address, setAddress] = useState('');
  async function connect() {
    if (!window.ethereum) return alert('Install or unlock a wallet such as MetaMask.');
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      if (accounts[0]) setAddress(accounts[0]);
    } catch { /* user dismissed wallet connection */ }
  }
  return <button className="rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-sm font-semibold text-violet-200" onClick={connect}>{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connect wallet'}</button>;
}
function Header() { return <header className="flex items-center justify-between"><a href="/" className="flex items-center gap-3 text-xl font-bold tracking-tight"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-lg">G</span>Ghostify</a><nav className="flex items-center gap-3"><WalletConnectButton /><a className="navlink" href="/">Send</a><a className="rounded-lg bg-white/8 px-3 py-2 text-sm font-medium text-white" href="/receive">Receive</a></nav></header>; }
