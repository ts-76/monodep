import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, runCli } from './helpers.mjs';

function analyze(files, extraArgs = []) {
  const dir = makeProject(files);
  return runCli([dir, '--compact', '--no-outdated', ...extraArgs]);
}

test('tsconfig.json with comments and trailing commas still contributes compilerOptions.types', () => {
  const result = analyze({
    'package.json': { name: 'jsonc-types', devDependencies: { vite: '^6.0.0', typescript: '^5.0.0' } },
    'tsconfig.json': '{\n  // comments are legal in tsconfig\n  "compilerOptions": { "types": ["vite/client",], },\n}\n',
    'src/index.ts': 'export const x = 1;\n',
  });
  assert.doesNotMatch(result.stdout, /\[unused\].*vite/, result.stdout);
});

test('peerDependencies ranges are not compared in the version-mismatch check', () => {
  const result = analyze(
    {
      'package.json': { name: 'root', private: true, workspaces: ['packages/*'] },
      'packages/a/package.json': {
        name: 'a',
        devDependencies: { react: '^18.2.0' },
        peerDependencies: { react: '>=18' },
      },
      'packages/a/src/index.js': "import 'react';\n",
      'packages/b/package.json': { name: 'b', dependencies: { react: '^18.2.0' } },
      'packages/b/src/index.js': "import 'react';\n",
    },
    ['--only-extras'],
  );
  assert.doesNotMatch(result.stdout, /\[mismatch\]/, result.stdout);
});

test('real version mismatches are still reported (guard for the peer fix)', () => {
  const result = analyze(
    {
      'package.json': { name: 'root', private: true, workspaces: ['packages/*'] },
      'packages/a/package.json': { name: 'a', dependencies: { react: '^18.2.0' } },
      'packages/a/src/index.js': "import 'react';\n",
      'packages/b/package.json': { name: 'b', dependencies: { react: '^17.0.2' } },
      'packages/b/src/index.js': "import 'react';\n",
    },
    ['--only-extras'],
  );
  assert.match(result.stdout, /\[mismatch\] \*: react/, result.stdout);
  assert.equal(result.status, 1);
});

test('dependencies invoked as commands in scripts are not reported as unused', () => {
  const result = analyze({
    'package.json': {
      name: 'script-tools',
      scripts: {
        build: 'rolldown -c',
        release: 'NODE_ENV=production changelogen --release && echo done',
        lint: 'npx --no-install oxlint src',
      },
      devDependencies: { rolldown: '^1.0.0', changelogen: '^0.6.0', oxlint: '^1.0.0', unrelated: '^1.0.0' },
    },
  });
  assert.doesNotMatch(result.stdout, /\[unused\] script-tools: (rolldown|changelogen|oxlint)/, result.stdout);
  // guard: a dependency that nothing references is still unused
  assert.match(result.stdout, /\[unused\] script-tools: unrelated/, result.stdout);
});

test('a dependency whose bin name differs from the package name is detected from scripts', () => {
  const result = analyze({
    'package.json': {
      name: 'bin-tools',
      scripts: { check: 'tsx-runner run.ts' },
      devDependencies: { '@scope/tsx-runner-pkg': '^1.0.0' },
    },
    'node_modules/@scope/tsx-runner-pkg/package.json': {
      name: '@scope/tsx-runner-pkg',
      version: '1.0.0',
      bin: { 'tsx-runner': './cli.js' },
    },
  });
  assert.doesNotMatch(result.stdout, /\[unused\].*tsx-runner-pkg/, result.stdout);
});

test('import types, export type-from and import-equals count as usage', () => {
  const result = analyze({
    'package.json': {
      name: 'syntax-forms',
      dependencies: { 'legacy-cjs': '^1.0.0' },
      devDependencies: { 'only-types': '^1.0.0', 'reexported-types': '^1.0.0' },
    },
    'src/index.ts': [
      "export type { Shape } from 'reexported-types';",
      "export type Foo = import('only-types').Foo;",
      "import legacy = require('legacy-cjs');",
      'export { legacy };',
      '',
    ].join('\n'),
  });
  assert.doesNotMatch(result.stdout, /\[unused\]/, result.stdout);
  // `export type { } from` is type-only, so a devDependency is the right place for it
  assert.doesNotMatch(result.stdout, /\[wrongType\]/, result.stdout);
  assert.doesNotMatch(result.stdout, /\[missing\]/, result.stdout);
});

test('a package importing its own name (self-reference) is not reported as missing', () => {
  const result = analyze({
    'package.json': { name: 'self-ref', exports: { '.': './src/index.js', './utils': './src/utils.js' } },
    'src/index.js': "import { helper } from 'self-ref/utils';\nexport { helper };\n",
    'src/utils.js': 'export const helper = 1;\n',
  });
  assert.doesNotMatch(result.stdout, /\[missing\]/, result.stdout);
});

test('require.resolve() of an optional/absent package is not treated as a dependency reference', () => {
  // Guard: checking that a module is *not* installed (e.g. in verification scripts) must not create a "missing" report.
  const result = analyze({
    'package.json': { name: 'resolve-guard' },
    'src/index.js': "export const has = (() => { try { return require.resolve('optional-thing'); } catch { return null; } })();\n",
  });
  assert.doesNotMatch(result.stdout, /\[missing\]/, result.stdout);
});
