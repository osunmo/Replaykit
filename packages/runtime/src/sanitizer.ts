import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProductionIncidentContext } from '../../contracts/src/incident-context.js';

export const FORBIDDEN_LEAK_PATTERNS = [
  '6a97ad1d71d8a9069f5d6002cab3130752519ccb',
  '6a97ad1d',
  'parses plain objects correctly',
  'fc1d3f9205a621617ca4f86432411dfddf6422432dfcb6d80f936af920cafe8e',
  '760d2dbd744d610b81426da10c412fc8db40b930e15ce895296157eaeb24ff28',
  '318a5449a218b2d5d882fc6993086de1f53300559f1dfd2ed0d30696c87f6e81',
  'gate-b-probe',
  'issue33-output',
  'issue33-assertion',
  'issue33-error',
  'reference.patch',
  'alternate.patch',
  'decoy.patch',
] as const;

export interface BlindingAuditRecord {
  passed: boolean;
  auditedFilesCount: number;
  filesScanned: string[];
  forbiddenPatternsChecked: string[];
  detectedLeaks: Array<{ file: string; pattern: string }>;
  testParseTestsCount: number;
  test40Present: boolean;
  timestamp: string;
}

export interface WorkspaceManifest {
  schemaVersion: 'sanitized-workspace-v1';
  baseCommit: string;
  createdAt: string;
  files: Record<string, { size: number; sha256: string }>;
}

const sha256 = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

/**
 * Remove test #40 from test/parse.js cleanly
 */
export function scrubTest40FromParseJs(content: string): string {
  // Test 40 is at the end of the file:
  //     it('parses plain objects correctly', function (done) {
  //
  //         var a = Object.create(null);
  //         a.b = 'c';
  //         
  //         expect(Qs.parse({ a: a })).to.deep.equal({ a: { b: 'c' } });
  //         done();
  //     });
  // });
  const test40Regex = /\r?\n\s+it\('parses plain objects correctly',\s*function\s*\([^\)]*\)\s*\{[\s\S]*?\}\);\s*\r?\n\s*\}\);\s*$/;
  if (!test40Regex.test(content)) {
    // If not matching end of file regex, try general block replacement
    const blockRegex = /\s*it\('parses plain objects correctly'[\s\S]*?\}\);\s*/;
    if (blockRegex.test(content)) {
      return content.replace(blockRegex, '\n');
    }
    throw new Error('FAILED_TO_LOCATE_TEST_40_IN_PARSE_JS');
  }
  return content.replace(test40Regex, '\n});\n');
}

/**
 * Constructs a clean, strictly blinded workspace for AI test generation
 */
export async function createSanitizedWorkspace(options: {
  repoRoot: string;
  outputDir: string;
  incident: ProductionIncidentContext;
  apiDocs?: string;
}): Promise<{
  workspaceDir: string;
  manifest: WorkspaceManifest;
  blindingAudit: BlindingAuditRecord;
}> {
  const { repoRoot, outputDir, incident } = options;
  const sourceBuggyDir = path.join(
    repoRoot,
    'work',
    'phase2',
    'gate-b-runs',
    'qs33-gateb-local-06',
    'source-buggy',
  );

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await mkdir(path.join(outputDir, 'lib'), { recursive: true });
  await mkdir(path.join(outputDir, 'test'), { recursive: true });

  // 1. Copy source files (excluding .git, probe scripts, etc.)
  const filesToCopy = [
    'index.js',
    'lib/index.js',
    'lib/parse.js',
    'lib/stringify.js',
    'lib/utils.js',
    'package.json',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'Makefile',
    'CONTRIBUTING.md',
    '.gitignore',
    '.jshintignore',
    '.jshintrc',
    '.travis.yml',
    'test/stringify.js',
  ];

  for (const relPath of filesToCopy) {
    const srcPath = path.join(sourceBuggyDir, relPath);
    const destPath = path.join(outputDir, relPath);
    await mkdir(path.dirname(destPath), { recursive: true });
    await cp(srcPath, destPath);
  }

  // 2. Read, scrub test 40, and write test/parse.js
  const rawParseJs = await readFile(path.join(sourceBuggyDir, 'test', 'parse.js'), 'utf8');
  const scrubbedParseJs = scrubTest40FromParseJs(rawParseJs);
  await writeFile(path.join(outputDir, 'test', 'parse.js'), scrubbedParseJs, 'utf8');

  // 3. Write incident.json
  const incidentJsonPath = path.join(outputDir, 'incident.json');
  await writeFile(incidentJsonPath, JSON.stringify(incident, null, 2) + '\n', 'utf8');

  // 4. Write permitted API documentation
  const defaultApiDocs = `# Qs API Specification & Documentation (v2.2.1)

## Overview
Qs is a querystring parser and serializer for Node.js with support for nested objects and arrays.

## Key Methods

### \`Qs.parse(input, [options])\`
Parses a querystring or object into a structured object representation.

#### Recursive Object Parsing & Merging Contract:
- When \`Qs.parse\` is invoked with an object payload, it recursively clones and merges nested objects.
- All key-value properties defined on objects must be preserved in the output.
- Objects created via \`Object.create(null)\` represent dictionary maps without prototype inheritance (no Object.prototype methods).
- Nested dictionary values created via \`Object.create(null)\` must be cloned without throwing runtime prototype errors and their properties must not be dropped.

### \`Qs.stringify(obj, [options])\`
Serializes a structured object into a URL querystring.

## Test Framework
Tests run under Node 22 using the Lab test framework:
\`\`\`javascript
var Lab = require('lab');
var Qs = require('../');

var expect = Lab.expect;
var describe = Lab.experiment;
var it = Lab.test;

describe('#parse', function () {
    it('description of test', function (done) {
        // assertions
        done();
    });
});
\`\`\`
`;
  const apiDocsPath = path.join(outputDir, 'API_DOCUMENTATION.md');
  await writeFile(apiDocsPath, options.apiDocs ?? defaultApiDocs, 'utf8');

  // 5. Generate workspace manifest
  const manifestFiles: Record<string, { size: number; sha256: string }> = {};
  async function collectFiles(dir: string, prefix = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await collectFiles(full, rel);
      } else if (ent.isFile()) {
        const buf = await readFile(full);
        manifestFiles[rel] = {
          size: buf.length,
          sha256: sha256(buf),
        };
      }
    }
  }
  await collectFiles(outputDir);

  const manifest: WorkspaceManifest = {
    schemaVersion: 'sanitized-workspace-v1',
    baseCommit: incident.sourceRevision.gitSha,
    createdAt: new Date().toISOString(),
    files: manifestFiles,
  };

  const manifestPath = path.join(outputDir, 'workspace-manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  manifestFiles['workspace-manifest.json'] = {
    size: Buffer.byteLength(JSON.stringify(manifest, null, 2) + '\n'),
    sha256: sha256(JSON.stringify(manifest, null, 2) + '\n'),
  };

  // 6. Run Blinding Audit
  const blindingAudit = await auditWorkspaceBlinding(outputDir);
  if (!blindingAudit.passed) {
    throw new Error(
      `WORKSPACE_BLINDING_AUDIT_FAILED: Leaks detected: ${JSON.stringify(blindingAudit.detectedLeaks)}`,
    );
  }

  return { workspaceDir: outputDir, manifest, blindingAudit };
}

/**
 * Audits a workspace directory for any solution, patch, or upstream test leaks
 */
export async function auditWorkspaceBlinding(workspaceDir: string): Promise<BlindingAuditRecord> {
  const detectedLeaks: Array<{ file: string; pattern: string }> = [];
  const filesScanned: string[] = [];

  async function scanDir(dir: string, prefix = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === '.git') {
          detectedLeaks.push({ file: rel, pattern: '.git directory forbidden in generator workspace' });
        }
        await scanDir(full, rel);
      } else if (ent.isFile()) {
        filesScanned.push(rel);
        const content = await readFile(full, 'utf8');
        for (const pattern of FORBIDDEN_LEAK_PATTERNS) {
          if (content.includes(pattern)) {
            detectedLeaks.push({ file: rel, pattern });
          }
        }
      }
    }
  }

  await scanDir(workspaceDir);

  // Verify test/parse.js test count
  const parseJsPath = path.join(workspaceDir, 'test', 'parse.js');
  let testParseTestsCount = 0;
  let test40Present = false;
  try {
    const parseContent = await readFile(parseJsPath, 'utf8');
    const matches = parseContent.match(/it\(/g);
    testParseTestsCount = matches ? matches.length : 0;
    test40Present = parseContent.includes('parses plain objects correctly');
  } catch {
    // ignore
  }

  const passed =
    detectedLeaks.length === 0 &&
    !test40Present &&
    testParseTestsCount === 39; // Exactly 39 parse tests (test 40 removed)

  return {
    passed,
    auditedFilesCount: filesScanned.length,
    filesScanned,
    forbiddenPatternsChecked: [...FORBIDDEN_LEAK_PATTERNS],
    detectedLeaks,
    testParseTestsCount,
    test40Present,
    timestamp: new Date().toISOString(),
  };
}
