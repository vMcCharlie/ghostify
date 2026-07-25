'use client';
import { useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, custom, decodeEventLog, formatEther, getAddress, http, isAddress, parseEther, toHex } from 'viem';
import { monadTestnet, SHIELDED_POOL_ABI } from '@/lib/chain';
import { createShieldedNote, hash2, loadNotes, merklePath, saveNotes, type ShieldedNote } from '@/lib/shielded';

const pool = process.env.NEXT_PUBLIC_SHIELDED_POOL_ADDRESS as `0x${string}` | undefined;
const protocolV3 = process.env.NEXT_PUBLIC_PROTOCOL_VERSION === 'v3';
const depositWasmUrl = process.env.NEXT_PUBLIC_DEPOSIT_ZK_WASM_URL; const depositZkeyUrl = process.env.NEXT_PUBLIC_DEPOSIT_ZK_ZKEY_URL;
const withdrawWasmUrl = process.env.NEXT_PUBLIC_WITHDRAW_ZK_WASM_URL; const withdrawZkeyUrl = process.env.NEXT_PUBLIC_WITHDRAW_ZK_ZKEY_URL;
const poolStartBlock = BigInt(process.env.NEXT_PUBLIC_SHIELDED_POOL_START_BLOCK || '0');
const logQueryBlockRange = 100n;
const client = createPublicClient({ chain: monadTestnet, transport: http(undefined, { retryCount: 0 }) });
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const isRateLimit = (error: unknown) => /limited to|rate limit|too many requests|429/i.test(error instanceof Error ? error.message : String(error));
const displayError = (error: unknown) => isRateLimit(error) ? 'Monad RPC is busy. Ghostify slowed down and retried; please try again.' : error instanceof Error ? error.message : 'The request could not be completed.';
const proof = (result: any) => ({ pA: [result.proof.pi_a[0], result.proof.pi_a[1]], pB: [[result.proof.pi_b[0][1], result.proof.pi_b[0][0]], [result.proof.pi_b[1][1], result.proof.pi_b[1][0]]], pC: [result.proof.pi_c[0], result.proof.pi_c[1]] });
async function fullProveWithTimeout(input: Record<string, unknown>, wasm: string, zkey: string) {
  const { groth16 } = await import('snarkjs');
  let timer: number | undefined;
  try {
    return await Promise.race([
      groth16.fullProve(input, wasm, zkey),
      new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error('Proof generation timed out after 90 seconds. Reload Ghostify and try once more; if it repeats, check that the V3 artifact URLs are deployed.')), 90_000); }),
    ]);
  } finally { if (timer) window.clearTimeout(timer); }
}

type PoolEvent = { eventName: 'Deposit' | 'PrivateTransfer'; args: Record<string, any>; blockNumber: bigint; logIndex: bigint };
type PoolCache = { latest: string; events: Array<{ eventName: PoolEvent['eventName']; args: Record<string, any>; blockNumber: string; logIndex: string }> };
const poolCacheKey = `ghostify-v3-pool-events-${pool || 'unconfigured'}-${poolStartBlock}`;
function readPoolCache(): PoolCache { if (typeof window === 'undefined') return { latest: (poolStartBlock - 1n).toString(), events: [] }; try { return JSON.parse(localStorage.getItem(poolCacheKey) || '') as PoolCache; } catch { return { latest: (poolStartBlock - 1n).toString(), events: [] }; } }
function writePoolCache(cache: PoolCache) { localStorage.setItem(poolCacheKey, JSON.stringify(cache, (_, value) => typeof value === 'bigint' ? value.toString() : value)); }
async function poolEvents() {
  const cache = readPoolCache(); const latest = await client.getBlockNumber(); let start = BigInt(cache.latest) + 1n;
  for (; start <= latest; start += logQueryBlockRange) {
    const end = start + logQueryBlockRange - 1n > latest ? latest : start + logQueryBlockRange - 1n;
    for (let attempt = 0; ; attempt += 1) try {
      const logs = await client.getLogs({ address: pool!, fromBlock: start, toBlock: end });
      for (const log of logs) try { const decoded = decodeEventLog({ abi: SHIELDED_POOL_ABI, data: log.data, topics: log.topics }); if (decoded.eventName === 'Deposit' || decoded.eventName === 'PrivateTransfer') cache.events.push({ eventName: decoded.eventName, args: decoded.args as Record<string, any>, blockNumber: log.blockNumber.toString(), logIndex: log.logIndex.toString() }); } catch { /* Ignore unknown pool logs. */ }
      break;
    } catch (error) { if (!isRateLimit(error) || attempt === 4) throw error; await pause(500 * (attempt + 1)); }
    cache.latest = end.toString(); writePoolCache(cache); await pause(125);
  }
  return cache.events.map(event => ({ ...event, blockNumber: BigInt(event.blockNumber), logIndex: BigInt(event.logIndex) }));
}

export default function ShieldedPoolPage() {
  const [wallet, setWallet] = useState(''); const [notes, setNotes] = useState<ShieldedNote[]>([]); const [receiver, setReceiver] = useState(''); const [amount, setAmount] = useState('1'); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false); const [buttonLabel, setButtonLabel] = useState('Send privately'); const [success, setSuccess] = useState<{ amount: string; recipient: string } | null>(null);
  useEffect(() => { setNotes(loadNotes()); }, []);
  const persist = (next: ShieldedNote[]) => { setNotes(next); saveNotes(next); };
  const configured = protocolV3 && !!pool && !!depositWasmUrl && !!depositZkeyUrl && !!withdrawWasmUrl && !!withdrawZkeyUrl;

  async function connect() { if (!window.ethereum) return setStatus('Install or unlock a wallet such as MetaMask.'); try { const wc = createWalletClient({ chain: monadTestnet, transport: custom(window.ethereum) }); const [account] = await wc.requestAddresses(); if (await wc.getChainId() !== monadTestnet.id) throw new Error('Switch to Monad Testnet (chain 10143).'); setWallet(account); setStatus('Wallet connected.'); } catch (error) { setStatus(displayError(error)); } }
  function disconnect() { setWallet(''); setStatus('Disconnected from Ghostify. MetaMask remains connected until you revoke it in the wallet.'); }
  async function poolLeaves() { const events = await poolEvents(); return events.map(log => ({ commitment: log.eventName === 'Deposit' ? log.args.commitment : log.args.newCommitment, block: log.blockNumber, index: log.logIndex })).sort((a, b) => a.block === b.block ? Number(a.index - b.index) : a.block < b.block ? -1 : 1).map(item => item.commitment); }
  function selectedNote() { return notes.find(note => !note.spent); }

  async function sendNow() {
    if (!configured) return setStatus('Ghostify is still being configured.');
    if (!wallet) return setStatus('Connect your wallet first.');
    if (!isAddress(receiver.trim())) return setStatus('Enter a valid recipient wallet address.');
    let value: bigint; try { value = parseEther(amount); if (value <= 0n) throw new Error(); } catch { return setStatus('Enter a valid MON amount.'); }
    const recipient = getAddress(receiver.trim());
    const existing = selectedNote();
    if (existing && BigInt(existing.amount) !== value) return setStatus(`A ${formatEther(BigInt(existing.amount))} MON payment is pending. Enter that amount to finish it.`);
    setSuccess(null);
    setButtonLabel('Checking recipient...');
    setBusy(true);
    try {
      let storedNotes = notes;
      let note = existing;
      if (!note) {
        setButtonLabel('Preparing payment...');
        setStatus('Preparing your payment...');
        note = await createShieldedNote(value);
        const depositProof = await fullProveWithTimeout({ commitment: BigInt(note.commitment).toString(), amount: value.toString(), secret: note.secret, nullifier: note.nullifier }, depositWasmUrl!, depositZkeyUrl!);
        const wc = createWalletClient({ chain: monadTestnet, transport: custom(window.ethereum!) });
        setButtonLabel('Confirm in wallet...');
        setStatus('Confirm the payment in your wallet.');
        const depositHash = await wc.writeContract({ account: wallet as `0x${string}`, address: pool!, abi: SHIELDED_POOL_ABI, functionName: 'deposit', args: [...Object.values(proof(depositProof)), note.commitment] as any, value });
        await client.waitForTransactionReceipt({ hash: depositHash });
        storedNotes = [...notes, note];
        persist(storedNotes);
      }
      setButtonLabel('Securing payment...');
      setStatus('Securing your payment...');
      const path = await merklePath(await poolLeaves(), note.commitment);
      const delay = 1_000 + Math.floor(Math.random() * 2_001);
      setStatus(`Sending securely in ${Math.ceil(delay / 1000)} seconds. Keep this tab open.`);
      await pause(delay);
      setButtonLabel('Finalizing payment...');
      setStatus('Finalizing your payment...');
      const nullifierHash = await hash2(note.nullifier, 1n);
      const recipientHash = await hash2(BigInt(recipient), 0n);
      const withdrawalProof = await fullProveWithTimeout({ root: path.root.toString(), nullifierHash: nullifierHash.toString(), withdrawalRecipientHash: recipientHash.toString(), amount: note.amount, secret: note.secret, nullifier: note.nullifier, withdrawalRecipient: BigInt(recipient).toString(), pathElements: path.pathElements, pathIndices: path.pathIndices }, withdrawWasmUrl!, withdrawZkeyUrl!);
      const response = await fetch('/api/relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'withdraw', ...proof(withdrawalProof), root: toHex(path.root, { size: 32 }), nullifierHash: toHex(nullifierHash, { size: 32 }), recipient, amount: note.amount }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Relayer rejected the payment.');
      await client.waitForTransactionReceipt({ hash: data.hash });
      persist(storedNotes.map(item => item.commitment === note!.commitment ? { ...item, spent: true } : item));
      setButtonLabel('Payment sent');
      setSuccess({ amount: formatEther(BigInt(note.amount)), recipient });
      setStatus('');
    } catch (error) { setButtonLabel('Try again'); setStatus(displayError(error)); } finally { setBusy(false); }
  }
  const balance = notes.filter(note => !note.spent).reduce((total, note) => total + BigInt(note.amount), 0n);
  return <main className="consumer-shell"><header className="consumer-nav"><a href="#top" className="brand"><img src="/ghostify.png" alt="Ghostify" />Ghostify</a><div className="nav-actions"><button className="button button-quiet" onClick={wallet ? disconnect : connect}>{wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Connect wallet'}</button></div></header><section id="top" className="hero"><p className="eyebrow">PRIVATE PAYMENTS ON MONAD</p><h1>Incognito <img className="hero-logo" src="/ghostify.png" alt="Ghostify" /> mode<br />for your money.</h1><p className="hero-copy">Ghostify routes your payment through encrypted pools, then delivers it to their wallet.</p></section>{!configured && <p className="notice">Ghostify is still being configured. Please try again after deployment.</p>}<section id="send" className="single-flow"><div className="payment-heading"><div><p className="step-label">PRIVATE SEND</p><h2>You&apos;re sending</h2></div></div><div className="amount-row"><input className="amount-input" aria-label="Amount in MON" inputMode="decimal" placeholder="0.00" value={amount} onChange={event => setAmount(event.target.value)} /><span>MON</span></div><label className="recipient-label">Send to<input className="consumer-field" placeholder="Recipient wallet address (0x...)" value={receiver} onChange={event => setReceiver(event.target.value)} /></label><button className={`button button-main ${success ? 'button-success' : ''}`} disabled={busy || !configured} onClick={wallet ? sendNow : connect}>{wallet ? buttonLabel : 'Connect wallet'}</button><p className="fine-print">Private payments on Monad Testnet.</p></section>{status && <p role="status" className="status-banner">{status}</p>}{success && <div className="success-backdrop" role="dialog" aria-modal="true" aria-labelledby="success-title"><section className="success-modal"><div className="success-check">✓</div><p className="step-label">PAYMENT COMPLETE</p><h2 id="success-title">Sent privately</h2><p>{success.amount} MON is on its way to <b>{success.recipient.slice(0, 6)}...{success.recipient.slice(-4)}</b>.</p><button className="button button-main button-success" onClick={() => { setSuccess(null); setButtonLabel('Send privately'); }}>Done</button></section></div>}<footer>Ghostify - Monad Testnet - Testnet funds only</footer></main>;
}