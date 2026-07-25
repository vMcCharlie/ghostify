'use client';
import { useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, custom, decodeEventLog, formatEther, getAddress, http, isAddress, parseEther, toHex } from 'viem';
import { monadTestnet, RECEIVE_KEY_REGISTRY_ABI, SHIELDED_POOL_ABI } from '@/lib/chain';
import { createShieldedNote, decryptNote, encryptNote, getOrCreateProfile, hash2, loadNotes, merklePath, saveNotes, type ReceiveProfile, type ShieldedNote } from '@/lib/shielded';

const pool = process.env.NEXT_PUBLIC_SHIELDED_POOL_ADDRESS as `0x${string}` | undefined;
const registry = process.env.NEXT_PUBLIC_RECEIVE_KEY_REGISTRY_ADDRESS as `0x${string}` | undefined;
const protocolV3 = process.env.NEXT_PUBLIC_PROTOCOL_VERSION === 'v3';
const depositWasmUrl = process.env.NEXT_PUBLIC_DEPOSIT_ZK_WASM_URL; const depositZkeyUrl = process.env.NEXT_PUBLIC_DEPOSIT_ZK_ZKEY_URL;
const spendWasmUrl = process.env.NEXT_PUBLIC_ZK_WASM_URL; const spendZkeyUrl = process.env.NEXT_PUBLIC_ZK_ZKEY_URL;
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
  const [wallet, setWallet] = useState(''); const [notes, setNotes] = useState<ShieldedNote[]>([]); const [profile, setProfile] = useState<ReceiveProfile | null>(null); const [receiver, setReceiver] = useState(''); const [amount, setAmount] = useState('1'); const [withdrawRecipient, setWithdrawRecipient] = useState(''); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { setNotes(loadNotes()); setProfile(getOrCreateProfile()); }, []);
  const persist = (next: ShieldedNote[]) => { setNotes(next); saveNotes(next); };
  const configured = protocolV3 && !!pool && !!depositWasmUrl && !!depositZkeyUrl && !!spendWasmUrl && !!spendZkeyUrl && !!withdrawWasmUrl && !!withdrawZkeyUrl;

  async function connect() { if (!window.ethereum) return setStatus('Install or unlock a wallet such as MetaMask.'); try { const wc = createWalletClient({ chain: monadTestnet, transport: custom(window.ethereum) }); const [account] = await wc.requestAddresses(); if (await wc.getChainId() !== monadTestnet.id) throw new Error('Switch to Monad Testnet (chain 10143).'); setWallet(account); setStatus('Wallet connected.'); } catch (error) { setStatus(displayError(error)); } }
  function disconnect() { setWallet(''); setStatus('Disconnected from Ghostify. MetaMask remains connected until you revoke it in the wallet.'); }
  async function poolLeaves() { const events = await poolEvents(); return events.map(log => ({ commitment: log.eventName === 'Deposit' ? log.args.commitment : log.args.newCommitment, block: log.blockNumber, index: log.logIndex })).sort((a, b) => a.block === b.block ? Number(a.index - b.index) : a.block < b.block ? -1 : 1).map(item => item.commitment); }
  function selectedNote() { return notes.find(note => !note.spent); }

  async function deposit() {
    if (!configured) return setStatus('V3 is not configured yet. Use the deployment checklist before depositing.'); if (!wallet) return setStatus('Connect your wallet first.');
    let value: bigint; try { value = parseEther(amount); if (value <= 0n) throw new Error(); } catch { return setStatus('Enter a valid MON amount greater than zero.'); }
    setBusy(true); try { setStatus('Creating your note and generating a deposit proof locally (usually 5-30 seconds)...'); const note = await createShieldedNote(value); const result = await fullProveWithTimeout({ commitment: BigInt(note.commitment).toString(), amount: value.toString(), secret: note.secret, nullifier: note.nullifier }, depositWasmUrl!, depositZkeyUrl!); const wc = createWalletClient({ chain: monadTestnet, transport: custom(window.ethereum!) }); setStatus('Confirm the MON deposit in your wallet...'); const hash = await wc.writeContract({ account: wallet as `0x${string}`, address: pool!, abi: SHIELDED_POOL_ABI, functionName: 'deposit', args: [...Object.values(proof(result)), note.commitment] as any, value }); await client.waitForTransactionReceipt({ hash }); persist([...notes, note]); setStatus(`Deposit confirmed. ${formatEther(value)} MON note stored locally.`); } catch (error) { setStatus(displayError(error)); } finally { setBusy(false); }
  }

  async function scan() { if (!configured || !profile) return setStatus('V3 is not configured yet.'); setBusy(true); try { setStatus('Loading recent encrypted transfer activity...'); const logs = (await poolEvents()).filter(log => log.eventName === 'PrivateTransfer'); const incoming = (await Promise.all(logs.map(log => decryptNote(log.args.encryptedNote!, profile)))).filter((note): note is ShieldedNote => note !== null); const next = [...notes]; for (const note of incoming) if (!next.some(existing => existing.commitment.toLowerCase() === note.commitment.toLowerCase())) next.push(note); persist(next); setStatus(incoming.length ? `${incoming.length} private note(s) found.` : 'No new private notes found.'); } catch (error) { setStatus(displayError(error)); } finally { setBusy(false); } }

  async function enableReceiving() {
    if (!wallet) return setStatus('Connect the wallet that should receive private payments.');
    if (!registry || !profile) return setStatus('Receive directory is not configured.');
    setBusy(true); try { setStatus('Confirm private receiving for this wallet...'); const wc = createWalletClient({ chain: monadTestnet, transport: custom(window.ethereum!) }); const hash = await wc.writeContract({ account: wallet as `0x${string}`, address: registry, abi: RECEIVE_KEY_REGISTRY_ABI, functionName: 'register', args: [profile.publicKey] }); await client.waitForTransactionReceipt({ hash }); setStatus('Private receiving is enabled. Friends can now use your wallet address.'); } catch (error) { setStatus(displayError(error)); } finally { setBusy(false); }
  }

  async function resolveReceiver(value: string): Promise<`0x${string}`> {
    if (/^0x04[0-9a-fA-F]{128}$/.test(value)) return value as `0x${string}`;
    if (!isAddress(value)) throw new Error('Enter a recipient wallet address.');
    if (!registry) throw new Error('Receive directory is not configured.');
    const key = await client.readContract({ address: registry, abi: RECEIVE_KEY_REGISTRY_ABI, functionName: 'keyOf', args: [getAddress(value)] });
    if (!/^0x04[0-9a-fA-F]{128}$/.test(key)) throw new Error('This wallet has not enabled private receiving yet.');
    return key as `0x${string}`;
  }
  async function privateSend() { if (!configured) return setStatus('V3 is not configured yet.'); if (!receiver.trim()) return setStatus('Enter a recipient wallet address.'); const note = selectedNote(); if (!note) return setStatus('Add money to your private balance first.'); let requested: bigint; try { requested = parseEther(amount); } catch { return setStatus('Enter a valid MON amount.'); } if (requested !== BigInt(note.amount)) return setStatus('This prototype sends one complete note. Enter the exact available balance.'); setBusy(true); try { setStatus('Loading pool activity and constructing your private path...'); const path = await merklePath(await poolLeaves(), note.commitment); setStatus('Building a private transfer proof locally (usually 5-30 seconds)...'); const receiverKey = await resolveReceiver(receiver.trim()); const recipient = await createShieldedNote(note.amount); const nullifierHash = await hash2(note.nullifier, 1n); const encryptedNote = await encryptNote(recipient, receiverKey); const result = await fullProveWithTimeout({ root: path.root.toString(), nullifierHash: nullifierHash.toString(), newCommitment: BigInt(recipient.commitment).toString(), secret: note.secret, nullifier: note.nullifier, amount: note.amount, recipientSecret: recipient.secret, recipientNullifier: recipient.nullifier, pathElements: path.pathElements, pathIndices: path.pathIndices }, spendWasmUrl!, spendZkeyUrl!); const response = await fetch('/api/relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...proof(result), root: toHex(path.root, { size: 32 }), nullifierHash: toHex(nullifierHash, { size: 32 }), newCommitment: recipient.commitment, encryptedNote }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Relayer rejected the proof.'); await client.waitForTransactionReceipt({ hash: data.hash }); persist(notes.map(item => item.commitment === note.commitment ? { ...item, spent: true } : item)); setStatus(`Private transfer complete. ${formatEther(BigInt(note.amount))} MON moved as a hidden note.`); } catch (error) { setStatus(displayError(error)); } finally { setBusy(false); } }

  async function withdraw() { if (!configured) return setStatus('V3 is not configured yet.'); if (!wallet) return setStatus('Connect the wallet you want to withdraw to.'); const note = selectedNote(); if (!note) return setStatus('Add money to your private balance first.'); setBusy(true); try { setStatus('Loading pool activity and constructing your private path...'); const path = await merklePath(await poolLeaves(), note.commitment); setStatus('Building a withdrawal proof locally (usually 5-30 seconds)...'); const recipient = getAddress(wallet); const nullifierHash = await hash2(note.nullifier, 1n); const recipientHash = await hash2(BigInt(recipient), 0n); const result = await fullProveWithTimeout({ root: path.root.toString(), nullifierHash: nullifierHash.toString(), withdrawalRecipientHash: recipientHash.toString(), amount: note.amount, secret: note.secret, nullifier: note.nullifier, withdrawalRecipient: BigInt(recipient).toString(), pathElements: path.pathElements, pathIndices: path.pathIndices }, withdrawWasmUrl!, withdrawZkeyUrl!); const response = await fetch('/api/relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'withdraw', ...proof(result), root: toHex(path.root, { size: 32 }), nullifierHash: toHex(nullifierHash, { size: 32 }), recipient, amount: note.amount }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Relayer rejected the withdrawal.'); await client.waitForTransactionReceipt({ hash: data.hash }); persist(notes.map(item => item.commitment === note.commitment ? { ...item, spent: true } : item)); setStatus(`Withdrawal complete. ${formatEther(BigInt(note.amount))} MON was sent to ${recipient.slice(0, 6)}...${recipient.slice(-4)}.`); } catch (error) { setStatus(displayError(error)); } finally { setBusy(false); } }

  async function sendNow() {
    if (!configured) return setStatus('Ghostify is still being configured.');
    if (!wallet) return setStatus('Connect your wallet first.');
    if (!receiver.trim()) return setStatus('Enter the recipient wallet address.');
    let value: bigint; try { value = parseEther(amount); if (value <= 0n) throw new Error(); } catch { return setStatus('Enter a valid MON amount.'); }
    if (selectedNote()) return setStatus('Finish sending or withdrawing your existing private balance first.');
    setBusy(true);
    try {
      setStatus('Checking the recipient can receive privately...');
      const receiverKey = await resolveReceiver(receiver.trim());
      setStatus('Preparing your private payment...');
      const note = await createShieldedNote(value);
      const depositProof = await fullProveWithTimeout({ commitment: BigInt(note.commitment).toString(), amount: value.toString(), secret: note.secret, nullifier: note.nullifier }, depositWasmUrl!, depositZkeyUrl!);
      const wc = createWalletClient({ chain: monadTestnet, transport: custom(window.ethereum!) });
      setStatus('Confirm the deposit in your wallet...');
      const depositHash = await wc.writeContract({ account: wallet as `0x${string}`, address: pool!, abi: SHIELDED_POOL_ABI, functionName: 'deposit', args: [...Object.values(proof(depositProof)), note.commitment] as any, value });
      await client.waitForTransactionReceipt({ hash: depositHash });
      const afterDeposit = [...notes, note];
      persist(afterDeposit);
      setStatus('Routing your payment privately...');
      const path = await merklePath(await poolLeaves(), note.commitment);
      const recipient = await createShieldedNote(note.amount);
      const nullifierHash = await hash2(note.nullifier, 1n);
      const encryptedNote = await encryptNote(recipient, receiverKey);
      const transferProof = await fullProveWithTimeout({ root: path.root.toString(), nullifierHash: nullifierHash.toString(), newCommitment: BigInt(recipient.commitment).toString(), secret: note.secret, nullifier: note.nullifier, amount: note.amount, recipientSecret: recipient.secret, recipientNullifier: recipient.nullifier, pathElements: path.pathElements, pathIndices: path.pathIndices }, spendWasmUrl!, spendZkeyUrl!);
      const response = await fetch('/api/relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...proof(transferProof), root: toHex(path.root, { size: 32 }), nullifierHash: toHex(nullifierHash, { size: 32 }), newCommitment: recipient.commitment, encryptedNote }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Relayer rejected the payment.');
      await client.waitForTransactionReceipt({ hash: data.hash });
      persist(afterDeposit.map(item => item.commitment === note.commitment ? { ...item, spent: true } : item));
      setStatus('Payment sent privately.');
    } catch (error) { setStatus(displayError(error)); } finally { setBusy(false); }
  }
  const balance = notes.filter(note => !note.spent).reduce((total, note) => total + BigInt(note.amount), 0n);
  return <main className="consumer-shell"><header className="consumer-nav"><a href="#top" className="brand"><img src="/ghostify.png" alt="Ghostify" />Ghostify</a><div className="nav-actions"><button className="button button-quiet" onClick={wallet ? disconnect : connect}>{wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Connect wallet'}</button></div></header><section id="top" className="hero"><p className="eyebrow">PRIVATE PAYMENTS ON MONAD</p><h1>Send MON privately.</h1><p className="hero-copy">Enter a wallet address and amount. Ghostify deposits and routes the payment privately, step by step.</p></section>{!configured && <p className="notice">Ghostify is still being configured. Please try again after deployment.</p>}<section className="single-flow"><div className="step-label">PRIVATE PAYMENT</div><h2>Send money</h2><p>One private payment, from your wallet to theirs.</p><label>Recipient wallet address<input className="consumer-field" placeholder="0x..." value={receiver} onChange={event => setReceiver(event.target.value)} /></label><label>Amount in MON<input className="consumer-field" inputMode="decimal" placeholder="0.00" value={amount} onChange={event => setAmount(event.target.value)} /></label><button className="button button-main" disabled={busy || !configured || !wallet} onClick={sendNow}>{busy ? 'Processing payment...' : 'Send privately'}</button><p className="fine-print">The recipient must have enabled private receiving once. This testnet prototype sends one whole note per payment.</p></section>{status && <p role="status" className="status-banner">{status}</p>}<section className="how"><div><span>01</span><h3>Enter details</h3><p>Use the recipient’s normal Monad wallet address and your amount.</p></div><div><span>02</span><h3>Confirm once</h3><p>Approve the deposit in your wallet. Ghostify completes the private route.</p></div><div><span>03</span><h3>They receive</h3><p>The recipient checks their private balance and withdraws to their wallet.</p></div></section><footer>Ghostify · Monad Testnet · Testnet funds only</footer></main>;
}