import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import { stores } from '../src/lib/server/db/schema';

describe('test setup', () => {
	it('runs in workerd with D1 migrations applied and the Official Store seeded', async () => {
		const db = drizzle(env.DB);
		const rows = await db.select({ name: stores.name }).from(stores);
		expect(rows).toEqual([{ name: 'Official Store' }]);
	});

	it('has a real R2 bucket', async () => {
		await env.COVERS.put('probe', 'x');
		const obj = await env.COVERS.get('probe');
		expect(await obj?.text()).toBe('x');
	});
});
