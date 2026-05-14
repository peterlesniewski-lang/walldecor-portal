# WallDecor Portal — P1 Deploy Checklist

Date: 2026-05-14
Branch: `codex-prod-audit-p0p1`
Target: live VPS/MySQL instance before inviting real users

## Scope

This checklist covers deploying the P1 production-readiness branch without overwriting the current production state blindly. It assumes the live VPS is currently a copy of GitHub `main` and the production database is MySQL.

## What This Branch Fixes

- Architect onboarding email placeholders and error reporting.
- STAFF operational permissions: can register architects and manage project flow, but cannot execute financial actions.
- Admin payout finalization stores `PAID` correctly.
- Payout, cashback redemption, project finalization, password reset, and HOLD transitions have transaction/race guards.
- Architect project detail access is owner-checked.
- Google sign-in no longer auto-creates invite-less architect accounts.
- Manual backup exports the required business tables and fails hard on incomplete export.
- MySQL date formatting and known SQLite-only query issues are fixed.
- VPS setup installs build dependencies before pruning and treats Google OAuth as optional unless configured.

## Preflight

- Confirm the branch is pushed:
  `git fetch origin && git rev-parse origin/codex-prod-audit-p0p1`
- Confirm production env is known and backed up:
  `/var/www/walldecor-portal/.env`
- Confirm these env values before inviting architects:
  - `NEXTAUTH_URL` points to the real portal URL.
  - `NEXTAUTH_SECRET` is set and stable.
  - `DB_TYPE=mysql`
  - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` point to production MySQL.
  - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` are configured.
  - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set only if Google login is intended.
- Confirm private upload dirs exist and are writable by the app user:
  - `/var/www/walldecor-portal/private_uploads/invoices`
  - `/var/www/walldecor-portal/private_uploads/projects`

## Backup Before Deploy

Run from the VPS:

```bash
cd /var/www/walldecor-portal
mkdir -p ~/walldecor-backups
cp .env ~/walldecor-backups/env-$(date +%F-%H%M%S).bak
mysqldump -u "$DB_USER" -p "$DB_NAME" > ~/walldecor-backups/mysql-$(date +%F-%H%M%S).sql
tar -czf ~/walldecor-backups/private-uploads-$(date +%F-%H%M%S).tar.gz private_uploads
git rev-parse HEAD > ~/walldecor-backups/git-head-before-deploy.txt
```

If the shell does not have `DB_USER`/`DB_NAME`, read them from `.env` and pass them explicitly.

## Deploy Branch

Run from the VPS:

```bash
cd /var/www/walldecor-portal
git fetch origin
git switch codex-prod-audit-p0p1
git pull --ff-only origin codex-prod-audit-p0p1
npm ci
npm run build
npm prune --omit=dev
pm2 restart walldecor-portal --update-env
pm2 save
```

For a first-time VPS setup, `deploy/setup-server.sh` can be used, but review `.env` before inviting any users.

## Post-Deploy Smoke Test

Use a browser against the production URL:

- ADMIN can sign in.
- ADMIN can open `/dashboard/admin`.
- ADMIN can download `/api/admin/backup`; it must return a JSON backup, not an error.
- STAFF can sign in.
- STAFF can open admin dashboard and see operational project controls.
- STAFF cannot download `/api/admin/backup`.
- STAFF cannot execute batch payout.
- STAFF can create/register an architect.
- Newly registered architect receives the welcome email with login, password, portal URL, and password-change instruction.
- ARCHI can sign in.
- ARCHI can open own project detail.
- ARCHI cannot open another architect's project detail by URL.
- ADMIN can move a payout to `PAID`; linked payout/commission status should persist as `PAID`.
- Password reset email sends and the reset link can be used once.

## Go / No-Go

Go only if:

- `npm run build` passed on VPS.
- PM2 status is `online`.
- Nginx returns the app through the production URL.
- ADMIN, STAFF, and ARCHI smoke tests pass.
- SMTP sends both architect welcome and password reset emails.
- Manual backup endpoint returns complete JSON.

No-go if:

- Any financial status action errors.
- STAFF can execute a financial action.
- ARCHI can access another architect's project.
- Email sending fails for new architect onboarding.
- Backup endpoint returns HTTP 500 or incomplete data.

## Rollback

If deploy fails before inviting users:

```bash
cd /var/www/walldecor-portal
git switch main
git pull --ff-only origin main
npm ci
npm run build
npm prune --omit=dev
pm2 restart walldecor-portal --update-env
```

If database writes happened after deploy and must be reverted, restore the MySQL dump taken in the backup step. Do not restore the database casually after real users start using the app; inspect the specific writes first.

## Follow-Up After P1 Deploy

- Open a PR from `codex-prod-audit-p0p1` to `main`.
- Add user-facing help sections for `ARCHI`, `STAFF`, and `ADMIN`.
- Add an archive/deactivate flow for architects instead of hard deletion.
- Replace the legacy `middleware` convention with Next's newer `proxy` convention.
- Plan a P2 lint cleanup; current lint baseline is not clean and was not treated as a P1 blocker.
