---
name: sql-migrations
description: How to write and verify database migrations in this project, including rollback safety.
---

# SQL migrations

When adding or changing a migration:

1. Migrations live in `db/migrations/` and are named `NNNN_short_description.sql`.
2. Every migration MUST have a working `down` section; never write a forward-only migration.
3. Wrap multi-statement migrations in a transaction.
4. Test the migration up and down locally before reporting done.

Include the exact commands you ran in your final summary.
