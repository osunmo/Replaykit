import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { Attributes } from '@opentelemetry/api';

export interface ObservedSpan {
  traceId: string;
  spanId: string;
  name: string;
  attributes: Attributes;
}
const exporter = new InMemorySpanExporter();
const processor = new SimpleSpanProcessor(exporter);
const recentSpans: ObservedSpan[] = [];
let sdk: NodeSDK | undefined;

export function startTelemetry(): void {
  if (sdk) return;
  sdk = new NodeSDK({
    serviceName: 'checkout-api',
    autoDetectResources: false,
    spanProcessors: [processor],
    logRecordProcessors: [],
    metricReaders: [],
    instrumentations: [],
  });
  sdk.start();
}

export async function flushSpans(): Promise<void> {
  await processor.forceFlush();
  for (const span of exporter.getFinishedSpans()) {
    recentSpans.push({
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      name: span.name,
      attributes: { ...span.attributes },
    });
  }
  exporter.reset();
  if (recentSpans.length > 512) recentSpans.splice(0, recentSpans.length - 512);
}

export function spansForKey(clientKey: string): ObservedSpan[] {
  return recentSpans.filter((span) => span.attributes['payment.client_key'] === clientKey);
}

export async function stopTelemetry(): Promise<void> {
  if (sdk) await sdk.shutdown();
}
