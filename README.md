# Vinyles

Nico's vinyl Collection and Wishlist as a wall of Covers. SvelteKit (Svelte 5) on Cloudflare Workers, Drizzle ORM on D1, Covers in R2, shadcn-svelte + Tailwind CSS v4. Spec: GitHub issue #2. Design: DESIGN.md, TOKENS.md, COMPONENTS.md.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (`.npmrc` sets `legacy-peer-deps`) |
| `npm run dev` | Dev server |
| `npm run build` | Build for Cloudflare |
| `npm run check` | `svelte-kit sync` + `svelte-check` |
| `npm run lint` | ESLint (typescript-eslint, eslint-plugin-svelte) |
| `npm run format` / `format:check` | Prettier write / check |
| `npm run verify` | `format:check`, `lint` and `check` in one run |
| `npm run ci` | `verify`, `test` and `build`; the same command GitHub Actions runs |
| `npm test` | Vitest in the Workers runtime (real D1 with migrations, real R2) |
| `npm run types` | Regenerate `worker-configuration.d.ts` after editing `wrangler.jsonc` |
| `npm run db:generate` | New Drizzle migration from `src/lib/server/db/schema.ts` into `drizzle/` |
| `npm run db:migrate:local` | Apply migrations to the local D1 |
| `npm run db:migrate:remote` | Apply migrations to the production D1 |
| `npm run deploy` | Build and `wrangler deploy` |

## Cloudflare setup

1. `npx wrangler d1 create vinyles`, then put the `database_id` in `wrangler.jsonc`.
2. `npx wrangler r2 bucket create vinyles-covers`.
3. `npm run db:migrate:remote` (the second migration seeds the "Official Store").
4. Secrets:
   - `OWNER_PASSWORD`: the one Owner password. `npx wrangler secret put OWNER_PASSWORD`
   - `JWT_SECRET`: key that signs the Owner login token. Use a long random value. `npx wrangler secret put JWT_SECRET`
   - `DISCOGS_TOKEN` (optional): Discogs personal access token (free; discogs.com > Settings > Developers > Generate new token). Adds Discogs covers to the cover search. `npx wrangler secret put DISCOGS_TOKEN`

Every 6 hours a cron trigger (`wrangler.jsonc`) refreshes the prices of the 5 Wishlist Items never refreshed or refreshed longest ago, if that was over 14 days ago. `npm run build` adds the `scheduled` handler (`scripts/add-cron-handler.mjs`), because the adapter builds a Worker without one.

For local dev, put both in `.dev.vars` (git-ignored):

```
OWNER_PASSWORD=change-me
JWT_SECRET=change-me-too
```

Bindings: `DB` (D1), `COVERS` (R2).

## shadcn-svelte

`components.json` is committed (aliases use Kit 3's `#lib`). Wall tokens are mapped onto the shadcn variables in `src/app.css`. Add the components with the CLI:

```
npx shadcn-svelte add button badge input label native-select toggle-group dialog alert-dialog
```

The CLI overwrites nothing in `src/app.css` on `add`, but check the diff in case it appends variables.

## Layout

- `src/lib/server/db/schema.ts`: Drizzle schema. `drizzle/`: migrations (`0001` seeds the Official Store).
- `src/lib/server/catalog/types.ts`: public Catalog interface types (the one test seam).
- `test/`: vitest setup and tests. `vitest.config.ts` is separate from `vite.config.ts`.
