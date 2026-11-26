import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, runCli } from './helpers.mjs';

function manyPackages(count) {
  const files = { 'package.json': { name: 'root', private: true, workspaces: ['packages/*'] } };
  for (let i = 0; i < count; i++) {
    const name = `pkg-${String(i).padStart(2, '0')}`;
    files[`packages/${name}/package.json`] = { name, dependencies: { [`dep-${name}`]: '^1.0.0' } };
    files[`packages/${name}/src/index.js`] = 'export {};\n';
  }
  return files;
}

test('compact output lists packages in a stable (sorted) order', () => {
  const dir = makeProject(manyPackages(24));
  const runs = [0, 1, 2].map(() => runCli([dir, '--compact', '--no-outdated']).stdout);
  const lines = runs[0].split('\n').filter((line) => line.startsWith('[unused]'));
  const packagesInOrder = lines.map((line) => line.match(/^\[unused\] (\S+):/)[1]);
  assert.deepEqual(packagesInOrder, [...packagesInOrder].sort(), 'packages must be reported in sorted order');
  assert.equal(runs[1], runs[0]);
  assert.equal(runs[2], runs[0]);
});

test('dependency lists inside one package are reported in sorted order', () => {
  const dependencies = {};
  for (const name of ['zeta', 'alpha', 'mid', 'beta', 'omega', 'delta', 'gamma', 'kappa']) dependencies[name] = '^1.0.0';
  const dir = makeProject({ 'package.json': { name: 'one', dependencies }, 'src/index.js': 'export {};\n' });
  const out = runCli([dir, '--compact', '--no-outdated']).stdout;
  const unused = out.split('\n').filter((l) => l.startsWith('[unused]')).map((l) => l.split(': ')[1]);
  assert.deepEqual(unused, [...unused].sort());
});

test('missing dependencies are reported in sorted order', () => {
  const dir = makeProject({
    'package.json': { name: 'miss' },
    'src/index.js': ["import 'zz';", "import 'aa';", "import 'mm';", "import 'bb';", ''].join('\n'),
  });
  const out = runCli([dir, '--compact', '--no-outdated']).stdout;
  const missing = out.split('\n').filter((l) => l.startsWith('[missing]')).map((l) => l.split(': ')[1]);
  assert.deepEqual(missing, ['aa', 'bb', 'mm', 'zz']);
});
