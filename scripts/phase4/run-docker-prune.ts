import { pruneReplayKitResources } from '../../packages/runtime/src/docker-cleanup.js';

async function main() {
  console.log('Running ReplayKit Docker prune...');
  const res = await pruneReplayKitResources();
  console.log('Prune Result:');
  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  console.error('Prune failed:', err);
  process.exit(1);
});
