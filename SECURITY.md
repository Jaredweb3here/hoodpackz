# Security Policy

HoodPackz V2 is pre-audit and not deployed. The frontend is a preview and must not expose token approvals or value-moving calls until the launch gates below are complete.

## V2 threat model

| Threat | Required defense |
| --- | --- |
| Entropy manipulation | Unique threshold BLS signature over a domain-separated round message |
| Single operator compromise | Four shares required from seven independently controlled operators |
| Operator withholding | Signing deadlines, attributable rescue shares, and slashable bonds |
| Unbounded value at risk | Round exposure capped by the four smallest available operator bonds |
| Key substitution | Append-only epochs and verifier validation of master/share key sets |
| Signature malleability | Production EIP-2537 verifier with canonical encoding and infinity checks |
| Callback failure | Randomness finalization immutable; delivery separately retryable |
| Asset insolvency | Pre-funded inventory and liability accounting |
| Malicious prize token | Admission rejects fee-on-transfer, rebasing, blacklistable, owner-mintable, and unsafe proxy assets |
| Admin abuse | Safe/timelock administration, versioned registries, and per-opening snapshots |
| Misleading preview | No V2 address means no approval, purchase, or opening transaction can be initiated |

## Forbidden entropy sources

HoodPackz V2 must not use `block.timestamp`, `blockhash`, `block.prevrandao`, transaction ordering, client-side randomness, or one keeper as its entropy source.

## Trust assumptions

1. At least four of seven operators follow the signing protocol and protect their shares.
2. Slashable bond value is calibrated to the maximum economic exposure accepted by a round.
3. Robinhood Chain consensus and EIP-2537 precompiles behave as specified.
4. Admitted assets remain transferable and sufficiently liquid under documented bounds.
5. Safe/timelock signers, compliance signers, and deployment keys remain uncompromised.

## Known limitations

- The production BLS verifier and interoperability vectors are not implemented.
- The seven-operator production set and DKG ceremony are not established.
- The HoodPackz asset registry, inventory vault, pack core, jackpot, and router are not implemented.
- The protocol has not completed an external audit or legal review.
- Threshold signatures prevent entropy grinding but cannot guarantee quorum availability.

## Launch gates

Mainnet value movement remains disabled until production verifier review, operator ceremony, asset/liquidity testing, invariant and fork testing, deployment controls, external audit, and legal approval are complete.

## Legacy code

`contracts/src/StockPackz.sol`, `KeeperRandomnessCoordinator`, the old SDK, and stock-oriented frontend components are retained legacy code. They are not the HoodPackz V2 security boundary. The HTTP keeper is retired and the V2 preview does not route user funds into the legacy deployment.

## Responsible disclosure

Do not open a public issue for vulnerabilities. Use GitHub private vulnerability reporting for this repository and include reproduction steps, affected components, and impact.

Reports are targeted for acknowledgement within 48 hours and triage within 7 days. Allow reasonable remediation time before disclosure.
