import { scanRepository } from '../packages/telemetry/src/token-scan.js';

try {
  const result = await scanRepository(process.cwd());
  if (result.violations.length) {
    console.error(`Token scan rejected ${result.violations.length} unauthorized token shapes:`);
    for (const finding of result.violations) console.error(`  ${finding.file}:${finding.line}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Token scan clean: ${result.filesScanned} files; only allowed fake canaries found.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'TOKEN_SCAN_FAILED');
  process.exitCode = 1;
}
