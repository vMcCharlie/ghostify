'use client';

import { useState } from 'react';
import { createPublicClient, createWalletClient, custom, http, parseEther } from 'viem';
import { monadTestnet, ANNOUNCER_ABI } from '@/lib/chain';
import { makeStealthPayment, parseMetaAddress } from '@/lib/stealth';

const announcer = process.env.NEXT_PUBLIC_ANNOUNCER_ADDRESS as `0x${string}` | undefined;
const client = createPublicClient({ chain: monadTestnet, transport: http() });

export default function SendPage() {
  const [metaAddress, setMetaAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    const parsed = parseMetaAddress(metaAddress);
    if (!parsed) return setStatus('Enter a valid st:monad meta-address.');
    let value: bigint;
    try { value = parseEther(amount); if (value <= 0n) throw new Error(); } catch { return setStatus('Enter a MON amount greater than zero.'); }
    if (!window.ethereum) return setStatus('Install or unlock a wallet such as MetaMask, then try again.');
    setSending(true); setStatus('Deriving a one-time stealth addressâ€¦');
    try {
      const wallet = createWalletClient({ chain: monadTestnet, transport: custom(window.ethereum) });
      const [account] = await wallet.requestAddresses();
      const chainId = await wallet.getChainId();
      if (chainId !== monadTestnet.id) throw new Error('Switch your wallet to Monad Testnet (chain ID 10143).');
      const payment = makeStealthPayment(parsed);
      setStatus('Confirm the private MON transfer in your walletâ€¦');
      const transferHash = await wallet.sendTransaction({ account, chain: monadTestnet, to: payment.stealthAddress, value });
      await client.waitForTransactionReceipt({ hash: transferHash });
      if (announcer) {
        setStatus('Publishing the encrypted discovery announcementâ€¦');
        const announcementHash = await wallet.writeContract({ account, address: announcer, abi: ANNOUNCER_ABI, functionName: 'announce', args: [1n, payment.stealthAddress, payment.ephemeralPubKey, '0x'] });
        await client.waitForTransactionReceipt({ hash: announcementHash });
        setStatus(`Private transfer complete. Announcement: ${announcementHash.slice(0, 10)}â€¦`);
      } else {
        setStatus(`MON sent to a stealth address (${payment.stealthAddress.slice(0, 10)}â€¦). Deploy Announcer.sol and set NEXT_PUBLIC_ANNOUNCER_ADDRESS to enable scanning.`);
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Transaction was not completed.'); }
    finally { setSending(false); }
  }

  return <main className="shell grid-bg px-4 py-5 sm:p-8"><div className="mx-auto max-w-6xl">
    <Header />
    <section className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
      <div className="panel rounded-3xl p-6 sm:p-9"><div className="mb-8 flex items-center justify-between"><div><p className="text-sm font-medium text-violet-300">SEND PRIVATELY</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Private MON transfer</h1></div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">Monad Testnet</span></div>
        <label className="mb-2 block text-sm font-medium text-slate-300">Receiver meta-address</label><input aria-label="Receiver meta-address" className="field font-mono text-sm" placeholder="st:monad:0x04â€¦:0x04â€¦" value={metaAddress} onChange={e => setMetaAddress(e.target.value)} />
        <p className="mt-2 text-xs leading-5 text-slate-500">Their public spending and viewing keys. This never reveals their primary wallet address.</p>
        <div className="mt-6"><label className="mb-2 block text-sm font-medium text-slate-300">Amount</label><div className="relative"><input aria-label="Amount in MON" inputMode="decimal" className="field pr-16 text-xl font-semibold" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /><span className="absolute right-4 top-3.5 text-sm font-bold text-violet-300">MON</span></div></div>
        <button className="primary mt-7 w-full" disabled={sending} onClick={send}>{sending ? 'Processing securelyâ€¦' : 'Send privately'}</button>
        {status && <p role="status" className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm leading-6 text-slate-300">{status}</p>}
      </div>
      <aside className="panel rounded-3xl p-6 sm:p-9"><p className="text-sm font-medium text-violet-300">HOW IT WORKS</p><h2 className="mt-2 text-2xl font-bold">Your transfer, hidden in plain sight.</h2><div className="mt-8 space-y-6">{[
        ['01','Derive locally','A one-time address is derived in your browser from the receiverâ€™s public meta-address.'],
        ['02','Transfer MON','You approve a normal Monad Testnet transfer directly to that address. Ghostify never touches funds.'],
        ['03','Announce & scan','A compact announcement lets only the receiverâ€™s viewing key discover the payment.']
      ].map(([n,t,d]) => <div key={n} className="flex gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 font-mono text-sm font-bold text-violet-300">{n}</span><div><h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm leading-5 text-slate-400">{d}</p></div></div>)}</div><div className="mt-8 rounded-2xl border border-violet-400/15 bg-violet-400/5 p-4 text-sm leading-6 text-violet-200">Testnet prototype: privacy is limited to address unlinkability; the MON amount and transfer timing remain public.</div></aside>
    </section></div></main>;
}

function Header() { return <header className="flex items-center justify-between"><a href="/" className="flex items-center gap-3 text-xl font-bold tracking-tight"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-lg">G</span>Ghostify</a><nav className="flex items-center gap-5"><a className="navlink" href="/">Send</a><a className="rounded-lg bg-white/8 px-3 py-2 text-sm font-medium text-white" href="/receive">Receive</a></nav></header>; }

