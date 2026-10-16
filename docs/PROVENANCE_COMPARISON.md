# Comparison of the 219-second R1 run

Read-only comparison on 2026-10-16. No benchmark or Docker execution was performed for this check. Source records are preserved in [r1-performance.json](measurements/r1-performance.json).

The 219.051-second run, `2e08d0cd-b9de-4aa3-93d9-9392c379feb9` (`local-concurrency3`), does **not** have the same application image IDs as the original five measurements, the nine PostgreSQL experiments, or either final validation. The comparison does not isolate host state as the cause of its longer duration.

All 17 records have the same four `sourceHashes` and generated candidate test hash. However, the [builder](../scripts/build-sandbox.ts) hashes only each compiled `payment-policy.js` for `sourceHashes[variant]`. Those fields do not cover the shared application or the host controller. The builder calculates a separate shared `appSourceHash` for image labels/tags, but that field is absent from the saved measurement manifest.

The candidate test hash across all records is `16fea9fa5391aa587ee3145d9d091a79bf89295db85b2b7ec117c5cb00424102`.

## Image identities

The table shows the first ten hexadecimal digits of each SHA-256 image ID for readability. The linked JSON retains full IDs.

| Group                                | Buggy        | Reference    | Alternate    | Decoy        | Candidate image | Planner image |
| ------------------------------------ | ------------ | ------------ | ------------ | ------------ | --------------- | ------------- |
| Original five measurements           | `9be237516d` | `9df5fee2ab` | `1504ba6b32` | `cf51d75968` | `0c35c9e7ad`    | `121d1bd73f`  |
| User's 219.051 s run                 | `463cc53700` | `baa07d30e5` | `3a7ee0f0f9` | `eb5688198e` | `e1d9b5588a`    | `df2e8539b5`  |
| Nine `pg-*` experiments              | `e7d68a1a18` | `db06abbd4b` | `d55c6f0ef0` | `7cd8f722f9` | `ef757ad847`    | `1d03d6860c`  |
| Final template validation, 172.025 s | `e359bc8873` | `55348ab9a6` | `acf63faa25` | `5b037521a8` | `9bc3904c03`    | `1c4e77d7e4`  |
| Final default validation, 205.716 s  | `fa1ef32671` | `e8f7ec5048` | `2a9d269ba0` | `475485cc40` | `32ea881059`    | `4c878d5f58`  |

Node base identity matches across the records. The stock PostgreSQL image matches the initdb records; template executions intentionally use a different runtime image. The user's run and the eleven later raw measurements also record the same dependency-lock hash, Node/platform and Docker CPU/memory capacity. Matching capacity does not establish matching host load.

## Interpretation limits

The change from `3ac135d` to `1b629e8` includes a shared application refactor: the same database DDL became exported `schemaStatements` used by both application initialization and the template builder. It also changes the sandbox/measurement controller for template selection, fsync provenance and optional sampling. These are outside the four variant policy hashes.

Different image IDs alone do not establish different behavior: rebuilding can change image metadata. Conversely, equal application image IDs would not establish equal harness code or settings. The historical measurements do not record a controller commit/source digest, and the experiments intentionally vary some settings.

The matched concurrency-three repetitions within the nine-run experiment still show substantial variation: initdb 88.423–130.295 seconds and template 99.345–143.961 seconds. That supports caution about small apparent effects. It does not identify a particular saturated host component or prove a code-versus-host causal split.

The retained decision is unchanged: fresh initdb, concurrency three and fsync on. Performance investigation is closed for this milestone. No substrate benchmark, host profiling run, Linux migration or additional timing sweep was performed in response to this review.
