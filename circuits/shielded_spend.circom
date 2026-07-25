pragma circom 2.0.0;
include "../node_modules/circomlib/circuits/mimc.circom";

template Hash2() {
    signal input left; signal input right; signal output out;
    component h = MiMC7(91); h.x_in <== left; h.k <== right; out <== h.out;
}
template NoteCommitment() {
    signal input secret; signal input nullifier; signal input amount; signal output out;
    component secrets = Hash2(); secrets.left <== secret; secrets.right <== nullifier;
    component commitment = Hash2(); commitment.left <== secrets.out; commitment.right <== amount; out <== commitment.out;
}
template ShieldedSpend(levels) {
    signal input root; signal input nullifierHash; signal input newCommitment;
    signal input secret; signal input nullifier; signal input amount;
    signal input recipientSecret; signal input recipientNullifier;
    signal input pathElements[levels]; signal input pathIndices[levels];
    signal current[levels + 1]; signal left[levels]; signal right[levels]; component branch[levels];
    component leaf = NoteCommitment(); leaf.secret <== secret; leaf.nullifier <== nullifier; leaf.amount <== amount; current[0] <== leaf.out;
    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        left[i] <== current[i] + (pathElements[i] - current[i]) * pathIndices[i];
        right[i] <== pathElements[i] + (current[i] - pathElements[i]) * pathIndices[i];
        branch[i] = Hash2(); branch[i].left <== left[i]; branch[i].right <== right[i]; current[i + 1] <== branch[i].out;
    }
    root === current[levels];
    component spent = Hash2(); spent.left <== nullifier; spent.right <== 1; nullifierHash === spent.out;
    component outputNote = NoteCommitment(); outputNote.secret <== recipientSecret; outputNote.nullifier <== recipientNullifier; outputNote.amount <== amount; newCommitment === outputNote.out;
}
component main {public [root, nullifierHash, newCommitment]} = ShieldedSpend(3);