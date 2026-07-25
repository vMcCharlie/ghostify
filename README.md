# Ghostify

> **Incognito mode for your money.**
>
> A Monad Testnet privacy-payment prototype with a simple consumer flow: connect a wallet, enter a recipient address and amount, then send.

![Ghostify](public/ghostify.png)

## Status

**Testnet prototype — not audited — do not use with funds you cannot afford to lose.**

Ghostify V3 is a research and hackathon implementation. It uses client-generated Groth16 proofs and a relayer-assisted withdrawal flow. It is deliberately small (an eight-leaf test pool) and is **not production-ready**.

## What Ghostify does today

1. The sender connects an EVM wallet on Monad Testnet.
2. The sender enters a normal recipient wallet address and MON amount.
3. The browser creates a shielded note and a deposit proof locally.
4. The sender approves the deposit transaction in their wallet.
5. The browser waits for the pool to index the deposit, builds a withdrawal proof locally, and asks the server-side relayer to submit it.
6. The pool pays the entered recipient address.

The UI intentionally presents this as one payment flow. It does not expose proof data, note secrets, or transaction hashes to ordinary users.

## Important privacy and safety boundaries

Ghostify is a **testnet prototype**, not a claim of complete transaction anonymity.

- The current direct-withdrawal flow makes the withdrawal recipient and amount public on-chain.
- Deposit and withdrawal timing, amount uniqueness, pool size, relayer metadata, and user behavior can enable correlation.
- The browser stores the in-flight note secret in `localStorage` so a payment can be retried after an interruption. Clearing browser data before completion can make recovery impossible.
- The relayer pays gas but must never receive a user wallet private key or an unencrypted note secret.
- The contracts and circuits have not received an independent security audit.
- The V3 tree has a fixed depth of 3: **at most eight total notes**. Deploy a new pool before using it beyond that limit.

For production, commission cryptography and smart-contract audits; increase the anonymity set; add recovery design; harden the relayer; implement a documented threat model; and obtain appropriate legal and compliance review.

## Live Monad Testnet deployment

| Component | Address |
| --- | --- |
| Shielded pool V3 | [`0xaaa2b48f1152a393eb30f60041060bb56f4f72fd`](https://testnet.monadvision.com/address/0xaaa2b48f1152a393eb30f60041060bb56f4f72fd) |
| Deposit verifier | [`0xc7ead905f77ea9d6b8b5970884cab7520b3e9ced`](https://testnet.monadvision.com/address/0xc7ead905f77ea9d6b8b5970884cab7520b3e9ced) |
| Spend verifier | [`0xd1defd8d80ccde1d1a3efd18ba9a0f266cf237ba`](https://testnet.monadvision.com/address/0xd1defd8d80ccde1d1a3efd18ba9a0f266cf237ba) |
| Withdraw verifier | [`0x6dabb097c50a3e83d8d8ad6034dfd6037b2d2308`](https://testnet.monadvision.com/address/0x6dabb097c50a3e83d8d8ad6034dfd6037b2d2308) |
| MiMC hash contract | [`0x8348568753c8c80b68064c9f13e83a3e18be99e6`](https://testnet.monadvision.com/address/0x8348568753c8c80b68064c9f13e83a3e18be99e6) |
| Pool start block | `48052284` |

**Monad Testnet:** chain ID `10143` · currency `MON` · RPC `https://testnet-rpc.monad.xyz` · explorer `https://testnet.monadvision.com`

## Architecture

```text
Sender browser
  ├─ creates note + Groth16 deposit proof locally
  ├─ signs deposit with connected wallet
  ├─ waits for pool event, creates Groth16 withdrawal proof locally
  └─ sends only the proof/public inputs to /api/relay

Next.js relayer API
  └─ uses RELAYER_PRIVATE_KEY server-side to submit privateWithdraw

ShieldedPool V3
  ├─ verifies deposit proof and inserts a commitment
  ├─ verifies withdrawal proof and blocks spent nullifiers
  └─ transfers MON to the public recipient address
```

### Key directories

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Single-page consumer payment flow |
| `app/api/relay/route.ts` | Server-only relayer endpoint |
| `lib/shielded.ts` | Note generation, MiMC commitments, Merkle-path helpers, local retry store |
| `lib/chain.ts` | Monad chain configuration and pool ABI |
| `contracts/src/ShieldedPool.sol` | V3 testnet pool |
| `contracts/src/*Verifier.sol` | Generated Groth16 verifier contracts |
| `circuits/` | Circom deposit, spend, and withdrawal circuits |
| `public/zk/` | Browser-loaded WASM and zkey proving artifacts |

## Run locally

### Prerequisites

- Node.js 18.17+ (Node 20 LTS recommended)
- npm
- A browser wallet such as MetaMask configured for Monad Testnet
- Testnet MON for the sender wallet and relayer wallet

### Install

```bash
git clone https://github.com/vMcCharlie/ghostify.git
cd ghostify
npm install
Copy-Item .env.example .env.local   # PowerShell
npm run dev
```

Open `http://localhost:3000`.

### Environment configuration

Copy `.env.example` to `.env.local`, then set the deployed values:

```dotenv
NEXT_PUBLIC_PROTOCOL_VERSION=v3
NEXT_PUBLIC_SHIELDED_POOL_ADDRESS=0xaaa2b48f1152a393eb30f60041060bb56f4f72fd
NEXT_PUBLIC_SHIELDED_POOL_START_BLOCK=48052284
NEXT_PUBLIC_DEPOSIT_ZK_WASM_URL=/zk/shielded_deposit.wasm
NEXT_PUBLIC_DEPOSIT_ZK_ZKEY_URL=/zk/shielded_deposit_final.zkey
NEXT_PUBLIC_WITHDRAW_ZK_WASM_URL=/zk/shielded_withdraw.wasm
NEXT_PUBLIC_WITHDRAW_ZK_ZKEY_URL=/zk/shielded_withdraw_final.zkey
NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
RELAYER_PRIVATE_KEY=replace_with_a_dedicated_testnet_relayer_key
```

`RELAYER_PRIVATE_KEY` is server-only. Never prefix it with `NEXT_PUBLIC_`, commit it, paste it into client code, or reuse a personal/mainnet key. Fund the relayer with enough **testnet MON** to pay withdrawal gas.

The `NEXT_PUBLIC_*` settings are intentionally exposed to the browser and must not contain secrets.

## Test the complete flow

Use two different Monad Testnet wallets: one funded sender and one recipient.

1. Open Ghostify and click **Connect wallet** with the sender wallet.
2. Enter a small, non-round test amount (for example `0.17`) and the recipient wallet address.
3. Click **Send privately**.
4. Approve the deposit when the wallet requests it.
5. Keep the tab open while Ghostify confirms the pool event and completes the route. The UI automatically retries pool indexing briefly to avoid RPC/event timing races.
6. Confirm the success dialog appears.
7. Check the recipient wallet balance or MonadVision for the resulting transfer.

### If a payment is interrupted

Do **not** clear browser storage. Reopen Ghostify in the same browser profile, enter the same pending amount and desired recipient address, and press **Send privately** to retry the withdrawal phase. If the note cannot be found, wait for Monad Testnet/RPC indexing and retry.

## Deploy the web app to Vercel

1. Push the repository to GitHub.
2. Import the project in Vercel; it is a standard Next.js application.
3. Add every variable listed in the environment block above for **Production** and **Preview** as appropriate.
4. Keep `RELAYER_PRIVATE_KEY` server-only and mark it sensitive.
5. Deploy or redeploy after changing any `NEXT_PUBLIC_*` variable; these values are embedded at build time.
6. Test with a fresh testnet wallet before sharing the URL.

## Deploy a new testnet pool

The existing V3 pool is intentionally limited. To deploy a fresh pool, first ensure the verifier contracts and proving artifacts were built from the **same circuit versions**. A mismatch will make proofs fail.

```powershell
$env:PRIVATE_KEY = "your_disposable_testnet_deployer_key"
$env:MONAD_RPC_URL = "https://testnet-rpc.monad.xyz"
node scripts/deploy-shielded-pool.mjs
```

The script deploys:

1. Deposit verifier
2. Spend verifier
3. Withdrawal verifier
4. MiMC7 hash contract
5. `ShieldedPool`

It prints the contract addresses and pool-start block. Update the environment values, verify the proving artifacts under `public/zk/`, then redeploy the web app. Never deploy a pool whose circuit, verifier, and browser proving artifacts are not generated from the same ceremony output.

## Build checks

```bash
npx tsc --noEmit
npm run build
```

A warning from `snarkjs` / `web-worker` about a dynamic dependency may appear during Next.js build; the production build should still complete successfully.

## Security checklist for contributors

- Do not commit `.env.local`, private keys, or local wallet exports.
- Use a dedicated, low-balance relayer account for testnet only.
- Do not remove proof verification, nullifier checks, or root checks.
- Do not change circuit inputs without regenerating verifiers and artifacts together.
- Treat browser local storage as sensitive while a payment is in flight.
- Do not market this code as audited, production-ready, or fully anonymous.

## License

No license file is currently included. Add an explicit license before reusing or distributing this code outside the hackathon context.