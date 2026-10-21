---
description: Non-negotiable engineering standards for ReplayKit codebase including TypeScript strictness, Zod validation, platform safety, and protected file preservation.
globs: ["**/*.ts", "**/*.js", "**/*.json"]
---

# ReplayKit Engineering Standards

All contributors and autonomous agents modifying ReplayKit must adhere to these non-negotiable engineering standards.

## 1. Protected Files Immutability (Zero-Diff Rule)

The benchmark evaluation core and foundational contracts must remain strictly unmodified:
- `packages/judge/src/evaluate.ts`
- `packages/contracts/src/index.ts`

Any modification to these two files will immediately fail verification:
```powershell
git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts
```
If an integration or CLI extension requires additional types, add them to `packages/contracts/src/incident-context.ts`, `packages/contracts/src/external.ts`, or local package schemas. Never alter the core judge contracts.

## 2. TypeScript and Module Standards

- **Strict Type Checking**: All TypeScript code must compile under `tsc --noEmit` without `@ts-ignore` or unchecked `any` casts.
- **ESM-First**: Use native Node.js ECMAScript Modules (`"type": "module"`). All relative imports must include the `.js` extension (e.g., `import { foo } from './foo.js'`).
- **Runtime Validation with Zod**: Every external input (CLI flags, incident JSON, configuration files, and supervisor outputs) must be parsed through a Zod schema before consumption.
- **Node.js 22 LTS Compatibility**: Rely only on Node.js built-in APIs supported in Node `>=22.13.0 <25`. Avoid introducing external runtime dependencies unless justified by an architectural requirement.

## 3. Platform & Windows PowerShell Execution Safety

Because ReplayKit operates across Windows, Linux, and macOS environments:
- **No PowerShell `curl` Aliases**: Never invoke `curl` directly in PowerShell commands; `curl` is an alias for `Invoke-WebRequest` which hangs on HTTP streams. Always invoke `curl.exe` or `(Invoke-RestMethod ...)`.
- **No Inline Multi-Line Scripts with Template Literals**: Do not execute multi-line inline JavaScript with carets (`^`) or backticks (`\``) via `tsx -e "..."` in PowerShell. Windows command interpreters can hang waiting for standard input. Always write scripts to a temporary disk file or execute via dedicated `.ts` script files.
- **Process Tree Teardown on Windows**: When terminating timed-out child processes on Windows, invoke `taskkill /pid <PID> /T /F` to terminate the entire sub-tree (including child `docker.exe` or WSL processes) rather than leaving orphaned pipes.
- **Path Portability**: Always normalize filesystem paths using `path.resolve` or `path.join`. For container paths, use forward slashes (`/case/...`).

## 4. Error Handling & Exit Codes

CLI and runtime entry points must enforce deterministic exit codes:
- **Exit Code 0**: Successful execution or `VERIFIED` verdict.
- **Exit Code 1**: Infrastructure, configuration, schema, or system error (e.g., Docker daemon unreachable, missing flag, invalid JSON).
- **Exit Code 2**: Authentic test failure or `REJECTED` / `NOT_REPRODUCED` verdict.
All error messages must be descriptive and logged to stderr without leaking secrets or credentials.
