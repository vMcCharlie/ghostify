import { NextResponse } from 'next/server';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet, SHIELDED_POOL_ABI } from '@/lib/chain';

export const runtime = 'nodejs';
const pool = process.env.NEXT_PUBLIC_SHIELDED_POOL_ADDRESS as `0x${string}` | undefined;
export async function POST(request: Request) {
  try {
    if (!pool || !process.env.RELAYER_PRIVATE_KEY) return NextResponse.json({ error: 'Relayer is not configured.' }, { status: 503 });
    const body = await request.json();
    if (!Array.isArray(body.pA) || !Array.isArray(body.pB) || !Array.isArray(body.pC) || !body.root || !body.nullifierHash || !body.newCommitment || !body.encryptedNote) return NextResponse.json({ error: 'Invalid proof payload.' }, { status: 400 });
    const key = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;
    const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
    const wallet = createWalletClient({ account, chain: monadTestnet, transport: http() });
    const hash = await wallet.writeContract({ account, address: pool, abi: SHIELDED_POOL_ABI, functionName: 'privateTransfer', args: [body.pA, body.pB, body.pC, body.root, body.nullifierHash, body.newCommitment, body.encryptedNote] });
    return NextResponse.json({ hash });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Relay failed.' }, { status: 500 }); }
}
