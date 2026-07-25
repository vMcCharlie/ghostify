# Shielded Pool V1 — testnet build

This is a **fixed 1 MON note pool**. It protects the link between a deposited note and a later private transfer within the pool. It does not hide a public deposit, browser/RPC metadata, or a future withdrawal to a public wallet.

## Privacy model

A deposit is public: `wallet -> pool, 1 MON`. A private transfer proves, in zero knowledge, that the sender owns one unspent note in the pool Merkle tree. It publishes only a nullifier and a new output commitment. The recipient receives the note secrets through an encrypted off-chain channel; no normal wallet address appears in the pool transfer.

`ShieldedPool.sol` intentionally has no public withdrawal method. A withdrawal circuit and relayer are separate work: a direct withdrawal to a primary wallet reveals that destination.

## Components

- `circuits/shielded_spend.circom`: Groth16 circuit, depth-3 MiMC Merkle membership, nullifier, and replacement note commitment.
- `contracts/src/ShieldedPool.sol`: 1 MON pool, MiMC incremental tree, root history, nullifier protection, and proof-gated private transfer.
- `contracts/src/ShieldedSpendVerifier.sol`: generated only by the local **test ceremony** and never suitable for production.

## Test flow on Linux/macOS

Use a real Circom 2 compiler. The Windows WASM compiler used in this workspace can compile R1CS but cannot emit the witness WASM artifact.

```bash
circom circuits/shielded_spend.circom --r1cs --wasm --sym -o build
snarkjs powersoftau new bn128 12 build/pot12_0000.ptau
snarkjs powersoftau contribute build/pot12_0000.ptau build/pot12_0001.ptau --name="test contributor" -e="fresh entropy"
snarkjs powersoftau prepare phase2 build/pot12_0001.ptau build/pot12_final.ptau
snarkjs groth16 setup build/shielded_spend.r1cs build/pot12_final.ptau build/spend_0000.zkey
snarkjs zkey contribute build/spend_0000.zkey build/spend_final.zkey --name="test contributor" -e="fresh entropy"
snarkjs zkey export verificationkey build/spend_final.zkey build/verification_key.json
snarkjs zkey export solidityverifier build/spend_final.zkey contracts/src/ShieldedSpendVerifier.sol
```

Then generate a deposit note locally (`secret`, `nullifier`), calculate its MiMC commitment and Merkle path, generate a recipient note, and call `snarkjs groth16 fullprove`. Verify locally with `snarkjs groth16 verify`, then deploy the generated verifier, MiMC7 contract, and `ShieldedPool`.

## Required production work

- Independent multi-party trusted setup; never use the local test ceremony.
- Audited MiMC/Poseidon implementation, circuit, verifier, pool, encrypted-note format, and relayer.
- A much larger tree/anonymity set, root-history policy, anti-DoS/rate limiting, and private transport.
- A withdrawal circuit with explicit recipient/linkability warnings and a relayer network.
- Security review before any funds beyond disposable test MON.

### Deploy the test stack

After the native ceremony exports `contracts/src/ShieldedSpendVerifier.sol`, set a disposable testnet key and run:

```powershell
$env:PRIVATE_KEY='0xyour_testnet_key'
node scripts/deploy-shielded-pool.mjs
```

The script deploys the generated Groth16 verifier, the matching MiMC7 hash contract, and `ShieldedPool` in order. It prints all three addresses. Never reuse this local test ceremony or its verifier for a production deployment.
