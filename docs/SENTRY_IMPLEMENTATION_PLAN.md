# Secure Sentry and editor integration

The 2026-10-17 user instructions supersede the proposed D2/N5 milestone. Implement the specified Sentry import and editor workflow around the existing R1 engine. No new benchmark cases, performance experiments, dashboard, or patch verifier are in this scope.

## Execution order

1. Secure adapter: validate URL syntax and numeric issue identifiers before authentication; resolve once, validate every address, and pin the connection while retaining TLS hostname verification. Reject every redirect. Normalize bounded responses without retaining raw API payloads. Bind opaque releases to an explicitly approved immutable image and application source hash.
2. Shared runtime and CLI: persist imports in managed directories, provide safe inspection and explicit reproduction. Wrap the existing orchestration in asynchronous jobs, atomic status, cancellation, progress, and bounded artifact retrieval. Keep ten buggy, three reference, three alternate, and one decoy execution with every judge gate. Limit execution concurrency to three, require fresh initdb and fsync on.
3. Dedicated synthetic demo: invoke the actual local payment implementation and capture its genuine invariant exception with the Sentry Node SDK. This is outside the offline judge. Missing Sentry configuration blocks transmission and live acceptance; unit fixtures cannot satisfy it.
4. MCP: expose the shared import/runtime operations over the supported TypeScript SDK's stdio transport. Validate all inputs and reserve stdout for protocol messages. Test with a real spawned protocol client.
5. Extension: package a VS Code extension with a ReplayKit activity view, import, inspect, reproduce, progress, cancellation, test/report opening, and source navigation. Store tokens in SecretStorage and pass them only through child environment. Use the same CLI/runtime; no parallel engine implementation. Document manual Cursor MCP setup and report actual editor testing separately.

## Independent work

Future provenance adds application, controller, judge, lockfile and image hashes, Git state, and execution settings. Historical measurements remain untouched. Adapter and runtime work may proceed concurrently; user-facing integrations follow the adapter/CLI contract.

## Validation

Test URL confusion, DNS/public address validation and pinned lookup, redirects, authentication/scopes, response bounds, scrubbed/truncated fields, missing traces/body, unsupported releases, prompt injection, and canary-token non-disclosure. Exercise managed path/symlink rejection, restart/interruption, cancellation and missing Docker. Run unit/type/lint/build/format checks, PostgreSQL integration, MCP protocol tests, extension tests, the full R1 smoke and existing security probes. Mark live Sentry and editor acceptance UNVERIFIED unless actually executed. Never present a preliminary failure as VERIFIED.

## Environment inspection

At the start of this milestone, SENTRY_AUTH_TOKEN, SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT and SENTRY_BASE_URL were absent. Only presence was inspected. Live Sentry acceptance is blocked until the required configuration exists. VS Code is available on PATH; Cursor was not found there.
