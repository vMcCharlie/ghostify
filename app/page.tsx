'use client';
import { useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, custom, getAddress, http, isAddress, parseEther, toHex } from 'viem';
import { monadTestnet, SHIELDED_POOL_ABI } from '@/lib/chain';
import { createShieldedNote, decryptNote, encryptNote, getOrCreateProfile, hash2, loadNotes, merklePath, saveNotes, type ReceiveProfile, type ShieldedNote } from '@/lib/shielded';

const pool = process.env.NEXT_PUBLIC_SHIELDED_POOL_ADDRESS as `0x${string}` | undefined;
const wasmUrl = process.env.NEXT_PUBLIC_ZK_WASM_URL;
const zkeyUrl = process.env.NEXT_PUBLIC_ZK_ZKEY_URL;
const withdrawWasmUrl = process.env.NEXT_PUBLIC_WITHDRAW_ZK_WASM_URL;
const withdrawZkeyUrl = process.env.NEXT_PUBLIC_WITHDRAW_ZK_ZKEY_URL;
const poolStartBlock = BigInt(process.env.NEXT_PUBLIC_SHIELDED_POOL_START_BLOCK || '48041968');
// The public Monad RPC limits log-query throughput. We make one request at a
// time and retry only a transient rate-limit response.
const client = createPublicClient({ chain: monadTestnet, transport: http(undefined, { retryCount: 0 }) });
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const isRateLimit = (error: unknown) => /limited to|rate limit|too many requests|429/i.test(error instanceof Error ? error.message : String(error));
const displayError = (error: unknown) => isRateLimit(error) ? 'Monad RPC is busy. Ghostify slowed down and retried; please try again in a moment.' : error instanceof Error ? error.message : 'The request could not be completed.';

async function eventLogs(eventName: 'Deposit' | 'PrivateTransfer') {
  const logs: any[] = [];
  const latest = await client.getBlockNumber();
  for (let start = poolStartBlock; start <= latest; start += 100n) {
    const end = start + 99n > latest ? latest : start + 99n;
    for (let attempt = 0; ; attempt += 1) {
      try {
        logs.push(...await client.getContractEvents({ address: pool!, abi: SHIELDED_POOL_ABI, eventName, fromBlock: start, toBlock: end } as any));
        break;
      } catch (error) {
        if (!isRateLimit(error) || attempt === 4) throw error;
        await pause(500 * (attempt + 1));
      }
    }
    await pause(125);
  }
  return logs;
}

const depositLogs = () => eventLogs('Deposit');
const transferLogs = () => eventLogs('PrivateTransfer');

export default function ShieldedPoolPage() {
  const [wallet, setWallet] = useState('');
  const [notes, setNotes] = useState<ShieldedNote[]>([]);
  const [profile, setProfile] = useState<ReceiveProfile | null>(null);
  const [receiver, setReceiver] = useState('');
  const [withdrawRecipient, setWithdrawRecipient] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setNotes(loadNotes()); setProfile(getOrCreateProfile()); }, []);
  const persist = (next: ShieldedNote[]) => { setNotes(next); saveNotes(next); };

  async function connect() {
    if (!window.ethereum) return setStatus('Install or unlock a wallet such as MetaMask.');
    try {
      const wc = createWalletClient({ chain: monadTestnet, transport: custom(window.ethereum) });
      const [account] = await wc.requestAddresses();
      if (await wc.getChainId() !== monadTestnet.id) throw new Error('Switch to Monad Testnet (chain 10143).');
      setWallet(account);
      setStatus('Wallet connected.');
    } catch (error) { setStatus(displayError(error)); }
  }

  function disconnect() {
    setWallet('');
    setStatus('Disconnected from Ghostify. MetaMask remains connected until you revoke it in the wallet.');
  }

  async function poolLeaves() {
    if (!pool) throw new Error('Shielded pool is not configured.');
    const deposits = await depositLogs();
    const transfers = await transferLogs();
    return [...deposits.map(log => ({ commitment: log.args.commitment!, block: log.blockNumber!, index: log.logIndex! })), ...transfers.map(log => ({ commitment: log.args.newCommitment!, block: log.blockNumber!, index: log.logIndex! }))]
      .sort((a, b) => a.block === b.block ? Number(a.index - b.index) : a.block < b.block ? -1 : 1)
      .map(item => item.commitment);
  }

  async function deposit() {
    if (!pool) return setStatus('Shielded pool is not configured yet.');
    if (!wallet) return setStatus('Connect your wallet first.');
    setBusy(true);
    try {
      setStatus('Creating a private note locally...');
      const note = await createShieldedNote();
      const wc = createWalletClient({ chain: monadTestnet, transport: custom(window.ethereum!) });
      setStatus('Confirm the 1 MON deposit in your wallet...');
      const hash = await wc.writeContract({ account: wallet as `0x${string}`, address: pool, abi: SHIELDED_POOL_ABI, functionName: 'deposit', args: [note.commitment], value: parseEther('1') });
      await client.waitForTransactionReceipt({ hash });
      persist([...notes, note]);
      setStatus(`Deposit confirmed. Note stored locally. ${hash.slice(0, 10)}...`);
    } catch (error) { setStatus(displayError(error)); } finally { setBusy(false); }
  }

  async function scan() {
    if (!pool || !profile) return;
    setBusy(true);
    try {
      setStatus('Scanning encrypted private-transfer notes...');
      const logs = await transferLogs();
      const incoming = (await Promise.all(logs.map(log => decryptNote(log.args.encryptedNote!, profile)))).filter((note): note is ShieldedNote => note !== null);
      const next = [...notes];
      for (const note of incoming) if (!next.some(existing => existing.commitment.toLowerCase() === note.commitment.toLowerCase())) next.push(note);
      persist(next);
      setStatus(incoming.length ? `${incoming.length} encrypted note(s) found.` : 'No new encrypted notes found.');
    } catch (error) { setStatus(displayError(error)); } finally { setBusy(false); }
  }

  async function privateSend() {
    if (!pool || !wasmUrl || !zkeyUrl) return setStatus('ZK artifacts are not configured.');
    if (!/^0x04[0-9a-fA-F]{128}$/.test(receiver)) return setStatus('Paste the receiver shielded public key.');
    const note = notes.find(item => !item.spent);
    if (!note) return setStatus('No unspent local note is available. Deposit 1 MON first.');
    setBusy(true);
    try {
      setStatus('Building Merkle path from Monad events...');
      const leaves = await poolLeaves();
      const path = await merklePath(leaves, note.commitment);
      const recipient = await createShieldedNote();
      const nullifierHash = await hash2(note.nullifier, 1n);
      const encryptedNote = await encryptNote(recipient, receiver as `0x${string}`);
      setStatus('Generating a zero-knowledge proof locally...');
      const { groth16 } = await import('snarkjs');
      const result = await groth16.fullProve({ root: path.root.toString(), nullifierHash: nullifierHash.toString(), newCommitment: BigInt(recipient.commitment).toString(), secret: note.secret, nullifier: note.nullifier, recipientSecret: recipient.secret, recipientNullifier: recipient.nullifier, pathElements: path.pathElements, pathIndices: path.pathIndices }, wasmUrl, zkeyUrl);
      const payload = { pA: [result.proof.pi_a[0], result.proof.pi_a[1]], pB: [[result.proof.pi_b[0][1], result.proof.pi_b[0][0]], [result.proof.pi_b[1][1], result.proof.pi_b[1][0]]], pC: [result.proof.pi_c[0], result.proof.pi_c[1]], root: toHex(path.root, { size: 32 }), nullifierHash: toHex(nullifierHash, { size: 32 }), newCommitment: recipient.commitment, encryptedNote };
      setStatus('Submitting proof through the relayer...');
      const response = await fetch('/api/relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Relayer rejected the proof.');
      await client.waitForTransactionReceipt({ hash: data.hash });
      persist(notes.map(item => item.commitment === note.commitment ? { ...item, spent: true } : item));
      setStatus(`Private transfer complete via relayer. ${data.hash.slice(0, 10)}...`);
    } catch (error) { setStatus(displayError(error)); } finally { setBusy(false); }
  }

  async function withdraw() {
    if (!pool || !withdrawWasmUrl || !withdrawZkeyUrl) return setStatus('Withdrawal artifacts are not configured for this pool.');
    if (!isAddress(withdrawRecipient)) return setStatus('Enter a valid Monad wallet address for the withdrawal.');
    const note = notes.find(item => !item.spent);
    if (!note) return setStatus('No unspent local note is available.');
    setBusy(true);
    try {
      setStatus('Building withdrawal proof locally...');
      const leaves = await poolLeaves();
      const path = await merklePath(leaves, note.commitment);
      const recipient = getAddress(withdrawRecipient);
      const nullifierHash = await hash2(note.nullifier, 1n);
      const withdrawalRecipientHash = await hash2(BigInt(recipient), 0n);
      const { groth16 } = await import('snarkjs');
      const result = await groth16.fullProve({ root: path.root.toString(), nullifierHash: nullifierHash.toString(), withdrawalRecipientHash: withdrawalRecipientHash.toString(), secret: note.secret, nullifier: note.nullifier, withdrawalRecipient: BigInt(recipient).toString(), pathElements: path.pathElements, pathIndices: path.pathIndices }, withdrawWasmUrl, withdrawZkeyUrl);
      const payload = { action: 'withdraw', pA: [result.proof.pi_a[0], result.proof.pi_a[1]], pB: [[result.proof.pi_b[0][1], result.proof.pi_b[0][0]], [result.proof.pi_b[1][1], result.proof.pi_b[1][0]]], pC: [result.proof.pi_c[0], result.proof.pi_c[1]], root: toHex(path.root, { size: 32 }), nullifierHash: toHex(nullifierHash, { size: 32 }), recipient };
      setStatus('Relayer is submitting the withdrawal...');
      const response = await fetch('/api/relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Relayer rejected the withdrawal.');
      await client.waitForTransactionReceipt({ hash: data.hash });
      persist(notes.map(item => item.commitment === note.commitment ? { ...item, spent: true } : item));
      setStatus(`Withdrawal complete. 1 MON was sent to ${recipient.slice(0, 6)}...${recipient.slice(-4)}.`);
    } catch (error) { setStatus(displayError(error)); } finally { setBusy(false); }
  }
  return (
    <main className="shell grid-bg overflow-x-hidden px-4 py-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-3 text-xl font-bold"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500">G</span>Ghostify</a>
          <div className="flex flex-wrap gap-2"><button className="rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-sm font-semibold text-violet-200" onClick={connect}>{wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Connect wallet'}</button>{wallet && <button className="rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-slate-300" onClick={disconnect}>Disconnect</button>}</div>
        </header>
        <section className="mt-10 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
          <div className="panel min-w-0 rounded-3xl p-6 sm:p-9">
            <p className="text-sm font-medium text-violet-300">SHIELDED POOL</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Private 1 MON notes</h1>
            <div className="mt-7 rounded-2xl border border-white/10 bg-black/20 p-5"><p className="font-semibold">1. Deposit</p><p className="mt-1 text-sm text-slate-500">Publicly deposit one MON; a private note remains in your browser.</p><button className="primary mt-4 w-full" disabled={busy || !pool || !wallet} onClick={deposit}>Deposit 1 MON</button></div>
            <div className="mt-5 min-w-0 rounded-2xl border border-white/10 bg-black/20 p-5"><p className="font-semibold">2. Private send</p><p className="mt-1 text-sm text-slate-500">Paste the receiver key, prove note ownership locally, then relay the transfer.</p><input className="field mt-4 min-w-0 font-mono text-xs" placeholder="Receiver shielded public key (0x04...)" value={receiver} onChange={event => setReceiver(event.target.value)} /><button className="primary mt-4 w-full" disabled={busy || !wasmUrl || !zkeyUrl} onClick={privateSend}>{busy ? 'Working...' : 'Prove and send privately'}</button></div>
            {withdrawWasmUrl && withdrawZkeyUrl && <div className="mt-5 min-w-0 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5"><p className="font-semibold">3. Withdraw to wallet</p><p className="mt-1 text-sm text-slate-400">Prove ownership locally and withdraw 1 MON. The destination wallet is public; the spent note remains hidden.</p><input className="field mt-4 min-w-0 font-mono text-xs" placeholder="Monad wallet address (0x...)" value={withdrawRecipient} onChange={event => setWithdrawRecipient(event.target.value)} /><button className="primary mt-4 w-full" disabled={busy} onClick={withdraw}>{busy ? 'Working...' : 'Withdraw 1 MON'}</button></div>}
            {status && <p role="status" className="mt-5 overflow-hidden break-words rounded-xl border border-white/10 bg-white/5 p-3 text-sm leading-6 text-slate-300">{status}</p>}
          </div>
          <aside className="panel min-w-0 rounded-3xl p-6 sm:p-9"><p className="text-sm font-medium text-violet-300">RECEIVE</p><h2 className="mt-2 text-2xl font-bold">Your shielded receive key</h2><p className="mt-2 text-sm leading-6 text-slate-400">Share this public key with a sender. It is not your wallet address.</p><p className="mt-4 break-all rounded-xl bg-black/20 p-3 font-mono text-xs leading-5 text-violet-200">{profile?.publicKey || 'Creating local key...'}</p><button className="mt-4 w-full rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 text-sm font-semibold text-violet-200" disabled={busy} onClick={scan}>Scan for private notes</button><div className="mt-7 flex items-center justify-between gap-3"><h3 className="font-semibold">Local notes</h3><span className="text-sm text-slate-400">{notes.filter(note => !note.spent).length} spendable</span></div><div className="mt-3 space-y-3">{notes.length ? notes.map(note => <div key={note.commitment} className="rounded-xl border border-white/10 bg-white/5 p-3"><p className={note.spent ? 'text-slate-500' : 'text-emerald-300'}>{note.spent ? 'Spent note' : '1 shielded MON'}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{note.commitment}</p></div>) : <p className="text-sm text-slate-500">No local notes yet.</p>}</div><div className="mt-7 rounded-xl border border-violet-400/15 bg-violet-400/5 p-4 text-xs leading-5 text-violet-200">Testnet only. Back up browser data before depositing. Withdrawals appear only after a withdrawal-capable pool and its verified artifacts are configured.</div></aside>
        </section>
      </div>
    </main>
  );
}