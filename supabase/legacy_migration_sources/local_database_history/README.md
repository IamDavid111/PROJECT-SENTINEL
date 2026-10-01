# Recovered local migration sources

These SQL files were fetched from the local Supabase database migration ledger on 2026-09-30 and verified byte-for-byte against that ledger's exported files.

They are preserved as historical source material only. Do not apply them directly from this directory. In particular, legacy version `202609120008` is `investigation_workflow`, while the active migration with that version in `supabase/migrations` is `custom_role_backend`. Reconcile their schema effects through a new, uniquely versioned forward migration instead of reusing these legacy version identifiers.

The linked migration ledger was fetched separately. Its entries for `202609290028` through `202609290030` contain only their version strings, and the fetched Git refs did not contain their original SQL. The active migration `20260930081939_reconcile_linked_public_schema.sql` is a generated snapshot of the effective public-schema delta from the linked database, not a reconstruction of those original scripts. `20260930081940_reconcile_linked_public_privileges.sql` captures the remaining privilege differences found by direct schema comparison.

Both forward migrations were applied by resetting the empty local database with seeding disabled. The resulting local public schema compared equal to the linked public schema before their versions were repaired in the linked migration ledger.
