import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { repoRoot, runCli, makeProject } from './helpers.mjs';

test('--version prints the version from package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const result = runCli(['--version']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), pkg.version);
});

test('a directory that does not exist is an error (exit 2), not a silent pass', () => {
  const missing = path.join(os.tmpdir(), 'monodep-does-not-exist-' + Date.now());
  const result = runCli([missing, '--compact', '--no-outdated']);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr, /does not exist|not found/i);
});

test('a directory without any package.json is an error (exit 2)', () => {
  const dir = makeProject({ 'README.md': '# empty' });
  const result = runCli([dir, '--compact', '--no-outdated']);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr, /package\.json/);
});
