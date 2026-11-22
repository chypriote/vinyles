/// <reference types="@cloudflare/vitest-pool-workers/types" />

declare namespace Cloudflare {
	interface Env {
		TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
		OWNER_PASSWORD: string;
		JWT_SECRET: string;
		CRON_SECRET: string;
		DISCOGS_TOKEN?: string;
		LASTFM_API_KEY?: string;
	}
}
