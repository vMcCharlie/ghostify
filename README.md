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
NEXT_PUBLIC_ZK_WASM_URL=/zk/shielded_spend.wasm
NEXT_PUBLIC_ZK_ZKEY_URL=/zk/shielded_spend_final.zkey
NEXT_PUBLIC_MONAD_RPC_URL=<a browser-safe Monad RPC URL>
RELAYER_PRIVATE_KEY=<server-only testnet relayer key>
```

Use a reliable browser-safe RPC provider for `NEXT_PUBLIC_MONAD_RPC_URL` in production; it is intentionally visible to the browser, so do not use a secret or privileged credential. Never prefix `RELAYER_PRIVATE_KEY` with `NEXT_PUBLIC_`.

## ZK artifacts

The browser files are pinned in `public/zk/`:

- `shielded_spend.wasm`
- `shielded_spend_final.zkey`
- `manifest.json` with SHA-256 checksums

The matching circuit is `circuits/shielded_spend.circom`; the pool implementation is `contracts/src/ShieldedPool.sol`. The native Linux GitHub Actions pipeline is `.github/workflows/zk-artifacts.yml`.

## Known scope limits

- Deposits are public and fixed at 1 MON.
- The pool tree is depth 3 (eight notes) for the testnet demo.
- There is no withdrawal circuit or UI yet.
- The test ceremony is not production-safe.
