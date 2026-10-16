# ReplayKit execution report

Incident: **R1** — **NOT_REPRODUCED**

Scope: R1 synthetic payment scenario. This is a measured smoke run, not the full 20-case benchmark or a held-out evaluation.

| Check | Observed value |
| --- | --- |
| buggyFails | unavailable |
| sameFailureIdentity | unavailable |
| referenceFixPasses | unavailable |
| alternateFixPasses | unavailable |
| decoyFixStillFails | unavailable |
| deterministicRuns | 0 |
| deterministicFailures | 0 |
| offlineExecution | unavailable |
| isolatedExecution | unavailable |
| freshState | unavailable |
| noSleepBasedTiming | unavailable |
| reviewableTest | unavailable |
| sameCandidate | unavailable |

Reasons: MISSING_REQUEST_BODY

| Variant | Execution | Candidate exit | Trusted charges | Failure identity | Duration ms | Evidence |
| --- | --- | ---: | ---: | --- | ---: | --- |

Total execution time: 0 ms. Model tokens: N/A (deterministic planner).

Candidate stdout is untrusted. Charge counts come from the supervisor querying PostgreSQL; failure identity comes from the application container logs. Image identifiers, source hashes and inputs are saved with this run.
