export function applicationFrames(error: Error): { function: string; in_app: boolean }[] {
  for (const line of error.stack?.split('\n').slice(1) ?? []) {
    const frame = /^\s+at\s+(?:async\s+)?([\w$.]+)\s+\((.*):\d+:\d+\)$/.exec(line);
    if (!frame) continue;
    const source = /\/apps\/checkout-api\/src\/([^/]+)\.(?:js|ts)$/.exec(
      frame[2]!.replaceAll('\\', '/'),
    );
    if (!source) continue;
    return [{ function: `${source[1]}/${frame[1]!.split('.').at(-1)}`, in_app: true }];
  }
  return [{ function: 'unknown', in_app: false }];
}
