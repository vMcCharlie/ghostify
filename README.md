# Ghostify V3

Ghostify V3 is an unaudited Monad Testnet prototype for variable-value, whole-note shielded transfers. A user deposits any positive MON amount into a value-bound note, privately transfers the entire note, or withdraws that entire note to a normal wallet.

> Testnet only. Do not use real funds. This is a single-contribution test ceremony, not a production privacy system.

## Privacy model

- Deposits are public: the depositor wallet, amount, and time are visible.
- Private transfers hide the link between the input note and the receiver's output note. The transfer amount is not emitted on-chain.
- Withdrawals are public: the recipient wallet, amount, and time are visible.
- The ZK proof prevents the contract, relayer, and observers from learning which deposited/received note was withdrawn.

This is address unlinkability, not perfect anonymity. A unique amount, timing correlation, a small anonymity set, browser fingerprinting, a compromised relayer, or reusing wallets can leak metadata. The relayer must not log client IP addresses or payload metadata in a real deployment.

## V3 protocol

1. **Deposit proof** binds the public deposited MON amount to a hidden note commitment.
2. **Transfer proof** proves ownership and preserves that hidden note value while creating an encrypted receiver note.
3. **Withdrawal proof** binds the exact public withdrawal amount and wallet address to the hidden note. The relayer cannot change the destination or amount.

The pool has an eight-note testnet limit and whole-note transfers only: no splitting, merging, or change outputs.

## Local note safety

The pool holds MON. Browser storage holds the secrets needed to spend a note. Do not clear site data or change browser profiles without a backup. A lost note secret cannot be recovered by Ghostify, the relayer, or Monad.

## Run locally

```powershell
npm install
copy .env.example .env.local
npm run dev
```

## Deploy V3 to Monad Testnet

1. Push this revision and wait for the **Build shielded-pool test artifacts** GitHub Action to succeed.
2. Download `ghostify-zk-v3-testnet-artifacts`. Verify each circuit's `verification_key.json`, `public.json`, and `proof.json` with `snarkjs groth16 verify`.
3. Copy these generated verifier files into `contracts/src/`:
   - `ShieldedDepositVerifier.sol`
   - `ShieldedSpendVerifier.sol`
   - `ShieldedWithdrawVerifier.sol`
4. Copy these browser artifacts into `public/zk/`:
   - `shielded_deposit_js/shielded_deposit.wasm` and `shielded_deposit_final.zkey`
   - `shielded_spend_js/shielded_spend.wasm` and `shielded_spend_final.zkey`
   - `shielded_withdraw_js/shielded_withdraw.wasm` and `shielded_withdraw_final.zkey`
5. With a disposable funded testnet deployer, run:

```powershell
$env:MONAD_RPC_URL='<Monad RPC URL>'
$env:PRIVATE_KEY='<disposable testnet deployer key>'
node scripts/deploy-shielded-pool.mjs
```

6. In Vercel set all values from `.env.example`, including the new pool address/start block and the server-only `RELAYER_PRIVATE_KEY`. Set `NEXT_PUBLIC_PROTOCOL_VERSION=v3` only after all artifacts and the V3 pool are deployed.
7. Redeploy, then test with three separate browser profiles/wallets: deposit a non-round test amount, private-send it, scan in the receiver profile, then withdraw the entire note to a third test wallet.

For Alchemy Monad Testnet free tier, keep `NEXT_PUBLIC_LOG_QUERY_BLOCK_RANGE=10`.

## Retired pools

The prior V1/V2 pools cannot be upgraded or migrated. Their notes cannot use V3 and should not receive additional deposits.