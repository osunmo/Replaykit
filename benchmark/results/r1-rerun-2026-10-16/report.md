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
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 26278 | [JSON](executions/71ad0ab2-3d71-4bea-bbdd-ddc503cbb45e/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 26491 | [JSON](executions/4331f2d2-913a-457d-82b3-8609436f4cf8/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 21860 | [JSON](executions/c4082f7b-5568-4302-9365-6889d0e6bf44/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 22087 | [JSON](executions/8876543b-1acd-49cf-b7d2-0fdc1a3e82dc/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 24683 | [JSON](executions/46f3d429-3788-4d30-a1bf-1bfecc9b275e/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 24989 | [JSON](executions/cf29f277-d999-429e-97af-6fb58494dedc/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 29345 | [JSON](executions/711fb257-cde6-44c4-8237-11067f30b890/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 29695 | [JSON](executions/104faed4-6b24-4436-94fb-9ba4f9d2c82c/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 22647 | [JSON](executions/08f10e86-1962-4bc0-b0e1-10a04f3aba5e/evidence.json) |
| buggy | COMPLETED | 1 | 2 | DuplicatePaymentError @ payments/createPayment | 22851 | [JSON](executions/31552f13-5c19-4065-825f-ea827b8566e0/evidence.json) |
| reference | COMPLETED | 0 | 1 | none | 18635 | [JSON](executions/e48bea58-4b47-4006-af6a-c141b7384490/evidence.json) |
| alternate | COMPLETED | 0 | 1 | none | 21228 | [JSON](executions/703a0346-d8c5-4d40-a720-b0bd154428ea/evidence.json) |
| decoy | COMPLETED | 1 | 2 | none | 23781 | [JSON](executions/3deb4cd7-733e-4c95-add3-f14e17ad58d2/evidence.json) |

Total execution time: 314570 ms. Model tokens: N/A (deterministic planner).

Candidate stdout is untrusted. Charge counts come from the supervisor querying PostgreSQL; failure identity comes from the application container logs. Image identifiers, source hashes and inputs are saved with this run.
