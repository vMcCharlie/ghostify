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
template ShieldedWithdraw(levels) {
    signal input root; signal input nullifierHash; signal input withdrawalRecipientHash; signal input amount;
    signal input secret; signal input nullifier; signal input withdrawalRecipient;
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
    component recipient = Hash2(); recipient.left <== withdrawalRecipient; recipient.right <== 0; withdrawalRecipientHash === recipient.out;
}
component main {public [root, nullifierHash, withdrawalRecipientHash, amount]} = ShieldedWithdraw(3);