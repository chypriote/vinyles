import { buildCatalog, type CatalogEnv, type CatalogOptions } from './catalog';
import type { Catalog } from './types';

export { UnauthorizedError } from './auth';
export type { CatalogEnv, CatalogOptions } from './catalog';
export type * from './types';

export function createCatalog(env: CatalogEnv, options?: CatalogOptions): Catalog {
	return buildCatalog(env, options);
}

/** Builds the Catalog for a route from `platform.env`. */
export function catalogFromPlatform(
	platform: App.Platform | undefined,
	options?: CatalogOptions
): Catalog {
	if (!platform) throw new Error('No platform: the Catalog needs the Cloudflare bindings');
	return createCatalog(platform.env, options);
}
