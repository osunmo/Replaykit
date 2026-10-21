#!/usr/bin/env node
// Fixed validator code. The npm lockfile is read only as JSON data; its contents
// are never evaluated, imported, or interpolated into a command.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function requireCondition(condition, code) {
  if (!condition) throw new Error(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validIntegrity(value) {
  if (typeof value !== 'string') return false;
  const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  const expectedBytes = { sha256: 32, sha384: 48, sha512: 64 }[match[1]];
  return bytes.length === expectedBytes && bytes.toString('base64') === match[2];
}

function validate(lockPath, labVersion, metadataIntegrity) {
  requireCondition(
    labVersion === '3.0.0' && validIntegrity(metadataIntegrity),
    'UNSUPPORTED_EXPECTATION',
  );
  let raw;
  try {
    raw = readFileSync(lockPath);
  } catch {
    throw new Error('INPUT_READ_ERROR');
  }
  let lock;
  try {
    lock = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    throw new Error('MALFORMED_JSON');
  }

  requireCondition(
    isRecord(lock) && lock.lockfileVersion === 3 && lock.requires === true,
    'UNSUPPORTED_LOCKFILE',
  );
  requireCondition(
    lock.name === 'replaykit-gate-b-lab-bundle' && lock.version === '1.0.0',
    'BUNDLE_IDENTITY_MISMATCH',
  );
  requireCondition(
    isRecord(lock.packages) && Object.hasOwn(lock.packages, ''),
    'ROOT_PACKAGE_MISSING',
  );
  const root = lock.packages[''];
  requireCondition(
    isRecord(root) && root.name === lock.name && root.version === lock.version,
    'ROOT_PACKAGE_MISMATCH',
  );
  requireCondition(
    isRecord(root.dependencies) && root.dependencies.lab === labVersion,
    'ROOT_LAB_PIN_MISMATCH',
  );
  const lab = lock.packages['node_modules/lab'];
  requireCondition(isRecord(lab) && lab.version === labVersion, 'LAB_PIN_MISMATCH');
  requireCondition(lab.integrity === metadataIntegrity, 'LAB_METADATA_INTEGRITY_MISMATCH');

  for (const [name, entry] of Object.entries(lock.packages)) {
    if (name === '') continue;
    requireCondition(
      name.startsWith('node_modules/') && isRecord(entry),
      'UNSUPPORTED_PACKAGE_ENTRY',
    );
    requireCondition(validIntegrity(entry.integrity), 'DEPENDENCY_INTEGRITY_MISSING_OR_INVALID');
    requireCondition(typeof entry.resolved === 'string', 'DEPENDENCY_ORIGIN_INVALID');
    let url;
    try {
      url = new URL(entry.resolved);
    } catch {
      throw new Error('DEPENDENCY_ORIGIN_INVALID');
    }
    requireCondition(
      url.origin === 'https://registry.npmjs.org' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        entry.resolved.startsWith('https://registry.npmjs.org/'),
      'DEPENDENCY_ORIGIN_INVALID',
    );
  }

  return {
    schemaVersion: 1,
    status: 'PASS',
    lockfileVersion: 3,
    rootPackageKeyPresent: true,
    packageCount: Object.keys(lock.packages).length,
    labVersion,
    lockSha256: createHash('sha256').update(raw).digest('hex'),
  };
}

try {
  requireCondition(process.argv.length === 5, 'ARGUMENT_COUNT_INVALID');
  const result = validate(process.argv[2], process.argv[3], process.argv[4]);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  // Only fixed diagnostic codes reach stderr. No lockfile values, paths, npm
  // credentials, metadata, or token-bearing URLs are included in raw logs.
  const allowed = new Set([
    'ARGUMENT_COUNT_INVALID',
    'UNSUPPORTED_EXPECTATION',
    'INPUT_READ_ERROR',
    'MALFORMED_JSON',
    'UNSUPPORTED_LOCKFILE',
    'BUNDLE_IDENTITY_MISMATCH',
    'ROOT_PACKAGE_MISSING',
    'ROOT_PACKAGE_MISMATCH',
    'ROOT_LAB_PIN_MISMATCH',
    'LAB_PIN_MISMATCH',
    'LAB_METADATA_INTEGRITY_MISMATCH',
    'UNSUPPORTED_PACKAGE_ENTRY',
    'DEPENDENCY_INTEGRITY_MISSING_OR_INVALID',
    'DEPENDENCY_ORIGIN_INVALID',
  ]);
  const code = allowed.has(error?.message) ? error.message : 'INTERNAL_ERROR';
  process.stderr.write(`Gate B lock validation failed: ${code}\n`);
  process.exitCode = 1;
}
