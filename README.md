# Ghostify

Ghostify is a focused, non-custodial stealth-address payment prototype for **Monad Testnet**. A sender derives a fresh one-time MON address from a receiver's public meta-address, sends MON directly to it, and publishes an ERC-5564-style announcement. Only the holder of the corresponding viewing key can identify that address while scanning announcements.

> Hackathon scope: Ghostify protects address linkage, not payment amount, timing, IP address, or wallet-level metadata. Do not use it to protect real value.

## What is included

- `/` � responsive sender screen for private MON transfers
- `/receive` � generate keys, share a meta-address, and scan on-chain announcements
- `contracts/src/Announcer.sol` � minimal announcement registry (never custody funds)
- Foundry test and deployment instructions

## Protocol flow

1. Receiver creates a private spending key and private viewing key locally. The app derives public keys and formats `st:monad:<spending-pubkey>:<viewing-pubkey>`.
2. Sender uses ECDH with the public viewing key, derives a one-time stealth address, and transfers MON to it through their wallet.
3. Sender calls `Announcer.announce(1, stealthAddress, ephemeralPublicKey, 0x)`.
4. Receiver scans `Announcement` logs and uses the viewing key to test each announcement. Matching addresses and their public MON balances are shown.

The app does not use a relayer because a relayer does not improve privacy in this minimal native-MON flow and adds custody/availability risk. Wallet approvals pay for only the MON transfer and the announcement transaction; the browser performs all derivation.

## Prerequisites

- Node.js 20+
- Foundry (`forge` and `cast`)
- A browser wallet configured for Monad Testnet and funded with test MON

Monad Testnet configuration:

| Setting | Value |
| --- | --- |
| Network | Monad Testnet |
| Chain ID | `10143` |
| Currency | `MON` |
| RPC | `https://testnet-rpc.monad.xyz` |
| Explorer | `https://testnet.monadvision.com` |

## Run the frontend

```bash
git clone https://github.com/vMcCharlie/ghostify.git
cd ghostify
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Before testing a full send/receive flow, deploy the contract below and set `NEXT_PUBLIC_ANNOUNCER_ADDRESS=0xYourContract` in `.env.local`. Restart the development server after changing it.

## Deploy the contract

From `contracts/`, first install Foundry's standard library if you have not already:

```bash
forge install foundry-rs/forge-std --no-commit
forge test
```

Export a **testnet-only** deployment key in the shell (never commit it):

```bash
set PRIVATE_KEY=0xyour_testnet_private_key
forge create src/Announcer.sol:Announcer --rpc-url https://testnet-rpc.monad.xyz --private-key %PRIVATE_KEY% --broadcast
```

PowerShell equivalent:

```powershell
$env:PRIVATE_KEY='0xyour_testnet_private_key'
forge create src/Announcer.sol:Announcer --rpc-url https://testnet-rpc.monad.xyz --private-key $env:PRIVATE_KEY --broadcast
```

Copy the printed deployed address into `.env.local`. Verify it on MonadVision by opening `https://testnet.monadvision.com/address/<DEPLOYED_ADDRESS>`.

## End-to-end test checklist

1. Start the app with a deployed `NEXT_PUBLIC_ANNOUNCER_ADDRESS`.
2. Go to **Receive**, click **Generate new receive keys**, and securely save both private keys. Copy the generated meta-address.
3. In a separate browser profile or with a different testnet wallet, go to **Send**, paste the meta-address, enter a small amount such as `0.01`, and approve both wallet prompts.
4. Return to **Receive**, paste the saved keys, and click **Scan Monad Testnet**.
5. Confirm the address and MON balance shown in the table. The linked transaction should be visible in MonadVision.

If no row appears, confirm the configured contract address is correct, wait for the announcement transaction to finalize, and rescan. If the wallet asks to switch networks, choose Monad Testnet (chain ID 10143).

## Deployment to Vercel

1. Push this repository to GitHub.
2. Import it into Vercel as a Next.js project.
3. Add `NEXT_PUBLIC_ANNOUNCER_ADDRESS` and optionally `NEXT_PUBLIC_MONAD_RPC_URL` to Vercel environment variables.
4. Deploy. The app has no server-side secrets and requires no database.

## Security notes and next steps

- Keep private spending/viewing keys private. This prototype retains them only in React state for the active browser tab.
- Anyone can read the announcement event, the stealth address, its balance, and timing. The receiver relationship is what is obscured.
- A production protocol needs audited ERC-5564 conformance, encrypted metadata, key backup/recovery UX, rate-limited RPC/indexing, and careful threat modeling.
- The current receive screen discovers funds but deliberately does not implement sweeping them to a primary wallet. Add that only after designing secure local private-key handling.

## Repository layout

```text
app/                 Next.js sender and receiver screens
lib/stealth.ts       Browser-side secp256k1 stealth derivation
lib/chain.ts         Monad configuration and Announcer ABI
contracts/           Foundry contract and unit test
```

## Current Monad Testnet deployment

Ghostify's `Announcer` contract is deployed at [`0x9ead9975dfa9dd5e54e86ce20f14de132f49fdea`](https://testnet.monadvision.com/address/0x9ead9975dfa9dd5e54e86ce20f14de132f49fdea). Set this as `NEXT_PUBLIC_ANNOUNCER_ADDRESS` to use the shared testnet registry.

Deployment transaction: [`0xe7b924a89c816de88e9175bda32c70fa0588dfffcd0974e0d4434f8613ebdfe0`](https://testnet.monadvision.com/tx/0xe7b924a89c816de88e9175bda32c70fa0588dfffcd0974e0d4434f8613ebdfe0).

## Wallet address receiving

Receivers can now register their public Ghostify receive keys against their normal Monad wallet address. Once registered, senders may paste that familiar `0x...` address and Ghostify resolves the public keys before creating the private payment. The registry stores only public keys; it never receives funds or private keys.

Shared Monad Testnet registry: [`0xbccf72b08df5a379fc54b3ccef785cc9b1091651`](https://testnet.monadvision.com/address/0xbccf72b08df5a379fc54b3ccef785cc9b1091651).

## Shielded-pool V1

The repository now includes a separate, testnet-only fixed-denomination shielded-pool foundation: [`docs/SHIELDED_POOL_V1.md`](docs/SHIELDED_POOL_V1.md). It uses a real Circom/Groth16 circuit, MiMC commitment tree, nullifiers, and proof-gated output commitments. It is deliberately not connected to the live frontend or deployed with the local test ceremony; see the document for the required Linux/macOS proving flow and security boundary.

## Run the shielded-pool testnet frontend

1. In GitHub, open **Actions ? Build shielded-pool test artifacts ? Run workflow**. Download the successful `ghostify-zk-testnet-artifacts` artifact. The workflow uses native Linux Circom, creates a test-only ceremony, and verifies a sample proof.
2. On a secure machine, extract the artifact, copy its generated `ShieldedSpendVerifier.sol` into `contracts/src/`, and set a **new disposable Monad Testnet** deployer key only in that shell. Run `node scripts/deploy-shielded-pool.mjs`.
3. Host `shielded_spend_js/shielded_spend.wasm` and `shielded_spend_final.zkey` as public static files (Vercel public assets, a release asset, or object storage). The proving key is public; note secrets are not.
4. Set these Vercel variables and redeploy:

```text
NEXT_PUBLIC_SHIELDED_POOL_ADDRESS=<printed pool address>
NEXT_PUBLIC_ZK_WASM_URL=<public wasm URL>
NEXT_PUBLIC_ZK_ZKEY_URL=<public zkey URL>
```

The homepage then enables the 1 MON deposit flow. The private-send control remains guarded until its browser proof and relayer module are connected to the published artifact set.

## Pinned testnet ZK artifacts

The current testnet verifier and browser artifacts are pinned in `public/zk/` and served by Vercel at `/zk/`. Their checksums are recorded in `public/zk/manifest.json`:

- WASM SHA-256: `352e1a71a750d042c0b39827203ec2e906de0df1448fa3b898d32937b7681641`
- Proving key SHA-256: `0e96f5382b37006a01ea1c8998fdbf71eb6888fa4ea817424b2fc3ca1ec001c6`

The generated verifier source at `contracts/src/ShieldedSpendVerifier.sol` matches this artifact set. These parameters are testnet-only and must be replaced by an independently contributed ceremony before any production deployment.

## Live Monad Testnet shielded-pool deployment

The verified testnet artifact set is deployed at:

- Groth16 verifier: [`0x6fe4efe0e63620251cdd5c50a123db8e8ead3ebf`](https://testnet.monadvision.com/address/0x6fe4efe0e63620251cdd5c50a123db8e8ead3ebf)
- MiMC7 hash contract: [`0x5cb7b35d0ff4ce325e68f4db4abb6cbca48aae7f`](https://testnet.monadvision.com/address/0x5cb7b35d0ff4ce325e68f4db4abb6cbca48aae7f)
- 1 MON ShieldedPool: [`0xad16d1a439a239adaa202d47ae1ae9661c656112`](https://testnet.monadvision.com/address/0xad16d1a439a239adaa202d47ae1ae9661c656112)

The pool bytecode and its `DENOMINATION()` value (`1 MON`) were verified through Monad Testnet RPC. This is a testnet-only, single-contribution ceremony deployment.

## Enable private transfer relaying

Set `RELAYER_PRIVATE_KEY` in Vercel as an **encrypted server-side** environment variable. Do not prefix it with `NEXT_PUBLIC_` and do not commit it. The `/api/relay` endpoint uses it to submit a proof-validated `privateTransfer` and pay Monad Testnet gas.

Test the full flow with two browser profiles:

1. **Receiver profile:** open Ghostify, copy the displayed shielded receive key.
2. **Sender profile:** connect a funded testnet wallet, deposit exactly 1 MON, then paste the receiver key and select **Prove and send privately**.
3. The sender browser constructs the Merkle path, creates the Groth16 proof locally, and sends only the proof plus encrypted note through the relayer.
4. **Receiver profile:** select **Scan for private notes**. The received note appears only after local decryption with that profile's private receive key.

Do not clear browser data while you have a note: this V1 has no backup or withdrawal UI yet.
