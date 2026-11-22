#!/usr/bin/env node
// The SvelteKit Cloudflare adapter builds a Worker with only a `fetch` handler.
// After `vite build`, this wraps it with a `scheduled` handler that calls /api/cron/refresh-prices,
// and points the generated Wrangler config at the wrapper. The cron times are in wrangler.jsonc.
import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('../.svelte-kit/cloudflare/worker/', import.meta.url);

await writeFile(
	new URL('cron.js', dir),
	`import worker from './index.js';

export default {
	...worker,
	scheduled(_event, env, ctx) {
		const request = new Request('https://vinyles.internal/api/cron/refresh-prices', {
			method: 'POST',
			headers: { authorization: \`Bearer \${env.CRON_SECRET}\` }
		});
		ctx.waitUntil(worker.fetch(request, env, ctx));
	}
};
`
);

const configPath = new URL('wrangler.json', dir);
const config = JSON.parse(await readFile(configPath, 'utf8'));
config.main = 'cron.js';
await writeFile(configPath, JSON.stringify(config, null, 2));
