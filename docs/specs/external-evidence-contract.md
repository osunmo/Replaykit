# External-suite evidence contract

Approved by the user in this chat on 2026-10-17. The full approved proposal is preserved in the chat output CONTRACT_PROPOSAL.md.

Legacy R1 keeps its strict execution schema and its charge/request acceptance predicates. External official-suite evidence uses a separate versioned schema and evaluator; no missing charge value, telemetry field, incident metadata or variant label selects that evaluator. Trusted operator configuration selects a pinned benchmark manifest. Never translate suite outcomes into synthetic charge counts.

The supervisor collects official reporter JSON, exit status, the required FAIL_TO_PASS/PASS_TO_PASS inventory, failure identity, source-content and patch-content hashes, pinned image digest, isolation inspection and measured execution wall time. Missing, malformed, skipped or incomplete official evidence fails closed. Candidate assertions and stdout booleans are not authoritative evidence.

Trusted configuration pins a full base commit and full official test-file hash.
Every execution must report the same base and actual test-file content hash in its
source inventory. The narrow added-test profile may extract one complete new
`it` statement for the unchanged static check only if all other pinned bytes,
control statement parsing and directive prologues are preserved. The complete
official file still runs and is hash-bound. No hook/helper/import/control edit or
assertion-frame relabeling is permitted. The implemented helpers are not a runner;
real in-container collection, patch apply/check and filesystem inspection remain
required. Missing application identity cannot satisfy the identity gate.

Both entry points require 10 fresh buggy failures, 3 reference successes, 3 alternate successes, a genuinely failing decoy, consistent candidate bytes, correct buggy failure identity, independent execution IDs, offline isolation, fresh state and static review. Infrastructure failures are ERROR. External Stage A additionally requires all four requested sensitivity runs. Existing R1 null-charge and request-count rejection behavior must remain unchanged.
