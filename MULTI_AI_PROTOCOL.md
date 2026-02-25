# MULTI_AI_PROTOCOL.md
**Multi-AI Coding Protocol — WallDecor Partner Portal**
Version: 1.0 | Last updated: 2026-02-24

This protocol governs how any AI agent (Claude, Gemini, or other) must behave when working on this codebase. Its purpose is to prevent conflicting changes, terminology drift, and silent assumptions that break existing work.

---

## Authority Hierarchy

When in doubt, this order determines what is correct:

1. **Human instruction** (current session message) — always wins.
2. **PRODUCT_BRIEF.md** — source of truth for product functionality, business logic, and terminology.
3. **PROJECT_STATE_REVIEW.md** — source of truth for current implementation state and known gaps.
4. **Existing code** — reflects what is actually built, but may contain bugs or deviations from the brief.
5. **AI assumptions** — lowest authority. Never invent logic that is not grounded in documents above.

If the brief and the code contradict each other, flag it to the human. Do not silently pick one.

---

## During-Task Guardrails

### Never do without explicit human approval:
- [ ] Rename database columns, tables, or enum values.
- [ ] Change role strings (`ARCHI`, `STAFF`, `ADMIN`) — any inconsistency must be flagged, not silently fixed.
- [ ] Modify `src/middleware.ts` route access rules.
- [ ] Change the cashback rate (2%), payout threshold (300 PLN), expiry window (12 months), or tier thresholds (3/6/11).
- [ ] Delete or move files.
- [ ] Refactor code outside the scope of the current task.
- [ ] Add new database tables or columns without documenting the schema change.
- [ ] Change any financial calculation logic without citing the relevant rule from PRODUCT_BRIEF.md.

### Always check before implementing:
- [ ] Does this feature already exist (partially or fully)? Check PROJECT_STATE_REVIEW.md §2.
- [ ] Is this feature in scope for MVP? Check PRODUCT_BRIEF.md §8 (Out of Scope).
- [ ] Does the terminology match PRODUCT_BRIEF.md? (e.g., "saldo" not "commissions" for wallet balance in partner UI).
- [ ] Is the role check correct for this route or API endpoint?

### Do not introduce:
- Hardcoded display values (e.g., static "75%" or "+12% vs r/r") where real data is available or required.
- New UI labels that mix "commission" and "wallet/saldo" concepts unless both mechanisms are separately implemented.
- Duplicate logic that recalculates values already stored in the `commissions` table.

---

## Post-Task Handoff Checklist

Before ending a session or handing off to another AI, document the following in a message or update PROJECT_STATE_REVIEW.md:

- [ ] **Files changed**: list every file modified, created, or deleted.
- [ ] **What was done**: one sentence per change describing the functional result, not the implementation detail.
- [ ] **What was NOT done**: explicitly list any subtasks that were skipped or left incomplete.
- [ ] **New gaps found**: anything discovered during the task that contradicts the brief or reveals a bug not previously documented.
- [ ] **Open questions**: any decision that required an assumption — flag it for human review.
- [ ] **DB schema changes**: if any table or column was added/modified, describe the change explicitly.

---

## Conflict Resolution Rules

| Situation | Resolution |
| :--- | :--- |
| Code contradicts PRODUCT_BRIEF.md | Flag to human. Do not silently fix. |
| Two AI sessions made conflicting changes | Human decides which version is correct. Do not merge without instruction. |
| A feature is partially implemented by a previous AI | Complete it to match the brief, do not rewrite from scratch unless instructed. |
| Brief is ambiguous | Stop and ask. Do not interpret in your favour. |
| Out-of-scope feature is needed to complete a task | Stop and flag. Do not implement silently. |

---

## Terminology Reference (MVP)

Use these terms consistently across all code, UI labels, comments, and documentation:

| Concept | Correct term | Do not use |
| :--- | :--- | :--- |
| Architect's accumulated cashback balance | Saldo / Wallet balance | "Commission balance", "earnings" |
| A single cashback credit entry | Wallet transaction | "Commission entry", "bonus" |
| A withdrawal request | Payout / Wypłata | "Transfer", "withdrawal request form" |
| Fee WallDecor owes architect | Commission / Prowizja | "Cashback", "bonus", "saldo" |
| Projects finished and settled | Zakończony | "Completed", "done", "closed" |
| Projects awaiting action | Zgłoszony | "New", "pending" |
| Partner eligibility for payout | Available balance >= 300 PLN | "Enough funds", "qualified" |

---

## Quick Reference: Key Business Constants

These values must never be changed in code without explicit human instruction:

| Constant | Value | Location in brief |
| :--- | :--- | :--- |
| Cashback rate | 2% of net PRODUCT item value | §6 |
| Payout minimum | 300 PLN net | §6 |
| Cashback expiry | 12 months from credit date (FIFO) | §6 |
| Tier: Silver | 3–5 completed projects | §3 |
| Tier: Gold | 6–10 completed projects | §3 |
| Tier: Platinum | 11+ completed projects | §3 |
| Stale project threshold | 14 days without status update | §4 |
| Wallet expiry warning window | 30 days | §4 |
| Near-eligible payout forecast range | 150–299 PLN | §4 |
