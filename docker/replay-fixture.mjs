import process from 'node:process';
import { Buffer } from 'node:buffer';
import timers from 'node:timers';

const REQUEST_LIMIT = 20;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 65_536;
const pending = new Map();
let nextId = 1;
let responseBuffer = '';
let terminalError;

function idleInput() {
  process.stdin.pause();
  // A paused Windows pipe can still keep the process alive after the test finishes.
  if (typeof process.stdin.unref === 'function') process.stdin.unref();
}

function stop(error) {
  terminalError ??= error;
  for (const request of pending.values()) {
    timers.clearTimeout(request.timer);
    request.reject(terminalError);
  }
  pending.clear();
  idleInput();
}

function receive(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    stop(new Error('Malformed broker response JSON'));
    return;
  }
  if (
    !message ||
    !Number.isSafeInteger(message.id) ||
    message.id < 1 ||
    typeof message.ok !== 'boolean' ||
    !pending.has(message.id)
  ) {
    stop(new Error('Invalid broker response identity'));
    return;
  }
  const request = pending.get(message.id);
  if (
    message.ok &&
    (!message.value ||
      !Number.isInteger(message.value.status) ||
      !Object.hasOwn(message.value, 'body'))
  ) {
    stop(new Error('Invalid broker response value'));
    return;
  }
  if (!message.ok && typeof message.error !== 'string') {
    stop(new Error('Invalid broker error response'));
    return;
  }
  timers.clearTimeout(request.timer);
  pending.delete(message.id);
  if (message.ok) request.resolve(message.value);
  else request.reject(new Error(message.error));
  if (pending.size === 0) idleInput();
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (terminalError) return;
  responseBuffer += chunk;
  if (Buffer.byteLength(responseBuffer, 'utf8') > MAX_RESPONSE_BYTES) {
    stop(new Error('Broker response exceeded size limit'));
    return;
  }
  let newline;
  while ((newline = responseBuffer.indexOf('\n')) !== -1 && !terminalError) {
    const line = responseBuffer.slice(0, newline);
    responseBuffer = responseBuffer.slice(newline + 1);
    receive(line);
  }
});
process.stdin.on('end', () => stop(new Error('Broker input closed')));
process.stdin.on('error', () => stop(new Error('Broker input failed')));
idleInput();

function request(payload) {
  if (terminalError) return Promise.reject(terminalError);
  if (nextId > REQUEST_LIMIT) return Promise.reject(new Error('Broker request limit is 20'));
  const id = nextId++;
  const line = `@replaykit/request:${JSON.stringify({ id, ...payload })}\n`;
  return new Promise((resolve, reject) => {
    const timer = timers.setTimeout(() => {
      stop(new Error(`Broker request ${id} timeout after ${REQUEST_TIMEOUT_MS} ms`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    if (typeof process.stdin.ref === 'function') process.stdin.ref();
    process.stdin.resume();
    process.stdout.write(line, (error) => {
      if (error) stop(new Error('Broker output failed'));
    });
  });
}

export async function payment(input) {
  const result = await request({ action: 'pay', input });
  return result.body;
}

export async function chargeCount(orderId) {
  const result = await request({ action: 'charges', orderId });
  if (
    !result.body ||
    !Number.isSafeInteger(result.body.chargeCount) ||
    result.body.chargeCount < 0
  ) {
    throw new Error('Invalid broker charge count');
  }
  return result.body.chargeCount;
}
