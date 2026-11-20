<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { postAction } from '#lib/forms';
	import { initials, tileClass } from '#lib/tile';
	import type { ImportProgress, UnmatchedAlbum } from '#lib/server/catalog/types';
	import Button from './Button.svelte';
	import Field from './Field.svelte';

	let { progress, unmatched }: { progress: ImportProgress; unmatched: UnmatchedAlbum[] } = $props();

	let live = $state<ImportProgress | null>(null);
	const shown = $derived(live ?? progress);
	let running = $state(false);
	let error = $state<string | null>(null);
	let years = $state<Record<number, string>>({});
	let saving = $state(false);

	const finished = $derived(shown.total > 0 && shown.done >= shown.total);

	/** One batch per request, until every Album is looked up. */
	async function runLookup() {
		running = true;
		error = null;
		try {
			while (!finished) {
				const before = (live ?? progress).done;
				const response = await fetch('/api/import/lookup', { method: 'POST' });
				if (!response.ok) {
					error = ((await response.json()) as { error?: string }).error ?? 'Lookup failed';
					return;
				}
				live = (await response.json()) as ImportProgress;
				if (live.done >= live.total) break;
				if (live.done <= before) {
					error = 'The lookup made no progress';
					return;
				}
			}
			await invalidateAll();
		} catch {
			error = 'Network error';
		} finally {
			running = false;
		}
	}

	async function saveYears() {
		const list = [];
		for (const album of unmatched) {
			const text = (years[album.albumId] ?? '').trim();
			if (!text) continue;
			const releaseYear = Number(text);
			if (!Number.isInteger(releaseYear) || releaseYear < 1000 || releaseYear > 9999) {
				error = `${album.title}: a release year has 4 digits`;
				return;
			}
			list.push({ albumId: album.albumId, releaseYear });
		}
		saving = true;
		const outcome = await postAction('?/saveYears', { years: list });
		saving = false;
		if (outcome.ok) await goto(resolve('/'));
		else error = outcome.error;
	}
</script>

<main class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
	<h1>Import</h1>

	<section class="flex flex-col gap-3">
		<p class="text-sm font-medium" aria-live="polite">Imported {shown.done} of {shown.total}</p>
		<div>
			<Button loading={running} disabled={finished || shown.total === 0} onclick={runLookup}>
				Run lookup
			</Button>
		</div>
	</section>

	{#if unmatched.length > 0}
		<section class="flex flex-col gap-4">
			<h2 class="text-sm font-bold">No match</h2>
			<ul class="flex flex-col gap-4">
				{#each unmatched as album (album.albumId)}
					<li class="flex flex-wrap items-end gap-3">
						<span
							aria-hidden="true"
							class="flex size-14 shrink-0 items-center justify-center rounded-(--cover-radius) text-lg font-extrabold text-primary-foreground {tileClass(
								album.artist
							)}"
						>
							{initials(album.artist)}
						</span>
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="text-sm font-bold">{album.title}</span>
							<span class="text-sm text-muted-foreground">{album.artist}</span>
						</div>
						<Field label="Release year" type="number" bind:value={years[album.albumId]} />
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if error}<p class="text-sm font-medium" role="alert">! {error}</p>{/if}

	{#if finished}
		<div>
			<Button intent="success" loading={saving} onclick={saveYears}>Save years</Button>
		</div>
	{/if}
</main>
