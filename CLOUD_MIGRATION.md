# Cloud database migration — 2 October 2026

**Historical record:** On 3 October 2026, backend, main AI and lead AI returned to local PostgreSQL `medsenseai_pharm.public`. See [FINAL_POSTGRESQL.md](FINAL_POSTGRESQL.md) for the current final dataset, backup and sharing requirements. The Neon configuration below is superseded.

The local pharmacy database was previously imported into the cloud database's `medsense_app` schema. At that time, backend and AI used the direct Neon connection and this application schema.

The imported snapshot contains 45 products, 3 staff users, 5 customers, 26 invoices and 37 stock batches. All 41 base-table record counts were verified after import. Product IDs, FIFO families, receipt prices, invoice costs, customer accounts, supplier ledgers, credentials and history were copied without renumbering.

The original cloud `public` schema was left in place. Its 112 invoices remain there, with their complete-row checksum verified unchanged. These original records remain untouched. Their 112 invoice headers have also been imported into the application with new invoice IDs and explicit original-ID mappings, bringing the application to 138 invoices. The original cloud dataset has no products, customers, users, stock batches or invoice-item rows. Imported historical invoices therefore remain view-only, retain their original names, dates, prices, amounts and statuses, and are never assigned to unrelated current customer IDs. Their complete source records are preserved in invoice.legacy_source_record.

Backups and verification reports are in `database/cloud-migration-2026-10-02T10-53-55-875Z/`:

- `cloud-before.backup`: full original cloud database backup.
- `local-source.backup`: consistent local pharmacy snapshot.
- `medsense-app.sql`: import SQL with schema, sequence and foreign-key references pointing to the application schema.
- `manifest.json`, `verification.json`, `runtime-verification.json`: source counts, preserved cloud invoice checksum and verification results.
- `backend.env.before-switch`, `ai.env.before-switch`: original configuration files.

Backups and original environment files are excluded from version control.

Run `node scripts/test-cloud-connection.js` from `backend` to check the configured application schema. `node scripts/verify-cloud-migration.cjs` verifies the imported snapshot and preserved legacy invoices; after legitimate new sales or receipts, its fixed snapshot counts will naturally differ.

The migration tool supports `--prepare` and `--apply <prepared-directory>`. It refuses to overwrite an existing target schema and applies the import in one transaction. Do not rerun the migration against an already-imported application schema.

The local PostgreSQL database remains available. The explicit `portable/start-local-backend.cjs` helper selects the original local `public` schema; the normal project launcher uses cloud configuration.


In Orders or Invoices, select **Records ? Previous cloud records** to view all 112 original cloud invoices. This includes 54 archived source invoices, identified as archived rather than reactivated. Item details and item profit cannot be reconstructed from the original database because invoice_report was empty.

The import script `backend/scripts/import-legacy-cloud-orders.cjs` is idempotent: a unique source-schema/source-ID mapping prevents duplicate imports. `legacy-orders-import.json` records the import checks. `node scripts/verify-cloud-history.cjs` checks the live staff APIs and customer-identity isolation.
