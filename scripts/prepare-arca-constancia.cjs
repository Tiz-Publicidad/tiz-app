'use strict';
// Only the consulta module is packaged. Never load the invoice entry point.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const project = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8'));
assert.equal(config.functions.source, 'functions');
assert.equal(config.functions.runtime, 'nodejs22');
assert.equal(project.projects.default, 'tiz---app');
const stage = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'tiz-arca-constancia-'));
const dest = path.join(stage, 'functions');
fs.mkdirSync(dest);
for (const file of ['arcaPadronA5V125.js', 'package-lock.json']) {
  fs.copyFileSync(path.join(root, 'functions', file), path.join(dest, file));
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'functions/package.json'), 'utf8'));
pkg.main = 'arcaPadronA5V125.js';
fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(path.join(stage, 'firebase.json'), JSON.stringify({ functions: { source: 'functions', runtime: 'nodejs22' } }, null, 2) + '\n');
// Emits only a temporary directory path. No environment or secret values.
console.log(stage);
