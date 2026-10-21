'use strict';

/**
 * HARDENED REGRESSION TEST for Fastify Issue #4807 / PR #4826
 *
 * Verifies that when a malformed URI triggers the frameworkErrors handler
 * before route context is bound, accessing req.routeConfig is safe and
 * returns strictly undefined.
 *
 * Distinguishes:
 * - Buggy base: throws TypeError: Cannot read properties of undefined (reading 'config')
 * - Reference fix: returns undefined
 * - Alternate fix: returns undefined
 * - Semantic decoy: returns {} (rejected by assertion)
 */

const Fastify = require('fastify');
const assert = require('node:assert');

async function main() {
  let frameworkErrorsInvocations = 0;
  let routeHandlerInvocations = 0;
  let routeConfigThrew = false;
  let routeConfigError = null;
  let observedRouteConfig = null;
  let observedErrorCode = null;

  const fastify = Fastify({
    frameworkErrors: function (err, req, res) {
      frameworkErrorsInvocations++;
      observedErrorCode = err && err.code ? err.code : null;

      // Safely observe req.routeConfig without throwing inside frameworkErrors
      try {
        observedRouteConfig = req.routeConfig;
      } catch (e) {
        routeConfigThrew = true;
        routeConfigError = e;
      }

      res.send('error handled');
    }
  });

  let timeoutTimer;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutTimer = setTimeout(() => {
      reject(new Error('Test timed out after 5000ms: Fastify injection did not settle'));
    }, 5000);
    if (typeof timeoutTimer.unref === 'function') {
      timeoutTimer.unref();
    }
  });

  try {
    fastify.get('/test/:id', (req, res) => {
      routeHandlerInvocations++;
      res.send('ok');
    });

    const response = await Promise.race([
      fastify.inject({
        method: 'GET',
        url: '/test/%world'
      }),
      timeoutPromise
    ]);

    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }

    // Invariant 1: Framework error handler was invoked exactly once
    assert.strictEqual(
      frameworkErrorsInvocations,
      1,
      `Expected frameworkErrors to be called exactly once, but got ${frameworkErrorsInvocations}`
    );

    // Invariant 2: Normal route handler was completely bypassed
    assert.strictEqual(
      routeHandlerInvocations,
      0,
      `Expected normal route handler to be bypassed, but it executed ${routeHandlerInvocations} times`
    );

    // Invariant 3: Framework error code matches historical Fastify behavior
    assert.strictEqual(
      observedErrorCode,
      'FST_ERR_BAD_URL',
      `Expected framework error code to be 'FST_ERR_BAD_URL', but got '${observedErrorCode}'`
    );

    // Invariant 4: Accessing req.routeConfig must not throw
    // On authentic buggy code, this re-throws the native TypeError outside the handler
    if (routeConfigThrew) {
      throw routeConfigError;
    }

    // Invariant 5: Returned value must be strictly undefined (rejects decoy returning {})
    assert.strictEqual(
      observedRouteConfig,
      undefined,
      `Expected req.routeConfig to be strictly undefined, but got: ${JSON.stringify(observedRouteConfig)}`
    );

    // Invariant 6: Response status and body match the handled framework error response
    assert.strictEqual(response.statusCode, 200, `Expected status 200, got ${response.statusCode}`);
    assert.strictEqual(response.body, 'error handled', `Expected body 'error handled', got '${response.body}'`);

    console.log('HARDENED_TEST_PASSED: All Fastify #4807 regression invariants verified successfully.');
  } finally {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }
    await fastify.close();
  }
}

main().catch((err) => {
  console.error('HARDENED_TEST_FAILED:');
  console.error(err);
  process.exit(1);
});
