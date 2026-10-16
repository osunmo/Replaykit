# R1 application invariant audit

`DuplicatePaymentError` originates in the shared payment implementation, after real PostgreSQL operations have created more than one charge for the same client idempotency key. The buggy policy changes provider-key selection; it does not inject an exception. This audit covers the synthetic R1 payment scenario.

## Origin and durable state

[The shared payment implementation](../apps/checkout-api/src/payments.ts) opens a transaction and takes an advisory lock for the client idempotency key. It rejects conflicting reuse of that key, obtains or creates a provider charge, and records the payment attempt. Provider charging uses a parameterized `INSERT ... ON CONFLICT (provider_key) DO NOTHING`; [the database schema](../apps/checkout-api/src/database.ts) makes `provider_key` unique. A fresh provider key therefore permits a second actual ledger row even when the client key is unchanged.

The shared implementation checks the business invariant with this query, binding the request's idempotency key as `$1`:

```sql
SELECT COUNT(*)::integer AS count
FROM public.charges
WHERE client_key = $1
```

It commits the charge and attempt records before raising `DuplicatePaymentError` when that count exceeds one and exception suppression is disabled. Its error handler only rolls back transactions that have not committed. The duplicate rows remain observable by a separate connection after the error. The error's `chargeCount` property is the separately queried total for the order; the invariant condition itself uses the client-key count.

This is an application-level invariant guard used as benchmark instrumentation. It detects the observed database state and is shared by all application images. It is not a native PostgreSQL constraint error. The synthetic provider uses a local PostgreSQL ledger; the benchmark does not contact or charge an external payment service.

[The HTTP application](../apps/checkout-api/src/app.ts) catches the actual error, returns HTTP 409, and records its observed attempts, spans and stack. [Frame normalization](../apps/checkout-api/src/stack-frames.ts) derives `payments/createPayment` from that error's application stack.

## Policy behavior

| Variant                                           | Charging behavior                                                                                      | Shared duplicate guard                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [Buggy](../benchmark/private/R1/buggy.ts)         | Generates a new provider key for each retry, producing two charges.                                    | Enabled. The second payment detects the duplicate and throws.                            |
| [Reference](../benchmark/private/R1/reference.ts) | Passes the client idempotency key to the provider; the unique provider key reuses the original charge. | Enabled. Normal retries leave one charge.                                                |
| [Alternate](../benchmark/private/R1/alternate.ts) | Reuses the existing charge for the client key before another provider charge is attempted.             | Enabled. Normal retries leave one charge.                                                |
| [Decoy](../benchmark/private/R1/decoy.ts)         | Keeps generating new provider keys and leaves duplicate charges.                                       | Deliberately suppresses the error, masking the symptom while retaining the faulty state. |

The valid implementations retain the same SQL count and throw condition as the buggy implementation. Only the decoy sets `suppressDuplicateError` to true.

## Executed regression coverage

`pnpm test:integration` passed all **14 PostgreSQL integration tests** during performance hardening on 2026-10-16. [The integration suite](../apps/checkout-api/test/payments.integration.test.ts) checks the actual buggy error and normalized frame, two durable buggy charges, both valid fixes, concurrent identical requests, conflicting payloads, input validation and the symptom-hiding decoy.

Two added tests seed two real charge rows with the same client key and distinct provider keys, then invoke the reference and alternate implementations separately. Both still raise `DuplicatePaymentError` with a charge count of two. Each test confirms that both charge rows remain and a payment attempt was committed. These regression tests demonstrate that the valid policies retain the invariant check; they are not additional benchmark cases.

[The generated candidate](../packages/planner/src/index.ts) sends the same payment twice and asserts that the order has exactly one charge. The decoy's suppressed HTTP error cannot satisfy that assertion. [The supervisor](../packages/judge/src/sandbox.ts) independently queries PostgreSQL and collects application logs, and [the strict judge](../packages/judge/src/evaluate.ts) requires a failing decoy test, more than one trusted charge and at least two requests. A successful process exit or candidate-supplied output alone cannot establish reproduction. The same candidate bytes must also pass all three reference executions and all three alternate executions, alongside the remaining strict verification gates.
