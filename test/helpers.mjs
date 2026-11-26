import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

export const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const cliPath = path.join(repoRoot, 'dist', 'index.js');

/** Create a temp project from a { 'relative/path': string | object } map. */
export function makeProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monodep-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(dir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}

export function runCli(args, options = {}) {
  const result = spawnSync('node', [cliPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Async variant for tests that need an in-process server to answer while the CLI runs. */
export function runCliAsync(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [cliPath, ...args], { env: { ...process.env, ...options.env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}
