# Benchmark status and R1 protocol

This directory currently supplies one synthetic case: R1, payment retry idempotency. It is the first vertical slice of the twenty-case specification in `AGENTS.md`.

## R1 contract

The same payment request is sent twice. Its client idempotency key, order identifier and amount remain unchanged. A valid implementation leaves one provider charge and returns the original payment for a retry. The intentionally faulty policy creates a new provider idempotency key on every attempt, producing two durable charges and a real `DuplicatePaymentError` from the payment operation.

The policies in `private/R1` are build inputs for the trusted evaluator:

| Variant        | Mechanism                                                             | Required role in evaluation                                |
| -------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `buggy.ts`     | Fresh payment ID becomes the provider key.                            | Real duplicate observed in all ten fresh buggy executions. |
| `reference.ts` | Client idempotency key becomes the provider key.                      | Candidate passes with one charge.                          |
| `alternate.ts` | Prior durable charge is retrieved before a new provider call.         | Same candidate passes with one charge.                     |
| `decoy.ts`     | Duplicate charge remains, while domain-error reporting is suppressed. | Candidate still fails the ledger invariant.                |

These are expected case semantics, not measured run results. Recorded execution evidence determines the actual verdict. Variants are separate source artifacts and compiled into separate immutable-image snapshots; a production environment variable does not select their behavior.

## Visible evidence and planner boundary

Incident capture runs actual synthetic traffic and records the request, stack-derived failure identity, persisted-attempt breadcrumbs and real OpenTelemetry spans. The deterministic planner accepts normalized visible evidence over stdin in a dedicated restricted container. Its image contains the public buggy app snapshot and planner/contracts code, with no private variants, Git history or host mounts. It recognizes repeated matching client keys with provider-key drift; it does not use incident IDs to select answers or read these private policies.

Candidate containers receive only their generated test and the replay SDK. They have no network, source checkout, Git refs, private policies or database credentials. The trusted controller can read the development repository and build all variants. Planner/candidate packaging isolates those runtimes, while a future tool-using model planner still needs audited tool boundaries. The development controller and current one-case corpus do not constitute a held-out evaluation.

## Running and reviewing

After `pnpm build` and `pnpm sandbox:build`, run `pnpm benchmark smoke`. Review `runs/<run-id>/result.json`, `matrix.json`, `report.md` and the per-execution ledger, logs and isolation inspection. The full protocol, gates and artifact map are in [docs/EVALUATION.md](../docs/EVALUATION.md).

Smoke additionally checks a wrong application-frame rejection and a missing-body abstention. Those checks do not stand in for the complete N1–N5 case set. Unit test evidence fixtures are synthetic inputs to test evaluator logic; they must never be reported as measured application executions.

## Unfinished benchmark work

The remaining nineteen cases, complete twenty-case corpus, versioned truth schema/files, fixed twelve-development/eight-held-out split, agent-alone and model-based baselines, three independent trials, missing-data metrics, aggregate rates and cost comparisons remain incomplete. Do not publish a twenty-case reproduction rate or held-out score from R1 smoke.

The cooperative scheduler exists as a unit-tested library but is not integrated into database race cases. Full checkout orders/inventory/webhooks, Cursor integration, external incident validity studies and arbitrary candidate-patch verification also remain outside this implemented slice. See [docs/LIMITATIONS.md](../docs/LIMITATIONS.md).
