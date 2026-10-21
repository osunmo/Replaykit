import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const validator = fileURLToPath(new URL('./validate-gate-b-lock.mjs', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'replaykit-gate-b-lock-test-'));
const integrity = `sha512-${createHash('sha512').update('test').digest('base64')}`;
const valid = {
  name: 'replaykit-gate-b-lab-bundle',
  version: '1.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: 'replaykit-gate-b-lab-bundle', version: '1.0.0', dependencies: { lab: '3.0.0' } },
    'node_modules/lab': {
      version: '3.0.0',
      resolved: 'https://registry.npmjs.org/lab/-/lab-3.0.0.tgz',
      integrity,
    },
    'node_modules/Lab': {
      version: '9.0.0',
      resolved: 'https://registry.npmjs.org/Lab/-/Lab-9.0.0.tgz',
      integrity,
    },
  },
};

function run(name, content, expectedCode) {
  const file = join(directory, `${name}.json`);
  writeFileSync(file, content);
  const result = spawnSync(process.execPath, [validator, file, '3.0.0', integrity], {
    encoding: 'utf8',
  });
  assert.equal(result.status, expectedCode, `${name}: ${result.stderr}`);
  return result;
}

try {
  const accepted = run('empty-root-and-case-sensitive-keys', JSON.stringify(valid), 0);
  const parsed = JSON.parse(accepted.stdout);
  assert.deepEqual(Object.keys(parsed), [
    'schemaVersion',
    'status',
    'lockfileVersion',
    'rootPackageKeyPresent',
    'packageCount',
    'labVersion',
    'lockSha256',
  ]);
  assert.equal(parsed.status, 'PASS');
  assert.equal(parsed.rootPackageKeyPresent, true);
  assert.equal(parsed.packageCount, 3);
  assert.match(parsed.lockSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    run('repeat', JSON.stringify(valid), 0).stdout,
    accepted.stdout,
    'validation output must be deterministic for identical bytes',
  );

  const wrongCase = structuredClone(valid);
  wrongCase.packages['node_modules/Lab'] = wrongCase.packages['node_modules/lab'];
  delete wrongCase.packages['node_modules/lab'];
  run('wrong-case-lab', JSON.stringify(wrongCase), 1);

  const noIntegrity = structuredClone(valid);
  delete noIntegrity.packages['node_modules/Lab'].integrity;
  run('missing-dependency-integrity', JSON.stringify(noIntegrity), 1);

  const credential = structuredClone(valid);
  credential.packages['node_modules/lab'].resolved =
    'https://secret-user:secret-token@registry.npmjs.org/lab/-/lab-3.0.0.tgz';
  const rejectedCredential = run('credential-url', JSON.stringify(credential), 1);
  assert.doesNotMatch(rejectedCredential.stderr, /secret-user|secret-token/);

  const unsupported = structuredClone(valid);
  unsupported.lockfileVersion = 2;
  run('unsupported-lock-version', JSON.stringify(unsupported), 1);
  run('malformed', '{"packages":{"":', 1);
  run('malformed-utf8', Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]), 1);

  console.log(
    'Gate B lockfile JSON regression: PASS (empty key, case, integrity, provenance, malformed/unsupported, secrecy, determinism)',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
