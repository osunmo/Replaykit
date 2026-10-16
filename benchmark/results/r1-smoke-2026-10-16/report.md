# ReplayKit execution report

Incident: **R1** — **VERIFIED**

Scope: R1 synthetic payment scenario. This is a measured smoke run, not the full 20-case benchmark or a held-out evaluation.

| Check | Observed value |
| --- | --- |
| buggyFails | true |
| sameFailureIdentity | true |
| referenceFixPasses | true |
| alternateFixPasses | true |
| decoyFixStillFails | true |
| deterministicRuns | 10 |
| deterministicFailures | 10 |
| offlineExecution | true |
| isolatedExecution | true |
| freshState | true |
| noSleepBasedTiming | true |
| reviewableTest | true |
| sameCandidate | true |

Reasons: All required gates satisfied.

| Variant | Execution | Candidate exit | Trusted charges | Failure identity | Duration ms | Evidence |
| --- | --- | ---: | ---: | --- | ---: | --- |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 23681 | [JSON](executions/cbbf8061-c208-4381-8452-9979058ab841/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 23870 | [JSON](executions/fe310515-5815-4cdd-a82d-ed682eb61351/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 21759 | [JSON](executions/b999f595-74ca-41f3-b07a-9bd81eaab14d/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 21966 | [JSON](executions/3b57a77a-4157-48d5-99bc-9c67fc88017e/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 25766 | [JSON](executions/6304eb0c-7d78-4bcc-b1e8-6939d2ff5f54/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 25970 | [JSON](executions/d11ed37e-dc9b-4ce3-b3de-e01f0c73a267/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 22453 | [JSON](executions/c7e0f246-4890-4a16-853e-71a52388eb47/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 22823 | [JSON](executions/ade639fe-41a6-474e-b550-290cc7f2a0c8/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 28973 | [JSON](executions/1c1781e7-2a8b-4202-979f-c75e7e9d1eb9/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 29217 | [JSON](executions/c5c08646-a314-481f-94d2-d5e7b646ba15/evidence.json) |
| reference | COMPLETED | 0 | 1 | none | 23076 | [JSON](executions/9db3415e-57d5-4646-9697-e49c664ad305/evidence.json) |
| alternate | COMPLETED | 0 | 1 | none | 23220 | [JSON](executions/7552af0c-e071-4301-a44d-63c559b3ae42/evidence.json) |
| decoy | COMPLETED | 1 | 2 | none | 25984 | [JSON](executions/ede39e3c-6511-4264-973c-ffe2af315c7a/evidence.json) |

Total execution time: 318758 ms. Model tokens: N/A (deterministic planner).

Candidate stdout is untrusted. Charge counts come from the supervisor querying PostgreSQL; failure identity comes from the application container logs. Image identifiers, source hashes and inputs are saved with this run.
