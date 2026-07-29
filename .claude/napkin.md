# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Domain Behavior Guardrails
1. **[2026-07-29] Never distribute a mismatched consolidated discount**
   Do instead: distribute automatically only when the company total exactly
   equals the requested installments; otherwise create a manual-review alert.
2. **[2026-07-29] Discount and collection are different periods**
   Do instead: persist both the payroll discount period and the following
   collection/deposit period on every monthly cycle.
3. **[2026-07-29] Financial records are immutable after confirmation**
   Do instead: reverse or adjust confirmed records with reason, actor and
   timestamp; never physically delete them.
4. **[2026-07-29] Preserve every imported source**
   Do instead: store the original file, SHA-256 hash, uploader and upload time
   before parsing or normalizing its rows.

## Security & Privacy
1. **[2026-07-29] Never commit Supabase secrets**
   Do instead: commit only `.env.example`; configure real values in local
   environment and Vercel encrypted variables.
2. **[2026-07-29] Keep financial writes online**
   Do instead: permit offline caches only for read-only views; require a live,
   authenticated server transaction for writes, approvals and reversals.
3. **[2026-07-29] Default to least privilege**
   Do instead: use role-based access plus PostgreSQL RLS and keep Storage
   buckets private.

## Execution & Validation
1. **[2026-07-29] Validate the production artifact**
   Do instead: run lint, TypeScript build, production dependency audit and a
   browser smoke test before publishing.
2. **[2026-07-29] Ignore stale inherited GitHub tokens**
   Do instead: run GitHub operations with empty `GH_TOKEN` and `GITHUB_TOKEN`
   so the authenticated keyring credential is used.

## User Directives
1. **[2026-07-29] Accounting first**
   Do instead: prioritize imports, reconciliation, bank movements, provider
   payments, monthly closing and audit before member or secretary portals.
2. **[2026-07-29] Two-month pilot**
   Do instead: support July and August 2026 legacy sheets and manual correction;
   expect standardized provider sheets from September 2026.
