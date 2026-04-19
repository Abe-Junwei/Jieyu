# Collaboration Cloud Gate Report (Auto Generated)

- Generated At: 2026/4/19 12:44:09
- Mode: enforce
- Decision: go

## Contract Metrics

| Metric | Target | Current | Status |
|---|---:|---:|---|
| protocol_contract_pass_rate | 100% | 100.00% (46/46) | PASS |
| cloud_service_contract_pass_rate | 100% | 100.00% (29/29) | PASS |
| workspace_entry_contract_pass_rate | 100% | 100.00% (20/20) | PASS |

## Findings By Severity

- P0 Count: 0
- P1 Count: 0
- P2 Count: 0

## Decision Semantics

1. enforce mode: any P0 leads to non-zero exit code.
2. shadow mode: P0 is reported but does not block.
3. Cloud gate requires all three contract pass rates to reach 100%.

