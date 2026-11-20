<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageProps } from './$types';
	import type { CoverCheckProgress, FailingCover } from '#lib/server/catalog/types';
	import Button from '#lib/components/Button.svelte';
	import CoverPicker from '#lib/components/CoverPicker.svelte';
	import Popup from '#lib/components/Popup.svelte';
	import { initials, tileClass } from '#lib/tile';

	let { data }: PageProps = $props();

	let running = $state(false);
	let error = $state<string | null>(null);
	let changing = $state<FailingCover | null>(null);
	let open = $state(false);

	/** One batch per request, until every Cover is checked. */
	async function runCheck() {
		running = true;
		error = null;
		try {
			let pending = data.progress.pending;
			while (pending > 0) {
				const response = await fetch('/api/admin/cover-check', { method: 'POST' });
				if (!response.ok) {
					error = ((await response.json()) as { error?: string }).error ?? 'The check failed';
					return;
				}
				const next = (await response.json()) as CoverCheckProgress;
				if (next.pending >= pending) {
					error = 'The check made no progress';
					return;
				}
				pending = next.pending;
			}
			await invalidateAll();
		} catch {
			error = 'Network error';
		} finally {
			running = false;
		}
	}
</script>

<svelte:head><title>Vinyles | Admin</title></svelte:head>

<main class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
	<h1>Admin</h1>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-bold">Cover quality</h2>
		<p class="text-sm font-medium" aria-live="polite">
			{data.failing.length} failing · {data.progress.pending} to check
		</p>
		<div>
			<Button loading={running} disabled={data.progress.pending === 0} onclick={runCheck}>
				Check covers
			</Button>
		</div>
		{#if error}<p class="text-sm font-medium" role="alert">! {error}</p>{/if}
	</section>

	{#if data.failing.length > 0}
		<ul class="flex flex-col gap-4">
			{#each data.failing as album (album.albumId)}
				<li class="flex flex-wrap items-center gap-3">
					<span
						aria-hidden="true"
						class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-(--cover-radius) text-lg font-extrabold text-primary-foreground {tileClass(
							album.artist
						)}"
					>
						{initials(album.artist)}
					</span>
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="text-sm font-bold">{album.title}</span>
						<span class="text-sm text-muted-foreground">{album.artist}</span>
						<span class="text-sm">{album.reason}</span>
					</div>
					<Button
						onclick={() => {
							changing = album;
							open = true;
						}}
					>
						Change cover
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</main>

{#if changing}
	<Popup bind:open album="Change cover" wide onDismiss={() => (changing = null)}>
		{#snippet details()}
			{#if changing}
				<CoverPicker
					albumId={changing.albumId}
					query={`${changing.artist} ${changing.title}`}
					onBack={() => (open = false)}
					onDone={() => (open = false)}
				/>
			{/if}
		{/snippet}
	</Popup>
{/if}
