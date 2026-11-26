import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureSource = path.join(repoRoot, 'fixtures', 'installed-peer');
const cliPath = path.join(repoRoot, 'dist', 'index.js');

function setupFixture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monodep-installed-peer-'));
  fs.cpSync(fixtureSource, tmpDir, { recursive: true });
  const installed = {
    'needs-react17': { version: '1.0.0', peerDependencies: { react: '^17.0.0' } },
    'needs-typescript': { version: '1.0.0', peerDependencies: { typescript: '^5.0.0' } },
    react: { version: '18.2.0' },
  };
  for (const [name, manifest] of Object.entries(installed)) {
    const packageDir = path.join(tmpDir, 'node_modules', name);
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name, ...manifest }));
  }
  return tmpDir;
}

test('installed peer check is opt-in and does not fail by default', () => {
  const tmpDir = setupFixture();
  const result = spawnSync('node', [cliPath, tmpDir, '--compact', '--only-extras', '--no-outdated'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /issues=0/);
  assert.doesNotMatch(result.stdout, /\[installed-peer\]/);
});

test('installed peer check reports missing/incompatible peers and fails', () => {
  const tmpDir = setupFixture();
  const result = spawnSync(
    'node',
    [cliPath, tmpDir, '--compact', '--only-extras', '--no-outdated', '--check-installed-peers'],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 1);
  const lines = result.stdout.split('\n').filter((line) => line.includes('[installed-peer]'));
  assert.equal(lines.length, 2, result.stdout);
  assert.match(result.stdout, /needs-react17 -> react/);
  assert.match(result.stdout, /needs-typescript -> typescript/);
});
