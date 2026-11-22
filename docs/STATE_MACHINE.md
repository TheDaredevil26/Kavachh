# Claim Lifecycle State Machine

## 1. State Diagram
```
 CORE PATH
 filed ──► validated ──► scoring ──► decided ──► payout_pending ──► paid ──► closed
   │           │            │           │              │              │
   │           │            │           │              ▼              ▼
   │           │            │           ▼          payout_failed    disputed
   │           │            │         held ◄───────────┘              │
   ▼           ▼            ▼           │                             ▼
 rejected   cancelled    rejected       ├──► payout_pending   (dispute upheld → adjustment)
                                        ├──► rejected         closed (dispute rejected)
                                        └──► expired
```

## 2. Allowed Transitions Table
| From State | Allowed Target States | Trigger Actor |
|---|---|---|
| `filed` | `validated`, `rejected`, `cancelled` | Validation worker / worker cancel |
| `validated` | `scoring`, `cancelled` | Coverage reserved, fraud-eval enqueued |
| `scoring` | `decided`, `rejected` | ML result or hard rule check |
| `decided` | `payout_pending`, `held` | Decision engine (confidence score threshold) |
| `held` | `payout_pending`, `rejected`, `expired` | Tenant admin manual review / 24h SLA |
| `payout_pending` | `paid`, `payout_failed` | Payout worker bank integration |
| `payout_failed` | `payout_pending`, `held` | BullMQ exponential retry / escalation |
| `paid` | `closed`, `disputed` | 2-hour delayed BullMQ job / worker dispute |
| `disputed` | `closed`, `payout_pending` | Admin dispute resolution |
| `closed` | *None* | Terminal state |
| `rejected` | *None* | Terminal state |
| `cancelled` | *None* | Terminal state |
| `expired` | *None* | Terminal state |

## 3. Concurrency & Integrity
- All transitions execute within a PostgreSQL transaction holding a `SELECT ... FOR UPDATE` row lock on `claims`.
- Every transition appends to the immutable audit trail table `claim_state_transitions`.
- State versions (`state_version`) increment monotonically on every step.
- `claim.state_changed` notifications are emitted to Redis pub/sub strictly **after** transaction commit.
