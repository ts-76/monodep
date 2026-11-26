import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { makeProject, runCliAsync } from './helpers.mjs';

// Minimal fake npm registry: GET /<encoded name>/latest -> { version }
function startRegistry(latest) {
  const requested = [];
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.replace(/^\//, '').replace(/\/latest$/, ''));
    requested.push(name);
    if (latest[name]) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ name, version: latest[name] }));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        requested,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

async function runOutdated(dependencies, latest) {
  const registry = await startRegistry(latest);
  try {
    const dir = makeProject({ 'package.json': { name: 'outdated-fixture', dependencies } });
    const result = await runCliAsync([dir, '--compact', '--only-extras'], {
      env: { MONODEP_REGISTRY: registry.url },
    });
    return { ...result, requested: registry.requested };
  } finally {
    await registry.close();
  }
}

test('the registry URL can be overridden with MONODEP_REGISTRY', async () => {
  const result = await runOutdated({ 'plain-dep': '^1.0.0' }, { 'plain-dep': '2.0.0' });
  assert.deepEqual(result.requested, ['plain-dep']);
  assert.match(result.stdout, /\[outdated\] outdated-fixture: plain-dep \(\^1\.0\.0 -> 2\.0\.0\)/, result.stdout);
  assert.equal(result.status, 1);
});

test('non-registry specifiers (git, URL, dist-tag, link) are not reported as outdated', async () => {
  const result = await runOutdated(
    {
      'git-dep': 'github:someone/git-dep#main',
      'tag-dep': 'latest',
      'url-dep': 'https://example.com/url-dep.tgz',
      'link-dep': 'link:../link-dep',
    },
    { 'git-dep': '9.0.0', 'tag-dep': '9.0.0', 'url-dep': '9.0.0', 'link-dep': '9.0.0' },
  );
  assert.doesNotMatch(result.stdout, /\[outdated\]/, result.stdout);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('npm: aliases are compared against the aliased package, not the alias name', async () => {
  const result = await runOutdated(
    {
      vite: 'npm:@scope/vite-core@1.4.0',
      'stale-alias': 'npm:real-pkg@^1.0.0',
    },
    { vite: '9.0.0', '@scope/vite-core': '1.4.0', 'real-pkg': '2.0.0' },
  );
  assert.doesNotMatch(result.stdout, /\[outdated\] outdated-fixture: vite/, result.stdout);
  assert.match(result.stdout, /\[outdated\] outdated-fixture: stale-alias \(npm:real-pkg@\^1\.0\.0 -> 2\.0\.0\)/, result.stdout);
});
