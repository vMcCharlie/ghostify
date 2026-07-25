import { writeFileSync } from 'node:fs';
import { buildMimc7 } from 'circomlibjs';
const output = process.argv[2] || 'circuits/test_input.json';
const mimc = await buildMimc7();
const asString = value => mimc.F.toString(value);
const hash = (left, right) => asString(mimc.hash(left, right));
let root = hash(11, 22);
for (let level = 0; level < 3; level++) root = hash(root, 0);
writeFileSync(output, JSON.stringify({ root, nullifierHash: hash(22, 1), newCommitment: hash(33, 44), secret: '11', nullifier: '22', recipientSecret: '33', recipientNullifier: '44', pathElements: ['0', '0', '0'], pathIndices: ['0', '0', '0'] }, null, 2));
