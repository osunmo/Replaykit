# Qs API Specification & Documentation (v2.2.1)

## Overview
Qs is a querystring parser and serializer for Node.js with support for nested objects and arrays.

## Key Methods

### `Qs.parse(input, [options])`
Parses a querystring or object into a structured object representation.

#### Recursive Object Parsing & Merging Contract:
- When `Qs.parse` is invoked with an object payload, it recursively clones and merges nested objects.
- All key-value properties defined on objects must be preserved in the output.
- Objects created via `Object.create(null)` represent dictionary maps without prototype inheritance (no Object.prototype methods).
- Nested dictionary values created via `Object.create(null)` must be cloned without throwing runtime prototype errors and their properties must not be dropped.

### `Qs.stringify(obj, [options])`
Serializes a structured object into a URL querystring.

## Test Framework
Tests run under Node 22 using the Lab test framework:
```javascript
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
```
