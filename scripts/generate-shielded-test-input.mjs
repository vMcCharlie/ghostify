import { writeFileSync } from 'node:fs';
import { buildMimc7 } from 'circomlibjs';
const output = process.argv[2] || 'circuits/test_input.json';
const mode = process.argv[3] || 'spend';
const mimc = await buildMimc7();
const field = value => mimc.F.toString(value);
const hash = (left, right) => field(mimc.hash(left, right));
const hash3 = (one, two, three) => hash(hash(one, two), three);
const amount = '1000000000000000000';
const secret = '11'; const nullifier = '22'; const commitment = hash3(secret, nullifier, amount);
let root = commitment; for (let level = 0; level < 3; level++) root = hash(root, 0);
const base = { root, nullifierHash: hash(nullifier, 1), secret, nullifier, amount, pathElements: ['0', '0', '0'], pathIndices: ['0', '0', '0'] };
const input = mode === 'deposit' ? { commitment, amount, secret, nullifier }
  : mode === 'withdraw' ? { ...base, withdrawalRecipient: '4660', withdrawalRecipientHash: hash(4660, 0) }
  : { ...base, newCommitment: hash3(33, 44, amount), recipientSecret: '33', recipientNullifier: '44' };
writeFileSync(output, JSON.stringify(input, null, 2));