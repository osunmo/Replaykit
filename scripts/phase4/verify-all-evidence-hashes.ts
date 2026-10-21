import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

async function verifyRegistry(registryPath: string, baseDir: string, label: string) {
  console.log(`Checking ${label}: ${registryPath}...`);
  const content = await readFile(registryPath, 'utf8');
  const registry = JSON.parse(content) as Record<string, string>;
  const entries = Object.entries(registry);

  let verified = 0;
  let errors = 0;

  for (const [relPath, expectedHash] of entries) {
    const fullPath = path.join(baseDir, relPath);
    try {
      const fileBuffer = await readFile(fullPath);
      const actualHash = createHash('sha256').update(fileBuffer).digest('hex');
      if (actualHash !== expectedHash) {
        console.error(`HASH_MISMATCH: ${relPath}\n  expected: ${expectedHash}\n  actual:   ${actualHash}`);
        errors++;
      } else {
        verified++;
      }
    } catch (err) {
      console.error(`FILE_MISSING: ${relPath} (${err instanceof Error ? err.message : String(err)})`);
      errors++;
    }
  }

  console.log(`  -> ${verified}/${entries.length} verified (errors: ${errors})`);
  return errors === 0;
}

async function main() {
  let allPass = true;

  // Phase 3
  const p3Registry = path.join(REPO_ROOT, 'work', 'phase3', 'artifact-sha256.json');
  const p3Base = path.join(REPO_ROOT, 'work', 'phase3');
  const p3Ok = await verifyRegistry(p3Registry, p3Base, 'Phase 3 Artifacts');
  if (!p3Ok) allPass = false;

  // Phase 4 Original
  const p4Registry = path.join(REPO_ROOT, 'work', 'phase4', 'artifact-sha256.json');
  const p4Base = path.join(REPO_ROOT, 'work', 'phase4');
  const p4Ok = await verifyRegistry(p4Registry, p4Base, 'Phase 4 Original Artifacts');
  if (!p4Ok) allPass = false;

  // Phase 4 Hardened
  const p4HardenedRegistry = path.join(REPO_ROOT, 'work', 'phase4', 'hardened-runs', 'artifact-sha256.json');
  const p4HardenedBase = path.join(REPO_ROOT, 'work', 'phase4', 'hardened-runs');
  const p4HOk = await verifyRegistry(p4HardenedRegistry, p4HardenedBase, 'Phase 4 Hardened Artifacts');
  if (!p4HOk) allPass = false;

  if (!allPass) {
    console.error('\nEVIDENCE INTEGRITY CHECK FAILED!');
    process.exit(1);
  }
  console.log('\nALL EVIDENCE INTEGRITY HASHES 100% VERIFIED!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
