import { startTelemetry } from './instrumentation.js';

// Initialize the SDK before any application module is loaded.
startTelemetry();
await import('./server.js');
