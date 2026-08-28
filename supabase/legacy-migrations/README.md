# Archived Supabase migrations

These files are retained as historical input only. They are deliberately outside
`supabase/migrations/` because the old chain creates several tables twice, omits
tables formerly created at server startup, and cannot bootstrap an empty project.

The active data-preserving reconciliation source of truth starts at
`../migrations/20260828000000_canonical_schema_reconciliation.sql`. Do not move an
archived migration back into the active directory or apply it to the canonical
Mango Lover BD project.
