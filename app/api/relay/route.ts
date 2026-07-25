import { NextResponse } from 'next/server';
import { createWalletClient, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet, SHIELDED_POOL_ABI } from '@/lib/chain';

export const runtime = 'nodejs';
const pool = process.env.NEXT_PUBLIC_SHIELDED_POOL_ADDRESS as `0x${string}` | undefined;
const hasProof = (body: Record<string, unknown>) => Array.isArray(body.pA) && Array.isArray(body.pB) && Array.isArray(body.pC) && typeof body.root === 'string' && typeof body.nullifierHash === 'string';

export async function POST(request: Request) {
  try {
    if (!pool || !process.env.RELAYER_PRIVATE_KEY) return NextResponse.json({ error: 'Relayer is not configured.' }, { status: 503 });
    const body = await request.json() as Record<string, unknown>;
    if (!hasProof(body)) return NextResponse.json({ error: 'Invalid proof payload.' }, { status: 400 });
    const key = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;
    const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
    const wallet = createWalletClient({ account, chain: monadTestnet, transport: http() });
    const args = body.action === 'withdraw'
      ? isAddress(body.recipient as string) && typeof body.amount === 'string' && /^\d+$/.test(body.amount)
        ? [body.pA, body.pB, body.pC, body.root, body.nullifierHash, body.recipient, BigInt(body.amount)] as const
        : null
      : typeof body.newCommitment === 'string' && typeof body.encryptedNote === 'string'
        ? [body.pA, body.pB, body.pC, body.root, body.nullifierHash, body.newCommitment, body.encryptedNote] as const
        : null;
    if (!args) return NextResponse.json({ error: 'Invalid proof payload.' }, { status: 400 });
    const hash = body.action === 'withdraw'
      ? await wallet.writeContract({ account, address: pool, abi: SHIELDED_POOL_ABI, functionName: 'privateWithdraw', args: args as any })
      : await wallet.writeContract({ account, address: pool, abi: SHIELDED_POOL_ABI, functionName: 'privateTransfer', args: args as any });
    return NextResponse.json({ hash });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Relay failed.' }, { status: 500 }); }
}