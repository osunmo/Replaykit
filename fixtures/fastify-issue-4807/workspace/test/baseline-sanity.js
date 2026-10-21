'use strict';
const assert = require('node:assert');
const Fastify = require('../fastify.js');

const fastify = Fastify();

fastify.get('/test', (req, reply) => {
  reply.send({ status: 'ok', query: req.query });
});

fastify.inject(
  {
    method: 'GET',
    url: '/test?foo=bar',
  },
  (err, res) => {
    assert.ifError(err);
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.query.foo, 'bar');
    console.log('baseline routing passed');
  }
);
