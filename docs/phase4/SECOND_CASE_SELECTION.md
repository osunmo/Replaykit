# Second Authentic Case Selection: Fastify Issue #4807

**Auditor / Architect:** Independent Research & Orchestration Agent  
**Date:** 2026-10-20  
**Status:** **ACCEPTED & VERIFIED**  
**Selected Target:** `fastify/fastify` Issue #4807 / PR #4826  
**Defect Category:** Backend Web Framework HTTP Request Lifecycle & Error Handling (`TypeError: Cannot read properties of undefined (reading 'config')`)

---

## 1. Executive Summary & Selection Decision

To demonstrate ReplayKit's real-world generalization beyond utility functions (`ljharb/qs`), we evaluated candidate incidents across major backend and service-level Node.js projects (including `expressjs/express`, `fastify/fastify`, and `medusajs/medusa`).

We have selected **Fastify Issue #4807 (PR #4826)**:
- **Repository:** `https://github.com/fastify/fastify.git`
- **Authentic Buggy Base Commit:** `61b86760019c85afbef6cc0f175c75870381ed04`
- **Authentic Reference Fix Commit:** `c2b89732d583a0e0d8e0a666b2eb9b62610edf34`
- **Reported Incident:** Accessing `req.routeConfig` in a custom `frameworkErrors` handler crashes with native `TypeError: Cannot read properties of undefined (reading 'config')`.
- **Root Cause:** In Fastify's request property getter (`lib/request.js`), `routeConfig` blindly reads `this[kRouteContext][kPublicRouteContext].config`. When a malformed URL triggers a framework error (`FST_ERR_BAD_URL`) before routing completes, `kPublicRouteContext` is `undefined`.
- **Verification Environment:** Fully compatible with Node.js 18, 20, and 22; zero network sockets required (utilizes Fastify's in-memory `fastify.inject` HTTP engine); execution wall time < 1 second.
- **Candidate Discrimination:** Supports authentic reference fix, structurally distinct alternate fix, plausible semantic decoy fix, and an epistemic insufficient-oracle negative control.

---

## 2. Alternatives Evaluated & Rejection Analysis

| Candidate Incident | Category | Repository | Verdict | Rejection / Selection Rationale |
| :--- | :--- | :--- | :---: | :--- |
| **Express.js Issue #1317** (`res.redirect` + `Accept: application/octet-stream`) | HTTP Content Negotiation | `expressjs/express` | **REJECTED** | **Dependency & Engine Rot:** Dates to 2012 (Express 3.0.0-rc4). Requires Node 0.8/0.10, making modern container execution (`node:22-bookworm-slim`) fragile with ancient unmaintained devDependencies and deprecated APIs. |
| **Express.js 4.16.2 Buffer ETag** (`TypeError` in `res.send`) | HTTP Response Serialization | `expressjs/express` | **REJECTED** | **Runtime Environment Disparity:** The bug in `lib/response.js` called `Buffer.byteLength(chunk)` with a `Buffer` instance, which threw `TypeError` on Node.js 8, but Node.js 14+ natively accepts `Buffer` in `Buffer.byteLength()`, meaning the bug **does not reproduce on modern Node 20/22 runtime environments**. |
| **Fastify Issue #7113** (`HEAD` route on web standard `Response`) | Web Standards Compatibility | `fastify/fastify` | **REJECTED** | **Unconfirmed Resolution:** Issue remains open in upstream Fastify 6.0-alpha without an accepted merge commit or peer-reviewed reference repair. |
| **Medusa Commerce Order State** (`medusajs/medusa`) | E-Commerce Backend Service | `medusajs/medusa` | **REJECTED (Deferred)** | **Heavyweight Infrastructure Burden:** Requires active PostgreSQL database instance, Redis event bus, complex database migrations, and long cold-start container initialization (~60–120s), violating ReplayKit's requirement for fast, lightweight, and isolated test suites. |
| **Fastify Issue #4807 / PR #4826** (`req.routeConfig` in `frameworkErrors`) | HTTP Lifecycle & Router Error Handling | `fastify/fastify` | **SELECTED** | **Meets 100% of Criteria:** Authentic public bug report, exact pinned buggy and fixed commits, deterministic `TypeError` on modern Node 22, in-memory `fastify.inject` execution, clear behavioral contract, and robust four-target semantic discrimination. |

---

## 3. Incident Provenance & Deep Technical Audit

### 3.1 Public Incident Details
- **Issue URL:** [https://github.com/fastify/fastify/issues/4807](https://github.com/fastify/fastify/issues/4807)
- **Pull Request URL:** [https://github.com/fastify/fastify/pull/4826](https://github.com/fastify/fastify/pull/4826)
- **Title:** `Accessing req.routeConfig in frameworkErrors handler throws TypeError`
- **Reported By:** Community user (`Alexandre-Casq`, opened on May 19, 2023)
- **Merged Date:** May 26, 2023 (by Fastify core team lead Manuel Spigolon)

### 3.2 Commit Ancestry & Git Trees
- **Buggy Parent Commit:** `61b86760019c85afbef6cc0f175c75870381ed04`
- **Fixed Merge Commit:** `c2b89732d583a0e0d8e0a666b2eb9b62610edf34`
- **File Under Repair:** `lib/request.js`

### 3.3 Root Cause Analysis
In Fastify's request abstraction (`lib/request.js`), property getters provide access to routing metadata:
```javascript
routeConfig: {
  get () {
    return this[kRouteContext][kPublicRouteContext].config
  }
}
```
When a client sends a malformed URI component (such as `GET /test/%world`), the URL parser throws an `FST_ERR_BAD_URL` error before router lookup completes. Fastify invokes the user-configured `frameworkErrors` handler:
```javascript
const fastify = Fastify({
  frameworkErrors: function (err, req, res) {
    console.log(req.routeConfig); // CRASHES HERE
    res.send(err.message);
  }
});
```
Because no route was ever matched, `this[kRouteContext][kPublicRouteContext]` is `undefined`. Accessing `.config` causes Node.js to throw:
```text
TypeError: Cannot read properties of undefined (reading 'config')
    at Request.get routeConfig (lib/request.js:201:52)
```

### 3.4 Upstream Reference Fix
Upstream PR #4826 introduced optional chaining:
```javascript
routeConfig: {
  get () {
    return this[kRouteContext][kPublicRouteContext]?.config
  }
}
```
Along with identical optional chaining for `routerPath`, `routerMethod`, and `routeOptions`.

---

## 4. Four-Target Semantic Discrimination Plan

| Target Role | Implementation | Expected Exit Code | Expected Failure / Behavior | Semantic Purpose |
| :--- | :--- | :---: | :--- | :--- |
| **1. Buggy Base** | Commit `61b86760...` (Unpatched `lib/request.js`) | `1` | `FAIL`: `TypeError: Cannot read properties of undefined (reading 'config')` | Reproduces native production incident telemetry. |
| **2. Reference Fix** | Commit `c2b89732...` (Upstream PR #4826: optional chaining `?.config`) | `0` | `PASS`: `req.routeConfig === undefined`, response completes cleanly | Proves upstream authentic repair resolves incident. |
| **3. Alternate Fix** | Explicit ternary guard: `this[kRouteContext][kPublicRouteContext] ? this[kRouteContext][kPublicRouteContext].config : undefined` | `0` | `PASS`: `req.routeConfig === undefined` | Proves candidate patch invariance across syntactic variations. |
| **4. Decoy Fix** | Shallow fallback returning empty object: `this[kRouteContext][kPublicRouteContext] ? this[kRouteContext][kPublicRouteContext].config : {}` | `1` | `FAIL`: `AssertionError: expected {} to equal undefined` | Rejects plausible but semantically flawed fix that violates the contract. |

---

## 5. Blinding, Leakage & Oracle Provenance

### 5.1 Blinding Plan
- **Workspace Isolation:** Fastify source tree is staged without `.git`, commit messages, PR #4826 diffs, or author comments.
- **Upstream Regression Test Withholding:** The historical test added in PR #4826 (`test/inject.test.js:459-487`) is scrubbed from the workspace prior to model invocation.
- **Anti-Leakage Scanning:** All staged files are scanned against forbidden tokens: `c2b89732d583a0e0d8e0a666b2eb9b62610edf34`, `FST_ERR_BAD_URL`, PR title, patch hashes, and author handles.

### 5.2 Behavioral Contract (Oracle Specification)
- **Permitted Oracle Context:**
  "When a request fails early due to an invalid URL or framework error before routing completes, `req.routeConfig`, `req.routerPath`, and `req.routerMethod` must return `undefined` rather than throwing an unhandled `TypeError`. A custom `frameworkErrors` handler must be able to inspect these properties and return an HTTP response."
- **Source Type:** `api_documentation` & `upstream_issue_spec`.

### 5.3 Negative Control Plan (Insufficient Oracle)
- If the behavioral contract does not specify what `routeConfig` should evaluate to when routing is aborted (i.e. whether it should return `undefined`, `null`, throw a structured `RouteNotFoundError`, or return empty object `{}`), ReplayKit must produce `INSUFFICIENT_ORACLE` without fabricating assertions.

---

## 6. Conclusion & Recommendation

Fastify Issue #4807 is an ideal, robust, and authentic second case. It directly addresses the orchestrator's mandate to move beyond utility functions into **API/backend HTTP lifecycle error handling**, while maintaining deterministic container evaluation and absolute cryptographic integrity.
