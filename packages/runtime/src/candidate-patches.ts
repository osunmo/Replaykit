// Immutable candidate patches for qs issue #33 Stage C3

export const REFERENCE_PATCH = `diff --git a/lib/parse.js b/lib/parse.js
index 89feef3..ab6d659 100755
--- a/lib/parse.js
+++ b/lib/parse.js
@@ -144,7 +144,7 @@ module.exports = function (str, options) {
     // Iterate over the keys and setup the new object
     //
     for (var key in tempObj) {
-        if (tempObj.hasOwnProperty(key)) {
+        if (Object.prototype.hasOwnProperty.call(tempObj, key)) {
             var newObj = internals.parseKeys(key, tempObj[key], options);
             obj = Utils.merge(obj, newObj);
         }
diff --git a/lib/stringify.js b/lib/stringify.js
index 582577a..8198ddd 100755
--- a/lib/stringify.js
+++ b/lib/stringify.js
@@ -32,7 +32,7 @@ internals.stringify = function (obj, prefix) {
     var values = [];
 
     for (var key in obj) {
-        if (obj.hasOwnProperty(key)) {
+        if (Object.prototype.hasOwnProperty.call(obj, key)) {
             values = values.concat(internals.stringify(obj[key], prefix + '[' + key + ']'));
         }
     }
@@ -49,7 +49,7 @@ module.exports = function (obj, options) {
     var keys = [];
 
     for (var key in obj) {
-        if (obj.hasOwnProperty(key)) {
+        if (Object.prototype.hasOwnProperty.call(obj, key)) {
             keys = keys.concat(internals.stringify(obj[key], key));
         }
     }
diff --git a/lib/utils.js b/lib/utils.js
index 31760fb..95f0048 100755
--- a/lib/utils.js
+++ b/lib/utils.js
@@ -44,7 +44,7 @@ exports.clone = function (source, refs) {
     refs.push(source);
 
     for (var i in source) {
-        if (source.hasOwnProperty(i)) {
+        if (Object.prototype.hasOwnProperty.call(source, i)) {
             copy[i] = exports.clone(source[i], refs);
         }
     }
@@ -147,7 +147,7 @@ exports.compact = function (obj, refs) {
     }
 
     for (var key in obj) {
-        if (obj.hasOwnProperty(key)) {
+        if (Object.prototype.hasOwnProperty.call(obj, key)) {
             obj[key] = exports.compact(obj[key], refs);
         }
     }
`;

export const ALTERNATE_PATCH = `diff --git a/lib/parse.js b/lib/parse.js
index 89feef3..b2785f4 100755
--- a/lib/parse.js
+++ b/lib/parse.js
@@ -144,7 +144,7 @@ module.exports = function (str, options) {
     // Iterate over the keys and setup the new object
     //
     for (var key in tempObj) {
-        if (tempObj.hasOwnProperty(key)) {
+        if (Boolean(Object.getOwnPropertyDescriptor(tempObj, key))) {
             var newObj = internals.parseKeys(key, tempObj[key], options);
             obj = Utils.merge(obj, newObj);
         }
diff --git a/lib/stringify.js b/lib/stringify.js
index 582577a..6482945 100755
--- a/lib/stringify.js
+++ b/lib/stringify.js
@@ -32,7 +32,7 @@ internals.stringify = function (obj, prefix) {
     var values = [];
 
     for (var key in obj) {
-        if (obj.hasOwnProperty(key)) {
+        if (Boolean(Object.getOwnPropertyDescriptor(obj, key))) {
             values = values.concat(internals.stringify(obj[key], prefix + '[' + key + ']'));
         }
     }
@@ -49,7 +49,7 @@ module.exports = function (obj, options) {
     var keys = [];
 
     for (var key in obj) {
-        if (obj.hasOwnProperty(key)) {
+        if (Boolean(Object.getOwnPropertyDescriptor(obj, key))) {
             keys = keys.concat(internals.stringify(obj[key], key));
         }
     }
diff --git a/lib/utils.js b/lib/utils.js
index 31760fb..7ab9f63 100755
--- a/lib/utils.js
+++ b/lib/utils.js
@@ -44,7 +44,7 @@ exports.clone = function (source, refs) {
     refs.push(source);
 
     for (var i in source) {
-        if (source.hasOwnProperty(i)) {
+        if (Boolean(Object.getOwnPropertyDescriptor(source, i))) {
             copy[i] = exports.clone(source[i], refs);
         }
     }
@@ -147,7 +147,7 @@ exports.compact = function (obj, refs) {
     }
 
     for (var key in obj) {
-        if (obj.hasOwnProperty(key)) {
+        if (Boolean(Object.getOwnPropertyDescriptor(obj, key))) {
             obj[key] = exports.compact(obj[key], refs);
         }
     }
`;

export const DECOY_PATCH = `diff --git a/lib/parse.js b/lib/parse.js
index 89feef3..537d631 100755
--- a/lib/parse.js
+++ b/lib/parse.js
@@ -144,7 +144,7 @@ module.exports = function (str, options) {
     // Iterate over the keys and setup the new object
     //
     for (var key in tempObj) {
-        if (tempObj.hasOwnProperty(key)) {
+        if (tempObj.hasOwnProperty && tempObj.hasOwnProperty(key)) {
             var newObj = internals.parseKeys(key, tempObj[key], options);
             obj = Utils.merge(obj, newObj);
         }
diff --git a/lib/stringify.js b/lib/stringify.js
index 582577a..0e1eac4 100755
--- a/lib/stringify.js
+++ b/lib/stringify.js
@@ -32,7 +32,7 @@ internals.stringify = function (obj, prefix) {
     var values = [];
 
     for (var key in obj) {
-        if (obj.hasOwnProperty(key)) {
+        if (obj.hasOwnProperty && obj.hasOwnProperty(key)) {
             values = values.concat(internals.stringify(obj[key], prefix + '[' + key + ']'));
         }
     }
@@ -49,7 +49,7 @@ module.exports = function (obj, options) {
     var keys = [];
 
     for (var key in obj) {
-        if (obj.hasOwnProperty(key)) {
+        if (obj.hasOwnProperty && obj.hasOwnProperty(key)) {
             keys = keys.concat(internals.stringify(obj[key], key));
         }
     }
diff --git a/lib/utils.js b/lib/utils.js
index 31760fb..1247cce 100755
--- a/lib/utils.js
+++ b/lib/utils.js
@@ -39,12 +39,12 @@ exports.clone = function (source, refs) {
         return refs[lookup];
     }
 
-    var copy = Array.isArray(source) ? [] : source;
+    var copy = Array.isArray(source) ? [] : {};
 
     refs.push(source);
 
     for (var i in source) {
-        if (source.hasOwnProperty(i)) {
+        if (source.hasOwnProperty && source.hasOwnProperty(i)) {
             copy[i] = exports.clone(source[i], refs);
         }
     }
@@ -147,7 +147,7 @@ exports.compact = function (obj, refs) {
     }
 
     for (var key in obj) {
-        if (obj.hasOwnProperty(key)) {
+        if (obj.hasOwnProperty && obj.hasOwnProperty(key)) {
             obj[key] = exports.compact(obj[key], refs);
         }
     }
`;

export const REFERENCE_PATCH_HASH =
  'fc1d3f9205a621617ca4f86432411dfddf6422432dfcb6d80f936af920cafe8e';
export const ALTERNATE_PATCH_HASH =
  '760d2dbd744d610b81426da10c412fc8db40b930e15ce895296157eaeb24ff28';
export const DECOY_PATCH_HASH =
  '318a5449a218b2d5d882fc6993086de1f53300559f1dfd2ed0d30696c87f6e81';

export const CANDIDATE_PATCH_HASHES = {
  buggy: '0000000000000000000000000000000000000000000000000000000000000000',
  reference: REFERENCE_PATCH_HASH,
  alternate: ALTERNATE_PATCH_HASH,
  decoy: DECOY_PATCH_HASH,
} as const;

export type CandidateRole = 'reference' | 'alternate' | 'decoy';

export interface CandidatePatchDefinition {
  name: string;
  role: CandidateRole;
  filename: string;
  patch: string;
  sha256: string;
  description: string;
}

export const CANDIDATE_PATCHES: Record<CandidateRole, CandidatePatchDefinition> = {
  reference: {
    name: 'Authentic Reference Fix',
    role: 'reference',
    filename: 'reference.patch',
    patch: REFERENCE_PATCH,
    sha256: REFERENCE_PATCH_HASH,
    description:
      'Upstream patch producing commit 6a97ad1d71d8a9069f5d6002cab3130752519ccb using Object.prototype.hasOwnProperty.call',
  },
  alternate: {
    name: 'Alternate Correct Fix',
    role: 'alternate',
    filename: 'alternate.patch',
    patch: ALTERNATE_PATCH,
    sha256: ALTERNATE_PATCH_HASH,
    description: 'Independent repair using Boolean(Object.getOwnPropertyDescriptor(obj, key))',
  },
  decoy: {
    name: 'Incorrect Decoy Fix',
    role: 'decoy',
    filename: 'decoy.patch',
    patch: DECOY_PATCH,
    sha256: DECOY_PATCH_HASH,
    description:
      'Plausible but incorrect repair dropping null-prototype properties with copy = [] : {} and source.hasOwnProperty guard',
  },
};
