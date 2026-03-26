import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureSource = path.join(repoRoot, 'fixtures', 'ownership-report');
const cliPath = path.join(repoRoot, 'dist', 'index.js');

function setupFixture(config) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monodep-ownership-'));
  fs.cpSync(fixtureSource, tmpDir, { recursive: true });
  if (config) {
    fs.writeFileSync(path.join(tmpDir, '.monodeprc.json'), JSON.stringify(config, null, 2), 'utf8');
  }
  return tmpDir;
}

test('ownership report is opt-in and hidden by default', () => {
  const tmpDir = setupFixture();
  const result = spawnSync('node', [cliPath, tmpDir, '--compact', '--only-extras', '--no-outdated'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /\[ownership\]/);
});

test('root-shared policy reports shared dependency not declared at root', () => {
  const tmpDir = setupFixture();
  const result = spawnSync(
    'node',
    [cliPath, tmpDir, '--compact', '--only-extras', '--no-outdated', '--ownership-report'],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[ownership\]/);
  assert.match(result.stdout, /lodash/);
});

test('workspace-explicit policy reports root-declared dependency used without local declaration', () => {
  const tmpDir = setupFixture({ ownershipPolicy: 'workspace-explicit', ownershipReport: true });
  const result = spawnSync('node', [cliPath, tmpDir, '--compact', '--only-extras', '--no-outdated'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[ownership\]/);
  assert.match(result.stdout, /chalk/);
  assert.match(result.stdout, /@fixture\/a/);
});
