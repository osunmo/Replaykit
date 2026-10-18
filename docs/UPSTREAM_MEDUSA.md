# Upstream Investigation Report — Medusa.js (Issue #15593)

## 1. Executive Summary

- **Target Repository**: [medusajs/medusa](https://github.com/medusajs/medusa) (MIT License)
- **Target Issue**: [#15593](https://github.com/medusajs/medusa/issues/15593) (`Account holder with provider_id: ... already exists` on retry)
- **Merged Upstream PR**: [#15618](https://github.com/medusajs/medusa/pull/15618) (`fix(core-flows): keep customer account-holder link on a failed payment-session init`)
- **Status**: **Bug confirmed with the upstream project's own test on pinned commits. No ReplayKit verification exists for Medusa.**

The bug reported in Medusa.js issue #15593 was reproduced and verified directly using Medusa's official upstream integration test suite against PostgreSQL 17. **No ReplayKit verification** was performed; ReplayKit did not execute its 17-run verification matrix or issue an independent judge verdict for this case. An earlier synthetic simulation was removed.

---

## 2. Upstream Provenance & Pinned Commits

| Attribute | Details |
| --- | --- |
| **Repository URL** | `https://github.com/medusajs/medusa` |
| **Repository License** | MIT |
| **Original Issue URL** | `https://github.com/medusajs/medusa/issues/15593` |
| **Merged Upstream PR** | `https://github.com/medusajs/medusa/pull/15618` |
| **PR Title** | `fix(core-flows): keep customer account-holder link on a failed payment-session init` |
| **PR Author** | Martin Meredith |
| **Co-Author** | Nicolas Gorga (`@NicolasGorga`) |
| **Base Buggy Commit** | `1eb56d1111c10cbd33da578e2c45da8b21cb93d7` |
| **Merged Fix Commit** | `5296f51121d4796b1757b65852c48e97e0e1e197` |

---

## 3. Bug Mechanism & Root Cause Analysis

### 3.1 Distributed Saga Compensation Mismatch
Medusa 2.0 coordinates complex commerce flows using distributed workflow sagas (`@medusajs/workflows-sdk` and `@medusajs/orchestration`). In `createPaymentSessionsWorkflow` (`packages/core/core-flows/src/payment-collection/workflows/create-payment-session.ts`):

1. **Account Holder Step**: `createPaymentAccountHolderStep` was explicitly configured with `noCompensation: true`, ensuring that if the workflow subsequently rolled back, the payment account holder row created in PostgreSQL (`payment_account_holder` table) survived.
2. **Remote Link Step**: `createRemoteLinkStep`, which establishes the link between `customer.id` and `account_holder.id` across module boundaries (`link_customer_account_holder` table), **did not** have `noCompensation: true`.

### 3.2 Rollback and Collision Sequence
When payment session initialization fails downstream (e.g. payment provider rejection or transient network error):
1. **Rollback**: The workflow engine unwinds executed steps in reverse order. Because `createRemoteLinkStep` lacked compensation protection, the customer-to-account-holder link was deleted from PostgreSQL. However, the account holder row survived in `payment_account_holder`.
2. **Orphaned State**: The account holder row became an orphan: present in PostgreSQL with `(provider_id, external_id)`, but disconnected from `customer.account_holders`.
3. **Retry Init Collision**: When the customer retried payment session initialization (e.g. POST `/store/payment-collections/:id/payment-sessions`):
   - `existingAccountHolder` query found no linked account holder for the customer.
   - The workflow attempted to create an account holder again by calling `paymentModuleService.createAccountHolder()`.
   - The payment provider returned the same customer account holder ID.
   - Medusa attempted to insert `(provider_id, external_id)` into `payment_account_holder`.
   - **PostgreSQL Unique Constraint Violation**: The unique index `IDX_payment_account_holder_provider_id_external_id` rejected the insert with:
     ```
     duplicate key value violates unique constraint "IDX_payment_account_holder_provider_id_external_id"
     ```
   - Medusa wrapped this error as:
     ```
     MedusaError: Account holder with provider_id: pp_account-holder_test, external_id: cus_..., already exists.
     ```
   - Because the orphaned row remained in the database without its customer link, all subsequent retries failed indefinitely.

### 3.3 The Merged Upstream Fix (PR #15618)
The merged upstream fix added `.config({ noCompensation: true })` to `createRemoteLinkStep`:
```typescript
createRemoteLinkStep([
  {
    [Modules.CUSTOMER]: {
      customer_id: paymentCustomer.id,
    },
    [Modules.PAYMENT]: {
      account_holder_id: accountHolder.id,
    },
  },
]).config({
  noCompensation: true,
})
```
With `noCompensation: true`, the link survives rollback alongside the account holder row. On retry, `existingAccountHolder` finds the existing link, reuses the account holder, and creates the session without duplicate key collisions.

---

## 4. Empirical Confirmation via Upstream Test

The bug and fix were confirmed by executing Medusa's upstream integration test:
- **Test File**: `integration-tests/http/__tests__/payment-collection/store/account-holder.spec.ts`
- **Database Engine**: PostgreSQL 17 Alpine (Docker container `medusa-postgres`)
- **Buggy Commit Execution (`1eb56d1111c10cbd33da578e2c45da8b21cb93d7`)**:
  - The upstream test runs payment session initialization, simulates downstream failure, and retries.
  - Result: Fails deterministically with `Expected length: 1, Received length: 0` followed by `MedusaError: Account holder with provider_id: pp_account-holder_test, external_id: cus_..., already exists.`
- **Fixed Commit Execution (`5296f51121d4796b1757b65852c48e97e0e1e197`)**:
  - Result: Passes cleanly. The remote link persists across rollback, allowing the retry to identify the existing account holder and complete successfully.

---

## 5. Scope & Boundary Clarification

- **No ReplayKit Verification**: ReplayKit's 17-run execution matrix, candidate test generation, and independent judge evaluation (`packages/judge/src/evaluate.ts`) were not executed for Medusa #15593.
- **Simulation Removed**: Any synthetic external-runner mocking code (`packages/external-runner`) has been removed from ReplayKit.
- **R1 Benchmark Unaffected**: ReplayKit's existing R1 milestone, verification gates, and evaluation integrity remain intact and strictly separate from this upstream investigation.
