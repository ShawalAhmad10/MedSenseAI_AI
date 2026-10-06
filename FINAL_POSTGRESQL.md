# Final PostgreSQL database — 3 October 2026

The application uses **PostgreSQL `medsenseai_pharm`, schema `public`**. Backend, main AI and lead AI use this database. The active environment files have no Neon connection. Neon itself was left untouched.

The local application records were compared with the latest Neon application snapshot before switching. All relation row counts and checksums matched. No duplicate import, fabricated records or deletion of current business records was needed.

The final business dataset contains 117 products, 20 brands, 5 suppliers, 4 customers, 234 stock batches, 51 invoices and 9 invoice returns. Database tables also retain the item rows, accounts, ledgers, notifications, stock returns, category masters and supplier mappings required by the application. Storefront products can group FIFO versions and filter availability; customer-specific orders remain scoped to the authenticated customer.

Three empty unused placeholders (`staff`, `medicines`, `stock_history_legacy_pre_latest`) and the obsolete `ai_archive` and `public_before_neon_*` archive schemas were removed after a full backup. Runtime medical provenance tables, `medicine_products`, `team_members`, prescription/reminder/subscription tables and compatibility views remain because application features use them. All required model tables and columns are checked by `backend/scripts/verify-final-postgresql.cjs`.

Inventory, product/brand/supplier masters, customer lists and ledgers, invoices/returns, team lists, analytics and storefront products automatically refresh from the backend. Most active screens refresh every five seconds; updates appear after the next refresh completes. Authentication and cart drafts are browser state; saved pharmacy records are PostgreSQL data.

## Run and hand over

On this configured computer, run `START_MEDSENSEAI.ps1`, then open `http://127.0.0.1:5173/`. Run `VERIFY_MEDSENSEAI.ps1` for service checks.

On a fresh computer, run `SETUP_MEDSENSEAI.ps1`. It restores the final `database/medsenseai_pharm_full.backup` if `medsenseai_pharm` does not exist and configures both services to `public`. An existing database is preserved rather than overwritten. Do not run seed/demo import scripts to prepare the final dataset.

Every fresh restore starts with the same submitted dataset. **Ongoing updates are shared only by project instances using the same PostgreSQL database/backend.** Separately restored databases on different computers are separate copies and do not synchronize. For simultaneous use, users must access the same running frontend/backend, or configure the services to the same central PostgreSQL server. `localhost` always refers to the computer running that service.

## Backups and evidence

`database/final-postgresql-20261003/` contains the complete pre-cleanup backup, original configurations, local/Neon audit reports, cleanup report, runtime verification, test logs and handoff restore verification. These files and database backups must remain private.

The handoff backup is exported from one consistent PostgreSQL snapshot and restored into a temporary database to compare every base-table checksum/count and sequence. The temporary verification database is then removed. Use `backend/scripts/export-final-postgresql.cjs` to refresh this snapshot after later authorized updates.
