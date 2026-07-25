import { buildMimc7 } from 'circomlibjs';
import { toHex } from 'viem';

export type ShieldedNote = { secret: string; nullifier: string; commitment: `0x${string}`; createdAt: number; spent?: boolean };
const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function randomField() {
  const bytes = crypto.getRandomValues(new Uint8Array(31));
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  return value % FIELD_SIZE;
}
export async function createShieldedNote(): Promise<ShieldedNote> {
  const secret = randomField(); const nullifier = randomField();
  const { buildMimc7 } = await import('circomlibjs');
  const mimc = await buildMimc7();
  const commitment = BigInt(mimc.F.toString(mimc.hash(secret, nullifier)));
  return { secret: secret.toString(), nullifier: nullifier.toString(), commitment: toHex(commitment, { size: 32 }), createdAt: Date.now() };
}
export function loadNotes() { if (typeof window === 'undefined') return [] as ShieldedNote[]; try { return JSON.parse(localStorage.getItem('ghostify-shielded-notes') || '[]') as ShieldedNote[]; } catch { return [] as ShieldedNote[]; } }
export function saveNotes(notes: ShieldedNote[]) { localStorage.setItem('ghostify-shielded-notes', JSON.stringify(notes)); }
