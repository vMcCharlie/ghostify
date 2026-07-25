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
template ShieldedDeposit() {
    signal input commitment; signal input amount; signal input secret; signal input nullifier;
    component note = NoteCommitment(); note.secret <== secret; note.nullifier <== nullifier; note.amount <== amount;
    commitment === note.out;
}
component main {public [commitment, amount]} = ShieldedDeposit();