# Ghostify

Ghostify is a testnet-only fixed-denomination shielded-note prototype for Monad. Users deposit exactly **1 MON** into an on-chain pool, then privately transfer a note using a Groth16 proof and relayer. Receiver notes are encrypted on-chain and decrypted only in the receiving browser.

> Do not use real funds. This is an unaudited, single-contribution test-ceremony prototype. Deposits are public, while the link between a deposited note and a later in-pool recipient note is hidden.

## Live Monad Testnet contracts

- ShieldedPool: [`0xad16d1a439a239adaa202d47ae1ae9661c656112`](https://testnet.monadvision.com/address/0xad16d1a439a239adaa202d47ae1ae9661c656112)
- Groth16 verifier: [`0x6fe4efe0e63620251cdd5c50a123db8e8ead3ebf`](https://testnet.monadvision.com/address/0x6fe4efe0e63620251cdd5c50a123db8e8ead3ebf)
- MiMC7: [`0x5cb7b35d0ff4ce325e68f4db4abb6cbca48aae7f`](https://testnet.monadvision.com/address/0x5cb7b35d0ff4ce325e68f4db4abb6cbca48aae7f)

## Flow

1. Receiver opens Ghostify and shares their displayed **shielded receive key**. It is a public encryption key, not a wallet address.
2. Sender deposits 1 MON. The pool receives the MON; the browser stores the note secret locally.
3. Sender proves ownership locally, creates an encrypted recipient note, and sends only the proof and encrypted note to the relayer.
4. The relayer pays gas and submits the proof-verified private transfer.
5. Receiver scans the pool and decrypts their note locally.

The sender note is marked spent only after the on-chain transfer receipt succeeds. If the proof or relay fails, it remains spendable.

## Local note safety

The pool holds the MON. Browser storage contains the private secrets needed to spend notes. Do not clear site data or switch browser profiles without a note backup; loss of those secrets can permanently remove access to a testnet note. Backup/import UX is the next required safety feature before wider testing.

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

## Vercel configuration

```text
NEXT_PUBLIC_SHIELDED_POOL_ADDRESS=0xad16d1a439a239adaa202d47ae1ae9661c656112
NEXT_PUBLIC_SHIELDED_POOL_START_BLOCK=48041968
NEXT_PUBLIC_LOG_QUERY_BLOCK_RANGE=10
NEXT_PUBLIC_ZK_WASM_URL=/zk/shielded_spend.wasm
NEXT_PUBLIC_ZK_ZKEY_URL=/zk/shielded_spend_final.zkey
NEXT_PUBLIC_WITHDRAW_ZK_WASM_URL=/zk/shielded_withdraw.wasm
NEXT_PUBLIC_WITHDRAW_ZK_ZKEY_URL=/zk/shielded_withdraw_final.zkey
NEXT_PUBLIC_MONAD_RPC_URL=<a browser-safe Monad RPC URL>
RELAYER_PRIVATE_KEY=<server-only testnet relayer key>
```

For Alchemy Monad Testnet free tier, set `NEXT_PUBLIC_LOG_QUERY_BLOCK_RANGE=10`; use a reliable browser-safe RPC provider for `NEXT_PUBLIC_MONAD_RPC_URL` in production; it is intentionally visible to the browser, so do not use a secret or privileged credential. Never prefix `RELAYER_PRIVATE_KEY` with `NEXT_PUBLIC_`.

## ZK artifacts

The browser files are pinned in `public/zk/`:

- `shielded_spend.wasm`
- `shielded_spend_final.zkey`
- `shielded_withdraw.wasm` (V2 only)
- `shielded_withdraw_final.zkey` (V2 only)
- `manifest.json` with SHA-256 checksums

The matching circuits are `circuits/shielded_spend.circom` and `circuits/shielded_withdraw.circom`; the pool implementation is `contracts/src/ShieldedPool.sol`. The native Linux GitHub Actions pipeline is `.github/workflows/zk-artifacts.yml`.

## Known scope limits

- Deposits are public and fixed at 1 MON.
- The pool tree is depth 3 (eight notes) for the testnet demo.
- Withdrawal is available only after deploying the V2 pool and configuring its separate verified withdrawal artifacts. A withdrawal transfers exactly 1 MON to a public wallet address; the identity of the spent note remains hidden.
- The currently deployed V1 pool has no withdrawal method and cannot be upgraded. Never deposit additional MON into it.
- The test ceremony is not production-safe.

## Deploy withdrawal-capable V2

1. Push this revision and wait for the **Build shielded-pool test artifacts** GitHub Action to pass. Download its `ghostify-zk-testnet-artifacts` artifact.
2. Copy `ShieldedWithdrawVerifier.sol` from the artifact into `contracts/src/`. Copy `shielded_withdraw_js/shielded_withdraw.wasm` and `shielded_withdraw_final.zkey` into `public/zk/`.
3. Verify the withdrawal proof with the artifact's exported verification key before deployment. This repository's CI does this as a required check, but it is still a test ceremonyÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Ânot production setup.
4. With a disposable funded testnet deployer, run `MONAD_RPC_URL=<rpc> PRIVATE_KEY=<key> node scripts/deploy-shielded-pool.mjs`. Record the new pool, both verifier, and MiMC addresses printed by the script.
5. In Vercel, replace `NEXT_PUBLIC_SHIELDED_POOL_ADDRESS` and `NEXT_PUBLIC_SHIELDED_POOL_START_BLOCK` with the V2 values, then set both `NEXT_PUBLIC_WITHDRAW_ZK_*` variables shown above. Keep `RELAYER_PRIVATE_KEY` server-only and fund it with testnet MON for gas.
6. Redeploy Vercel. Test with a new 1 MON V2 deposit only: transfer to a second browser profile, scan, withdraw to a third testnet wallet, and verify the pool balance decreases by exactly 1 MON.
