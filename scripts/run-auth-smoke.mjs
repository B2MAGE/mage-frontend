import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: npm run auth:verify -- http://127.0.0.1:18080');
  process.exit(2);
}
const base = new URL(args[0]);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
  || base.search || base.hash || !['/', '/api', '/api/'].includes(base.pathname)) {
  throw new Error('Use the API origin or its /api path, without credentials or query parameters.');
}
console.log(`Checking registration, login and authenticated access at ${base.origin}. Creates one disposable @example.test account.`);
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
  'run', '--config', 'scripts/vitest-auth-smoke.config.ts',
], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit', windowsHide: true,
  env: { ...process.env, VITE_API_BASE_URL: base.href },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
