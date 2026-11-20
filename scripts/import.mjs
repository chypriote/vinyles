#!/usr/bin/env node
// Sends the cleaned sheet rows to the app, then runs the Album lookup until every Album is done.
//
//   VINYLES_URL=https://... OWNER_PASSWORD=... node scripts/import.mjs rows.json [--rerun] [--replace]
//
// Default: import the rows, look up the Albums not looked up yet.
// --rerun: look up every Album again (year, match, unchosen Covers); Owner-chosen Covers are kept.
// --replace: with --rerun, also overwrite Owner-chosen Covers.
// With --rerun and no rows file, only the lookup runs.
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const rerun = args.includes('--rerun');
const replace = args.includes('--replace');
const file = args.find((a) => !a.startsWith('--'));
const base = (process.env.VINYLES_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const password = process.env.OWNER_PASSWORD;

if (replace && !rerun) fail('--replace needs --rerun');
if (!password) fail('Set OWNER_PASSWORD');
if (!file && !rerun) fail('Usage: import.mjs rows.json [--rerun] [--replace]');

function fail(message) {
	console.error(message);
	process.exit(1);
}

let cookie = '';
async function call(path, init = {}) {
	const response = await fetch(base + path, {
		...init,
		headers: { origin: base, cookie, ...init.headers }
	});
	if (!response.ok) fail(`${path}: ${response.status} ${await response.text()}`);
	return response;
}

const login = await call('/login', {
	method: 'POST',
	headers: { 'content-type': 'application/x-www-form-urlencoded' },
	body: new URLSearchParams({ password })
});
cookie = login.headers
	.getSetCookie()
	.map((c) => c.split(';')[0])
	.join('; ');
if (!cookie) fail('Login failed');

if (file) {
	const rows = await readFile(file, 'utf8');
	const imported = await call('/api/import/rows', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: rows
	});
	console.log(await imported.json());
}

let after;
let lastDone = -1;
for (;;) {
	const response = await call('/api/import/lookup', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ rerun, replace, after })
	});
	const progress = await response.json();
	console.log(`${progress.done}/${progress.total}`);
	if (progress.done >= progress.total) break;
	if (progress.done === lastDone && progress.after === after) {
		console.error('The lookup made no progress, stopping.');
		process.exit(1);
	}
	lastDone = progress.done;
	after = progress.after;
}
