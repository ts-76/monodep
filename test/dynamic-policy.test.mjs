import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureSource = path.join(repoRoot, 'fixtures', 'dynamic-import');
const cliPath = path.join(repoRoot, 'dist', 'index.js');

function runWithPolicy(policy) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monodep-dynamic-'));
  fs.cpSync(fixtureSource, tmpDir, { recursive: true });

  fs.writeFileSync(
    path.join(tmpDir, '.monodeprc.json'),
    JSON.stringify({ dynamicImportPolicy: policy, checkOutdated: false }, null, 2),
    'utf8'
  );

  const result = spawnSync('node', [cliPath, tmpDir, '--compact'], {
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

test('dynamic policy off hides dynamic candidates and keeps success exit', () => {
  const result = runWithPolicy('off');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[monodep\]\s+scanned=1\s+issues=0/);
  assert.doesNotMatch(result.stdout, /\[dynamic\]/);
});

test('dynamic policy warn prints dynamic candidates without failing', () => {
  const result = runWithPolicy('warn');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[dynamic\]/);
  assert.match(result.stdout, /issues=0/);
});

test('dynamic policy strict prints dynamic candidates and fails', () => {
  const result = runWithPolicy('strict');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[dynamic\]/);
  assert.match(result.stdout, /issues=1/);
});
