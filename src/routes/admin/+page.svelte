<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageProps } from './$types';
	import type {
		CoverCheckProgress,
		FailingCover,
		SuggestionProgress,
		SuggestionView
	} from '#lib/server/catalog/types';
	import Button from '#lib/components/Button.svelte';
	import { Button as UiButton } from '#lib/components/ui/button/index.js';
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

	let finding = $state(false);
	let suggestionError = $state<string | null>(null);
	/** Suggestion ids and Album ids whose request runs. */
	let busy = $state<string | null>(null);
	let brokenCovers = $state<number[]>([]);

	/** One batch of seed Artists per request, until the run is over. */
	async function findSuggestions() {
		finding = true;
		suggestionError = null;
		try {
			let cursor: number | null = 0;
			let failures = 0;
			while (cursor !== null) {
				const response: Response = await fetch('/api/admin/suggestions/find', {
					method: 'POST',
					body: JSON.stringify({ cursor })
				});
				if (!response.ok) {
					suggestionError =
						((await response.json()) as { error?: string }).error ?? 'The search failed';
					break;
				}
				const progress = (await response.json()) as SuggestionProgress;
				failures += progress.failures;
				cursor = progress.next;
			}
			if (failures && !suggestionError) {
				suggestionError = `${failures} searches failed (MusicBrainz or Last.fm). Try again later.`;
			}
			await invalidateAll();
		} catch {
			suggestionError = 'Network error';
		} finally {
			finding = false;
		}
	}

	async function act(url: string, key: string) {
		busy = key;
		suggestionError = null;
		try {
			const response = await fetch(url, { method: 'POST' });
			if (!response.ok) {
				suggestionError =
					((await response.json()) as { error?: string }).error ?? 'The change failed';
				return;
			}
			await invalidateAll();
		} catch {
			suggestionError = 'Network error';
		} finally {
			busy = null;
		}
	}

	const coverUrl = (s: SuggestionView) =>
		`https://coverartarchive.org/release-group/${encodeURIComponent(s.musicbrainzId ?? '')}/front-250`;
</script>

<svelte:head><title>Vinyles | Admin</title></svelte:head>

<main class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
	<div class="flex items-center justify-between gap-3">
		<h1>Admin</h1>
		<UiButton variant="neutral" href="/">Back home</UiButton>
	</div>

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

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-bold">Suggestions</h2>
		<p class="text-sm font-medium" aria-live="polite">
			{data.suggestions.length} of {data.maxSuggestions} pending
		</p>
		<div>
			<Button
				loading={finding}
				disabled={data.suggestions.length >= data.maxSuggestions}
				onclick={findSuggestions}
			>
				Find suggestions
			</Button>
		</div>
		{#if suggestionError}<p class="text-sm font-medium" role="alert">! {suggestionError}</p>{/if}
		<ul class="flex flex-col gap-4">
			{#each data.suggestions as suggestion (suggestion.id)}
				<li class="flex flex-wrap items-center gap-3">
					{#if suggestion.musicbrainzId && !brokenCovers.includes(suggestion.id)}
						<img
							src={coverUrl(suggestion)}
							alt=""
							loading="lazy"
							class="size-14 shrink-0 rounded-(--cover-radius) object-cover"
							onerror={() => (brokenCovers = [...brokenCovers, suggestion.id])}
						/>
					{:else}
						<span
							aria-hidden="true"
							class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-(--cover-radius) text-lg font-extrabold text-primary-foreground {tileClass(
								suggestion.artist
							)}"
						>
							{initials(suggestion.artist)}
						</span>
					{/if}
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="text-sm font-bold">{suggestion.title}</span>
						<span class="text-sm text-muted-foreground">
							{suggestion.artist}{suggestion.releaseYear ? ` · ${suggestion.releaseYear}` : ''}
						</span>
						<span class="text-sm">{suggestion.reason}</span>
					</div>
					<div class="flex gap-2">
						<Button
							intent="success"
							loading={busy === `add-${suggestion.id}`}
							disabled={busy !== null}
							onclick={() =>
								act(`/api/admin/suggestions/${suggestion.id}/add`, `add-${suggestion.id}`)}
						>
							Add
						</Button>
						<Button
							intent="danger"
							loading={busy === `discard-${suggestion.id}`}
							disabled={busy !== null}
							onclick={() =>
								act(`/api/admin/suggestions/${suggestion.id}/discard`, `discard-${suggestion.id}`)}
						>
							Discard
						</Button>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-bold">Discarded</h2>
		<p class="text-sm font-medium">{data.discarded.length} discarded</p>
		<ul class="flex flex-col gap-3">
			{#each data.discarded as album (album.albumId)}
				<li class="flex flex-wrap items-center gap-3">
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="text-sm font-bold">{album.title}</span>
						<span class="text-sm text-muted-foreground">{album.artist}</span>
					</div>
					<Button
						loading={busy === `undiscard-${album.albumId}`}
						disabled={busy !== null}
						onclick={() =>
							act(`/api/admin/discarded/${album.albumId}/undiscard`, `undiscard-${album.albumId}`)}
					>
						Undiscard
					</Button>
				</li>
			{/each}
		</ul>
	</section>

	{#if data.failing.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-bold">Failing covers</h2>
			<ul class="flex flex-col gap-4">
				{#each data.failing as album (album.albumId)}
					<li class="flex flex-wrap items-center gap-3">
						{#if album.coverKey}
							<img
								src="/covers/{album.albumId}?v={album.coverVersion}"
								alt=""
								loading="lazy"
								class="size-14 shrink-0 rounded-(--cover-radius) object-cover"
							/>
						{:else}
							<span
								aria-hidden="true"
								class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-(--cover-radius) text-lg font-extrabold text-primary-foreground {tileClass(
									album.artist
								)}"
							>
								{initials(album.artist)}
							</span>
						{/if}
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="text-sm font-bold">{album.title}</span>
							<span class="text-sm text-muted-foreground">{album.artist}</span>
							<span class="text-sm">{album.reason}</span>
							<span class="text-xs font-medium text-muted-foreground">
								{[album.inCollection && 'Collection', album.inWishlist && 'Wishlist']
									.filter(Boolean)
									.join(' + ')}
							</span>
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
		</section>
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
