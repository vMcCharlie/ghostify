'use client';

import { useState } from 'react';
import { createPublicClient, formatEther, http } from 'viem';
import { ANNOUNCER_ABI, monadTestnet } from '@/lib/chain';
import { createKeys, matchesAnnouncement, publicKeyFromPrivate } from '@/lib/stealth';

const announcer = process.env.NEXT_PUBLIC_ANNOUNCER_ADDRESS as `0x${string}` | undefined;
type Transfer = { address: string; tx: string; block: bigint; balance?: string };

export default function ReceivePage() {
  const [spending, setSpending] = useState(''); const [viewing, setViewing] = useState(''); const [meta, setMeta] = useState('');
  const [items, setItems] = useState<Transfer[]>([]); const [status, setStatus] = useState(''); const [scanning, setScanning] = useState(false);
  function generate() { const keys = createKeys(); setSpending(keys.spendingPrivateKey); setViewing(keys.viewingPrivateKey); setMeta(keys.metaAddress); setStatus('Keys generated locally. Save them somewhere private before sending your meta-address.'); }
  async function scan() {
    if (!announcer) return setStatus('Set NEXT_PUBLIC_ANNOUNCER_ADDRESS after deploying the contract, then restart the app.');
    if (!/^0x[0-9a-fA-F]{64}$/.test(spending) || !/^0x[0-9a-fA-F]{64}$/.test(viewing)) return setStatus('Enter valid 32-byte private spending and viewing keys.');
    setScanning(true); setStatus('Reading Monad announcement logsâ€¦');
    try {
      const client = createPublicClient({ chain: monadTestnet, transport: http() });
      const logs = await client.getContractEvents({ address: announcer, abi: ANNOUNCER_ABI, eventName: 'Announcement', fromBlock: 0n, toBlock: 'latest' });
      const matched = await Promise.all(logs.filter(log => log.args.stealthAddress && log.args.ephemeralPubKey && matchesAnnouncement(publicKeyFromPrivate(spending), viewing, log.args.ephemeralPubKey!, log.args.stealthAddress!)).map(async log => ({ address: log.args.stealthAddress!, tx: log.transactionHash!, block: log.blockNumber!, balance: formatEther(await client.getBalance({ address: log.args.stealthAddress! })) })));
      setItems(matched); setStatus(matched.length ? `${matched.length} private transfer${matched.length === 1 ? '' : 's'} discovered.` : 'No matching announcements found yet.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to scan announcements.'); } finally { setScanning(false); }
  }
  return <main className="shell grid-bg px-4 py-5 sm:p-8"><div className="mx-auto max-w-6xl"><Header /><section className="mt-10 grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
    <div className="panel rounded-3xl p-6 sm:p-8"><p className="text-sm font-medium text-violet-300">RECEIVE PRIVATELY</p><h1 className="mt-2 text-3xl font-bold">Scan for stealth transfers</h1><p className="mt-3 text-sm leading-6 text-slate-400">Your keys stay in this browser session. They are never sent to Ghostify.</p><button className="mt-6 w-full rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 text-sm font-semibold text-violet-200" onClick={generate}>Generate new receive keys</button>{meta && <div className="mt-4 rounded-xl bg-black/20 p-3"><p className="text-xs font-semibold text-slate-400">SHARE THIS META-ADDRESS</p><p className="mt-2 break-all font-mono text-xs leading-5 text-violet-200">{meta}</p></div>}
      <label className="mb-2 mt-6 block text-sm font-medium text-slate-300">Private spending key</label><input className="field font-mono text-sm" type="password" placeholder="0xâ€¦" value={spending} onChange={e => setSpending(e.target.value)} />
      <label className="mb-2 mt-4 block text-sm font-medium text-slate-300">Private viewing key</label><input className="field font-mono text-sm" type="password" placeholder="0xâ€¦" value={viewing} onChange={e => setViewing(e.target.value)} />
      <button className="primary mt-6 w-full" disabled={scanning} onClick={scan}>{scanning ? 'Scanning Monadâ€¦' : 'Scan Monad Testnet'}</button>{status && <p role="status" className="mt-4 text-sm leading-6 text-slate-300">{status}</p>}
    </div>
    <div className="panel rounded-3xl p-6 sm:p-8"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-violet-300">INCOMING</p><h2 className="mt-2 text-2xl font-bold">Stealth transfers</h2></div><span className="rounded-full bg-white/8 px-3 py-1 text-sm text-slate-300">{items.length} found</span></div>{items.length === 0 ? <div className="mt-10 rounded-2xl border border-dashed border-white/15 p-10 text-center"><div className="text-3xl">â—Œ</div><p className="mt-4 font-medium">No transfers displayed</p><p className="mt-2 text-sm text-slate-500">Generate or enter your keys, then scan the deployed announcement registry.</p></div> : <div className="mt-7 space-y-3">{items.map(item => <a key={item.tx} className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10" target="_blank" href={`https://testnet.monadvision.com/tx/${item.tx}`}><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-emerald-300">+ {item.balance} MON</p><p className="mt-1 font-mono text-xs text-slate-500">{item.address}</p></div><span className="text-xs text-slate-400">Block {item.block.toString()}</span></div></a>)}</div>}</div>
  </section></div></main>;
}
function Header() { return <header className="flex items-center justify-between"><a href="/" className="flex items-center gap-3 text-xl font-bold tracking-tight"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-lg">G</span>Ghostify</a><nav className="flex items-center gap-5"><a className="navlink" href="/">Send</a><a className="rounded-lg bg-white/8 px-3 py-2 text-sm font-medium text-white" href="/receive">Receive</a></nav></header>; }

