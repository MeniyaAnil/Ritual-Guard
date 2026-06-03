# Ritual Guard All-In-One

All-in-one normal-user Ritual Chain safety dApp.

## Normal user UI

No executor fields, no dev setup, no sample buttons, no link checker.

Users only see:

- Wallet check
- Contract check
- Transaction hash check
- Check Safety
- Save Proof

## What it uses now

- Ritual RPC to read real onchain facts.
- Ritual Explorer links for proof.
- Deployed Ritual smart contract for saving report hashes.
- Optional Ritual LLM precompile mode through `saveAiReport()`.

## Deploy contract

Open Remix and deploy:

```text
contracts/RitualGuardAllInOne.sol
```

Then set in Vercel:

```env
VITE_GUARD_CONTRACT_ADDRESS=0xYourDeployedRitualGuardAllInOneAddress
```

## Optional native AI mode

If you have an active Ritual executor address and RitualWallet funding, set:

```env
VITE_ENABLE_RITUAL_NATIVE=true
VITE_RITUAL_EXECUTOR_ADDRESS=0xExecutorAddressFromRitual
VITE_CONVO_PLATFORM=gcs
VITE_CONVO_PATH=convos/ritual-guard-session.jsonl
VITE_CONVO_KEY_REF=GCS_CREDS
```

When enabled, Save Proof tries to call Ritual LLM precompile `0x0802` through `saveAiReport()`. If the native AI call fails, the app automatically falls back to normal onchain proof, so the user flow does not break.

## Vercel

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```
