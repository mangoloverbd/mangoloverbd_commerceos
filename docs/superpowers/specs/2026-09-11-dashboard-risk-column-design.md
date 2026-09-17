# Dashboard Risk Column Visibility Design

## Goal

Hide the Risk column in the Dashboard orders table without removing risk data or risk actions elsewhere in the Merchant Suite.

## Design

`OrdersTable` will receive an optional `showRiskColumn` prop that defaults to `true`, preserving the current appearance for every existing consumer. `Dashboard` will pass `showRiskColumn={false}`. The table will conditionally render the Risk header and its matching desktop body cell as one unit so the remaining columns stay aligned. Mobile order cards and fraud-check behavior remain unchanged.

## Verification

The Dashboard wiring test will assert that Dashboard passes the hidden-column setting to its table. Existing table consumers will continue using the default visible setting, and the normal test/build checks will verify type safety and bundling.
