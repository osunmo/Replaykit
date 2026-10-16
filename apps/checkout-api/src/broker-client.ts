import { parseBrokerRequest } from './broker-contract.js';

try {
  const argument = process.argv[2];
  if (!argument || argument.length > 4096) throw new Error('Invalid broker command');
  const request = parseBrokerRequest(JSON.parse(argument) as unknown);
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.body ? { 'content-type': 'application/json' } : undefined,
    body: request.body ? JSON.stringify(request.body) : undefined,
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
  const body: unknown = await response.json();
  process.stdout.write(`${JSON.stringify({ status: response.status, body })}\n`);
} catch {
  process.stdout.write(
    `${JSON.stringify({ status: 0, body: { error: 'BrokerRequestFailed' } })}\n`,
  );
  process.exitCode = 1;
}
