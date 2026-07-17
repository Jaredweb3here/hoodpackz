# HoodPackz V2 Audit Scope

Status: **pre-audit and not deployed**.

## Current in-scope contracts

| Contract | Primary review areas | Priority |
| --- | --- | --- |
| `ThresholdRandomBeacon` | Round state machine, exposure, finalization, rescue, delivery | Critical |
| `BeaconOperatorRegistry` | Epoch immutability, key-set validation, verifier binding | Critical |
| `OperatorBondVault` | Available collateral, locks, withdrawals, slashing | Critical |
| `IThresholdSignatureVerifier` | Cryptographic trust boundary | Critical |

The production EIP-2537 verifier is not implemented and must be added to scope before deployment.

## Randomness invariants

1. No request can create economic exposure without sufficient locked slashable collateral.
2. Capacity equals at most the sum of the four smallest available bonds in the active seven-operator epoch.
3. Pending withdrawals are excluded from available collateral and remain slash-consistent.
4. A round finalizes once, from a valid signature under its snapshotted epoch keys.
5. Rescue shares are attributable and cannot be replayed across rounds, epochs, chains, or consumers.
6. Deadlines begin at round sealing and cannot be shortened retroactively.
7. Callback failure cannot alter or erase finalized randomness.
8. Legacy and zero-exposure request paths fail closed.
9. Registry and beacon use the same immutable verifier.
10. Malformed, non-canonical, infinity, and invalid-subgroup points are rejected.

## Planned scope expansion

The following contracts do not yet exist and require separate audit coverage when implemented:

- `AssetRegistry`
- `PackRegistry`
- `PrizeInventoryVault`
- `HoodPackzCore`
- USDG jackpot vault
- WETH payment router

Required pack invariants include three unique assets per pack, snapshot-only selection, exact 80/10/10 accounting, funded inventory, bounded jackpot liability, and eventual settlement or full refund.

## Legacy exclusion

Original StockPackz contracts are retained for attribution and migration analysis but are not the HoodPackz V2 target. Any reuse must be explicitly added to scope and reviewed as new V2 code.

## Verification

```bash
cd contracts
forge fmt --check
forge build --sizes
forge test
```

Before mainnet, add production verifier vectors, asset-admission tests, invariants, Robinhood Chain fork tests, static analysis, deployment rehearsal, and an independent external audit.
