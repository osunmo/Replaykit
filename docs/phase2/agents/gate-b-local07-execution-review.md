# Gate B local-07 independent execution review

**Decision: scoped PASS for the authentic qs issue-33 buggy/fixed pair.** The saved local-07 raw evidence satisfies the pinned Node 22 Gate B pair contract and reproduces the same official per-test result accepted for local-06. This decision accepts only this paired preflight. The collector's `report.json` and `GATE_B_SUMMARY.md` correctly remain `PARTIAL`, `evidenceCollectionCompleted: true`, and `gateBAccepted: false` because those fields were written before independent review. This review does not accept the external ReplayKit runner or claim the alternate/decoy matrix, independent evaluator verdict, or ten fresh deterministic runs.

## Evidence and findings

- **Artifact integrity and scope.** I recomputed SHA-256 and byte length for all 370 entries in `artifact-sha256.json`. An independent enumeration of the scoped `commands`, `provenance`, both `evidence-*`, `npm-logs`, and summary files found exactly those 370 paths, with no missing, unlisted, or duplicate entry. The summary hash is `93f1fd575aedd66d1e32bd6bccb8fa4e74a7123ed4a97b0ee12c835f50201e52` and matches `report.json`. The artifact manifest does not cover the large source, payload, or Lab trees; I separately checked their saved inventories against actual files and hashes: 17 source files per role, 357 payload files per role, and 354 Lab bundle files. Both roles' `inputs-before.json` and `inputs-after.json` match their payload inventories. The role payload paths are identical and differ only in `lib/parse.js`, `lib/stringify.js`, and `lib/utils.js`.
- **Pinned source and dependency.** Actual saved Git HEAD/tree pairs are buggy `360e2b0b48548b9bfdb71f8c82a68c4f34ec0725` / `bc14fed42a7b001e837dc8d6b8f5b67279c35a82` and fixed `6a97ad1d71d8a9069f5d6002cab3130752519ccb` / `88c578810719c82c08739d610ed8cfd0bce9cae8`, matching the contract and accepted local-06 review. The buggy checkout's `test/parse.js` is intentionally changed from its prepatch source manifest; its current copy and both payload copies match the saved full official test at SHA-256 `be7137407c865b889674d1bb7a9a8317e8f605ff4ae189ef2a751feb0b9451a5`. The original buggy test hash `7669d4cad76e440e041eeaf212a133b85f4bd55aba6206a9d58df026d560d795` is preserved in provenance. The lock and registry records agree on exact Lab `3.0.0`, `https://registry.npmjs.org/lab/-/lab-3.0.0.tgz`, and the same integrity; the lock SHA-256 is `cb06631e8c6cb83e8199e3411184fabe674410427cf48b53dba7553f8cee750b`. Copied runbook, probe, adaptation, TAP verifier, Lab leak detector, and TAP reporter match their six predeclared SHA-256 pins.
- **Official raw suite.** Independently parsed `official.stdout` has one `1..56` plan and exactly one ordered result for every ID 1–56 in each role. The 56 titles are equal across roles and match local-06 raw per-test lines. Buggy has 55 `ok` and only `not ok 40 parse parses plain objects correctly`; fixed has 56 `ok`. Both footers give the exact expected tests/pass/fail/skipped/todo counts, with no SKIP or TODO per-test annotations. The buggy official stack contains `TypeError: source.hasOwnProperty is not a function` and `at exports.clone (/case/lib/utils.js:47:20)`. Official child exits are 1 and 0; neither has a signal, timeout, or launch error. Both raw `official.stderr` files contain one exact-eight adaptation marker and one `{"remaining":[]}` leak marker. The argv is the same full, unfiltered Lab TAP command with `--require /case/gate-b-lab-adaptation.cjs` and no `-l`.
- **Independent probe.** Raw probe stdout in each role shows `/case/index.js` and a passed unaffected direct control. Buggy exits 1 with native `TypeError`, message `source.hasOwnProperty is not a function`, and first stack frame `at exports.clone (/case/lib/utils.js:47:20)`; raw stderr independently repeats that error and frame. Fixed exits 0, has empty stderr, serializes issue-33 output exactly as `{"a":{"b":"c"}}`, and records a passed structural assertion. This is a library error in the buggy role, not a probe assertion.
- **Isolation, timing, sequence, and cleanup.** Saved raw create/inspect records show the pinned Node image digest, `--network none`, UID/GID 1000, read-only root, dropped capabilities, no new privileges, 1 CPU, 256 MiB memory, 64 PIDs, one private no-copy `/case` volume, bounded `/tmp` tmpfs, and no host bind. Each runtime records `/usr/bin/timeout` as PID 1 with `--signal=KILL 29s` independent of Docker attach and the Node event loop. Both containers exited 0 without OOM; measured lifetimes are 3,193.5162 ms and 1,330.1362 ms, below 30 seconds. The 101 command records contain 93 exit-0 and eight expected exit-1 absence checks, with no launch or client timeout. Raw ownership checks remove and confirm the buggy container and volume before fixed volume creation, then remove and confirm fixed resources. The before/after container inventories preserve the same six unrelated IDs; neither owned ID remains. `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` also exited 0.

## Read-only commands and exits

All commands ran in the ReplayKit checkout. No Gate B, Docker, npm, fetch, or collection mutation command was run.

| Exact command | Exit | Result |
| --- | ---: | --- |
| `git -C 'work/phase2/gate-b-runs/qs33-gateb-local-07/source-buggy' rev-parse HEAD 'HEAD^{tree}'` | 0 | Buggy pinned HEAD/tree above |
| `git -C 'work/phase2/gate-b-runs/qs33-gateb-local-07/source-fixed' rev-parse HEAD 'HEAD^{tree}'` | 0 | Fixed pinned HEAD/tree above |
| `git diff --exit-code -- packages/judge/src/evaluate.ts packages/contracts/src/index.ts` | 0 | Protected R1 files unchanged |
| PowerShell block below, which reads its JavaScript verifier from this review and pipes it to `node -` | 0 | All raw artifact, source, TAP, probe, dependency, isolation, inventory, and cleanup assertions passed |

```powershell
$review = 'docs/phase2/agents/gate-b-local07-execution-review.md'
$source = Get-Content -LiteralPath $review -Raw
$js = [regex]::Match($source, '(?s)```javascript\r?\n(.*?)\r?\n```').Groups[1].Value
$js | node -
```

The exact read-only verifier used by that command follows. A failed assertion exits nonzero.

```javascript
const fs = require("fs"), path = require("path"), crypto = require("crypto"), assert = require("assert");
const r = "work/phase2/gate-b-runs/qs33-gateb-local-07";
const old = "work/phase2/gate-b-runs/qs33-gateb-local-06";
const read = p => fs.readFileSync(path.join(r, p), "utf8");
const json = p => JSON.parse(read(p));
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const hash = p => sha(fs.readFileSync(path.join(r, p)));
const sort = a => [...a].sort((x, y) => x.path.localeCompare(y.path));
function files(dir) {
  const out = [];
  function visit(d) {
    for (const x of fs.readdirSync(d, { withFileTypes: true })) {
      if (x.name === ".git") continue;
      const p = path.join(d, x.name);
      if (x.isDirectory()) visit(p);
      else out.push(path.relative(path.join(r, dir), p).replaceAll("\\", "/"));
    }
  }
  visit(path.join(r, dir));
  return out.sort();
}
function inventory(dir, manifest, skip = []) {
  const raw = json(manifest), list = Array.isArray(raw) ? raw : raw.files;
  const names = list.map(x => x.path);
  assert.equal(new Set(names).size, names.length);
  assert.deepStrictEqual(files(dir), names.slice().sort());
  for (const x of list) if (!skip.includes(x.path)) {
    const b = fs.readFileSync(path.join(r, dir, x.path));
    assert.equal(b.length, x.bytes, dir + "/" + x.path + " bytes");
    assert.equal(sha(b), x.sha256, dir + "/" + x.path + " sha");
  }
  return list;
}
const manifest = json("artifact-sha256.json");
const scoped = ["commands", "provenance", "evidence-buggy", "evidence-fixed", "npm-logs"];
const scopedPaths = scoped.flatMap(d => files(d).map(p => d + "/" + p)).concat("GATE_B_SUMMARY.md");
assert.equal(manifest.length, 370);
assert.deepStrictEqual(manifest.map(x => x.path).sort(), scopedPaths.sort());
for (const x of manifest) {
  const b = fs.readFileSync(path.join(r, x.path));
  assert.equal(b.length, x.bytes, x.path + " bytes");
  assert.equal(sha(b), x.sha256, x.path + " sha");
}
const report = json("report.json");
assert.equal(hash("GATE_B_SUMMARY.md"), report.summarySha256);
const original = json("provenance/buggy-source.json").files.find(x => x.path === "test/parse.js");
assert.equal(hash("provenance/buggy-test-parse.js"), original.sha256);
const savedParse = hash("provenance/saved-official-parse.js");
assert.equal(savedParse, "be7137407c865b889674d1bb7a9a8317e8f605ff4ae189ef2a751feb0b9451a5");
for (const role of ["buggy", "fixed"]) {
  inventory("source-" + role, "provenance/" + role + "-source.json",
    role === "buggy" ? ["test/parse.js"] : []);
  const payload = inventory("payload-" + role, "provenance/" + role + "-payload.json");
  assert.equal(payload.length, 357);
  for (const stage of ["before", "after"])
    assert.deepStrictEqual(sort(json("evidence-" + role + "/inputs-" + stage + ".json")), sort(payload));
  assert.equal(hash("source-" + role + "/test/parse.js"), savedParse);
  assert.equal(hash("payload-" + role + "/test/parse.js"), savedParse);
}
const a = json("provenance/buggy-payload.json"), b = json("provenance/fixed-payload.json");
assert.deepStrictEqual(a.map(x => x.path), b.map(x => x.path));
const fixedByPath = new Map(b.map(x => [x.path, x.sha256]));
assert.deepStrictEqual(a.filter(x => x.sha256 !== fixedByPath.get(x.path)).map(x => x.path),
  ["lib/parse.js", "lib/stringify.js", "lib/utils.js"]);
assert.equal(inventory("lab-bundle", "provenance/lab-bundle-files.json").length, 354);
const lock = json("lab-bundle/package-lock.json"), lab = lock.packages["node_modules/lab"];
const registry = json("provenance/lab-registry.json");
assert.equal(lab.version, "3.0.0");
assert.equal(lab.resolved, registry.dist.tarball);
assert.equal(lab.integrity, registry.dist.integrity);
assert.equal(hash("lab-bundle/package-lock.json"), json("provenance/lab-lock-validation.json").lockSha256);
for (const [p, pin] of Object.entries({
  "provenance/run-gate-b.ps1": "4be0fbf690a2a70b25e2699cf1b7ac06d5f7a4c23c39459f1f14ca53d36f81ee",
  "provenance/gate-b-probe.cjs": "1be6ecf9e72579e8b18079bdad2459263f377baf1a221ed17fe5dae1751ce696",
  "provenance/gate-b-lab-adaptation.cjs": "85731ef6b4a360b326bafd7eccf4447ffbafb0eb0f96303560f1d7bef39e1a73",
  "provenance/verify-gate-b-tap.mjs": "69e5af7c08917eb275ab88c8ae814489e2128d643ca5855e9277a04e2f80d21e",
  "lab-bundle/node_modules/lab/lib/leaks.js": "b4455470cb519a1a5189f8024a8c7b7e620435e5cd87cf494e98260626d8bb32",
  "lab-bundle/node_modules/lab/lib/reporters/tap.js": "dcd8b9d6f8399e0a4c1ca942739ff972fba807b05313a16d29b6fe7ff150a0fa"
})) assert.equal(hash(p), pin, p);
function tap(run, role) {
  const s = fs.readFileSync(path.join(run, "evidence-" + role, "official.stdout"), "utf8");
  const lines = s.split(/\r?\n/);
  const plan = lines.filter(x => /^1\.\.\d+$/.test(x));
  const tests = lines.map(x => /^(ok|not ok) (\d+) (.+)$/.exec(x)).filter(Boolean)
    .map(m => ({ status: m[1], id: +m[2], title: m[3] }));
  const footer = Object.fromEntries([...s.matchAll(/^# (tests|pass|fail|skipped|todo) (\d+)$/gm)]
    .map(m => [m[1], +m[2]]));
  return { s, plan, tests, footer };
}
const t = {};
for (const role of ["buggy", "fixed"]) {
  const e = "evidence-" + role, v = tap(r, role), previous = tap(old, role);
  assert.deepStrictEqual(v.plan, ["1..56"]);
  assert.deepStrictEqual(v.tests.map(x => x.id), Array.from({ length: 56 }, (_, i) => i + 1));
  assert.deepStrictEqual(v.tests, previous.tests);
  assert(v.tests.every(x => !/#\s*(SKIP|TODO)\b/i.test(x.title)));
  assert.deepStrictEqual(v.footer, {
    tests: 56, pass: role === "buggy" ? 55 : 56,
    fail: role === "buggy" ? 1 : 0, skipped: 0, todo: 0
  });
  const reported = json(e + "/official-per-test.json");
  assert.deepStrictEqual(v.tests.map(x => ({
    id: x.id, title: x.title, status: x.status === "ok" ? "pass" : "fail"
  })), reported.tests);
  const stderr = read(e + "/official.stderr");
  const markers = [...stderr.matchAll(/^gate-b-lab-adaptation:(.+)$/gm)].map(x => JSON.parse(x[1]));
  const leaks = [...stderr.matchAll(/^gate-b-lab-leaks:(.+)$/gm)].map(x => JSON.parse(x[1]));
  assert.equal(markers.length, 1); assert.equal(leaks.length, 1);
  assert.deepStrictEqual(markers[0].allowed,
    ["queueMicrotask", "structuredClone", "atob", "btoa", "performance", "fetch", "navigator", "crypto"]);
  assert.deepStrictEqual(leaks[0].remaining, []);
  t[role] = v;
}
assert.deepStrictEqual(t.buggy.tests.map(x => x.title), t.fixed.tests.map(x => x.title));
assert.deepStrictEqual(t.buggy.tests.filter(x => x.status === "not ok").map(x => [x.id, x.title]),
  [[40, "parse parses plain objects correctly"]]);
assert(t.buggy.s.includes("TypeError: source.hasOwnProperty is not a function"));
assert(t.buggy.s.includes("at exports.clone (/case/lib/utils.js:47:20)"));
const frame = "    at exports.clone (/case/lib/utils.js:47:20)";
for (const role of ["buggy", "fixed"]) {
  const e = "evidence-" + role, official = json(e + "/official.json"), probe = json(e + "/probe.json");
  assert.deepStrictEqual(official.argv,
    ["/usr/local/bin/node", "--require", "/case/gate-b-lab-adaptation.cjs", "node_modules/lab/bin/lab", "-r", "tap"]);
  assert.equal(official.exitCode, role === "buggy" ? 1 : 0);
  assert.equal(probe.exitCode, role === "buggy" ? 1 : 0);
  for (const child of [official, probe]) {
    assert.equal(child.timedOut, false); assert.equal(child.signal, null);
    assert.equal(child.launchError, null); assert.equal(child.killRequest, null);
  }
  const events = read(e + "/probe.stdout").trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(events[0].path, "/case/index.js");
  assert.equal(events[1].event, "control"); assert.equal(events[1].passed, true);
  if (role === "buggy") {
    assert.equal(events.length, 3); assert.equal(events[2].event, "issue33-error");
    assert.equal(events[2].name, "TypeError");
    assert.equal(events[2].message, "source.hasOwnProperty is not a function");
    assert.equal(events[2].stack.split("\n")[1], frame);
    assert.equal(read(e + "/probe.stderr").split(/\r?\n/)[1], frame);
  } else {
    assert.equal(events.length, 4);
    assert.equal(events[2].event, "issue33-output");
    assert.equal(JSON.stringify(events[2].output), '{"a":{"b":"c"}}');
    assert.deepStrictEqual(events[3], { event: "issue33-assertion", passed: true });
    assert.equal(read(e + "/probe.stderr"), "");
  }
  const state = json(e + "/docker-state.json"), runtime = json(e + "/runtime.json");
  const deadline = json(e + "/deadline.json");
  assert.equal(state.Status, "exited"); assert.equal(state.ExitCode, 0);
  assert.equal(state.OOMKilled, false); assert.equal(runtime.node, "v22.23.3");
  assert.equal(runtime.uid, 1000); assert.equal(runtime.gid, 1000);
  assert.equal(runtime.nativeWatchdog.pid, 1);
  assert.deepStrictEqual(runtime.nativeWatchdog.argv,
    ["/usr/bin/timeout", "--verbose", "--signal=KILL", "29s", "node", "/case/gate-b-supervisor.cjs"]);
  assert.equal(deadline.confirmedTerminalState, true);
  assert(deadline.observedContainerLifetimeMs < 30000);
  assert.equal(json(e + "/transport-recovery.json").malformedFrames, 0);
}
const names = fs.readdirSync(path.join(r, "commands")).filter(x => x.endsWith(".json")).sort();
const commands = names.map(n => ({ name: n.slice(0, -5), ...json("commands/" + n) }));
assert.equal(commands.length, 101);
assert(commands.every(x => !x.clientTimedOut && !x.launchError));
assert.deepStrictEqual(commands.filter(x => x.exitCode !== 0).map(x => [x.name, x.exitCode]),
  [["033-buggy-detached-head", 1], ["044-fixed-detached-head", 1],
   ["065-buggy-volume-must-be-new", 1], ["079-buggy-confirm-removed", 1],
   ["082-buggy-volume-confirm-removed", 1], ["083-fixed-volume-must-be-new", 1],
   ["097-fixed-confirm-removed", 1], ["100-fixed-volume-confirm-removed", 1]]);
function cmd(n) { return commands.find(x => x.name.startsWith(n + "-")); }
function stdout(n) {
  const f = fs.readdirSync(path.join(r, "commands")).find(x => x.startsWith(n + "-") && x.endsWith(".stdout"));
  return read("commands/" + f);
}
const before = stdout("063").trim().split(/\r?\n/).map(JSON.parse);
const after = stdout("101").trim().split(/\r?\n/).map(JSON.parse);
assert.deepStrictEqual(before.map(x => x.ID).sort(), after.map(x => x.ID).sort());
for (const role of ["buggy", "fixed"]) {
  const create = role === "buggy" ? "068" : "086", inspect = role === "buggy" ? "069" : "087";
  const o = JSON.parse(stdout(inspect))[0];
  const c = report.ownedContainers.find(x => x.role === role);
  const v = report.ownedVolumes.find(x => x.role === role);
  assert.equal(read(role + "-container.cid").trim(), c.id);
  assert.equal(o.Image, "sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392");
  assert.equal(o.Config.User, "1000:1000"); assert.equal(o.Config.WorkingDir, "/case");
  assert.deepStrictEqual(o.Config.Entrypoint, ["/usr/bin/timeout"]);
  assert.equal(o.HostConfig.NetworkMode, "none"); assert.equal(o.HostConfig.ReadonlyRootfs, true);
  assert.deepStrictEqual(o.HostConfig.CapDrop, ["ALL"]);
  assert.deepStrictEqual(o.HostConfig.SecurityOpt, ["no-new-privileges"]);
  assert.equal(o.HostConfig.NanoCpus, 1000000000);
  assert.equal(o.HostConfig.Memory, 268435456); assert.equal(o.HostConfig.PidsLimit, 64);
  assert.equal(o.HostConfig.Binds, null); assert.equal(o.Mounts.length, 1);
  assert.equal(o.Mounts[0].Name, v.name); assert.equal(o.Mounts[0].Destination, "/case");
  assert(cmd(create).argv.includes("type=volume,source=" + v.name + ",target=/case,volume-nocopy"));
  assert.equal(c.cleaned, true); assert.equal(v.cleaned, true);
  assert(!before.some(x => x.ID === c.id)); assert(!after.some(x => x.ID === c.id));
}
assert(Date.parse(cmd("082").finishedAt) < Date.parse(cmd("083").startedAt));
assert.equal(report.status, "PARTIAL"); assert.equal(report.evidenceCollectionCompleted, true);
assert.equal(report.gateBAccepted, false);
console.log("PASS: 370/370 scoped artifacts; 17+17 source, 357+357 payload, 354 Lab files; raw 55/1 and 56/0 TAP; probes 1/0; 101 commands; isolation and cleanup.");
```

The first exploratory source check exited 1 because it incorrectly expected the buggy checkout's `test/parse.js` to remain at its prepatch hash. A second exploratory check exited 1 because it compared the same inventory entries in different serialization orders. The final verifier above accounts for the intended test-only patch and compares inventories by path; it exited 0. Neither exploratory failure identified a collection defect.

## Limits of this decision

The contract is titled for local-06; local-07 reuses its pinned commits, image, collector hashes, Lab adaptation, and expected pair outcome. This review is of saved artifacts only. It cannot prove a future rerun, a real-time scheduling bound, or trusted provenance outside this collection. The external runner remains blocked pending its separate evaluator, alternate/decoy, and ten-run evidence.



