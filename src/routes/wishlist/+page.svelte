<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageProps } from './$types';
	import type { WithCoverUrl } from '#lib/covers';
	import type { WishlistItemView } from '#lib/server/catalog/types';
	import { formatCents } from '#lib/format';
	import { postAction } from '#lib/forms';
	import Button from '#lib/components/Button.svelte';
	import Chip from '#lib/components/Chip.svelte';
	import Cover from '#lib/components/Cover.svelte';
	import CoverPicker from '#lib/components/CoverPicker.svelte';
	import CoverGrid from '#lib/components/CoverGrid.svelte';
	import DesireDots from '#lib/components/DesireDots.svelte';
	import DesireFilter from '#lib/components/DesireFilter.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import AddAction from '#lib/components/AddAction.svelte';
	import LoginAction from '#lib/components/LoginAction.svelte';
	import GotItForm from '#lib/components/GotItForm.svelte';
	import Popup from '#lib/components/Popup.svelte';
	import SearchField from '#lib/components/SearchField.svelte';
	import Select from '#lib/components/Select.svelte';
	import StickyBar from '#lib/components/StickyBar.svelte';

	type Row = WithCoverUrl<WishlistItemView>;

	let { data }: PageProps = $props();

	const sorts = [
		{ value: 'artist', label: 'Sort: artist' },
		{ value: 'album', label: 'Sort: album' },
		{ value: 'year', label: 'Sort: release year' }
	];

	// Filters are page state, not in the URL. The Catalog applies them, through /api/wishlist.
	let search = $state('');
	let artist = $state('');
	let sort = $state('artist');
	let desires = $state<(1 | 2 | 3)[]>([]);
	let filtered = $state<Row[] | null>(null);

	const artistNames = $derived(
		[...new Set(data.items.map((i) => i.album.artist))].sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: 'base' })
		)
	);
	const artistOptions = $derived([
		{ value: '', label: `All artists (${artistNames.length})` },
		...artistNames.map((name) => ({ value: name, label: name }))
	]);
	const isFiltering = $derived(search.trim() !== '' || artist !== '' || desires.length > 0);
	const items = $derived(filtered ?? data.items);

	$effect(() => {
		void data.items; // refetch the filtered list after a change
		if (!isFiltering && sort === 'artist') {
			filtered = null;
			return;
		}
		const query = new SvelteURLSearchParams({ sort, desires: desires.join(',') });
		if (search.trim()) query.set('search', search.trim());
		if (artist) query.set('artist', artist);
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(`/api/wishlist?${query}`, { signal: controller.signal });
				if (response.ok) filtered = ((await response.json()) as { items: Row[] }).items;
			} catch {
				// Aborted by a newer filter, or offline: keep what is shown.
			}
		}, 150);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	function clearFilters() {
		search = '';
		artist = '';
		desires = [];
	}

	let selectedId = $state<number | null>(null);
	const selected = $derived<Row | null>(data.items.find((row) => row.id === selectedId) ?? null);
	let anchor = $state<HTMLElement | null>(null);
	let open = $state(false);
	let gotItOpen = $state(false);
	let coverOpen = $state(false);

	let dropping = $state(false);

	async function drop() {
		if (!selected) return;
		dropping = true;
		const outcome = await postAction('?/drop', { id: selected.id });
		dropping = false;
		if (outcome.ok) open = false;
	}

	// The row can disappear after a change (deleted, got, dropped): close its Popups.
	$effect(() => {
		if (selectedId !== null && !selected) {
			open = false;
			gotItOpen = false;
			coverOpen = false;
			selectedId = null;
		}
	});

	function select(item: Row, el: HTMLElement) {
		selectedId = item.id;
		anchor = el;
		open = true;
	}
</script>

<svelte:head><title>Vinyles | Wishlist</title></svelte:head>

<StickyBar current="wishlist">
	{#snippet chips()}
		<Chip tone="info" label="items" value={String(data.count)} />
	{/snippet}
	{#snippet login()}
		{#if !data.isOwner}
			<LoginAction />
		{/if}
	{/snippet}
	{#snippet action()}
		{#if data.isOwner}
			<AddAction current="wishlist" artists={data.artists} stores={data.stores} />
		{/if}
	{/snippet}
	{#snippet controls()}
		<SearchField
			bind:value={search}
			label="Search artist or album"
			placeholder="Search artist or album"
		/>
		<Select bind:value={artist} label="Artist" options={artistOptions} />
		<Select bind:value={sort} label="Sort by" options={sorts} />
		<DesireFilter bind:value={desires} />
	{/snippet}
</StickyBar>

<main>
	{#if data.items.length === 0}
		<EmptyState message="Nothing on the wishlist" />
	{:else if items.length === 0}
		<EmptyState message="No match">
			{#snippet action()}
				<Button onclick={clearFilters}>Clear filters</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<CoverGrid>
			{#each items as item (item.id)}
				<li>
					<Cover
						album={item.album.title}
						artist={item.album.artist}
						coverUrl={item.album.coverUrl}
						desire={item.desire}
						onSelect={(el) => select(item, el)}
					/>
				</li>
			{/each}
		</CoverGrid>
	{/if}
</main>

{#if selected}
	<Popup
		bind:open
		{anchor}
		album={selected.album.title}
		artist={selected.album.artist}
		coverUrl={selected.album.coverUrl}
	>
		{#snippet details()}
			<dl
				class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[15px] [&_dd]:font-extrabold [&_dd]:[overflow-wrap:break-word]"
			>
				<dt class="text-muted-foreground">Year</dt>
				<dd>{selected?.album.releaseYear ?? 'Unknown'}</dd>
				{#if selected?.variant}
					<dt class="text-muted-foreground">Variant</dt>
					<dd>{selected.variant}</dd>
				{/if}
				{#if selected}
					<dt class="text-muted-foreground">Desire</dt>
					<dd class="flex items-center gap-1.5">
						<DesireDots value={selected.desire} />
						<span class="font-medium whitespace-nowrap text-muted-foreground">
							{selected.desire}/3
						</span>
					</dd>
					{#each selected.priceQuotes as quote (quote.store.id)}
						<dt class="text-muted-foreground">{quote.store.name}</dt>
						<dd>{formatCents(quote.priceCents)}</dd>
					{/each}
				{/if}
			</dl>
		{/snippet}
		{#snippet actions()}
			{#if data.isOwner}
				<Button
					intent="success"
					onclick={() => {
						open = false;
						gotItOpen = true;
					}}
				>
					Got it
				</Button>
				<Button
					onclick={() => {
						open = false;
						coverOpen = true;
					}}
				>
					Change cover
				</Button>
				<Button loading={dropping} onclick={drop}>Drop</Button>
			{/if}
		{/snippet}
	</Popup>
{/if}

{#if data.isOwner && selected}
	<Popup bind:open={gotItOpen} album={`Got ${selected.album.title}`}>
		{#snippet details()}
			{#if selected}
				<GotItForm
					wishlistItemId={selected.id}
					stores={data.stores}
					onDone={() => (gotItOpen = false)}
				/>
			{/if}
		{/snippet}
	</Popup>
{/if}

{#if data.isOwner && selected}
	<Popup bind:open={coverOpen} album="Change cover">
		{#snippet details()}
			{#if selected}
				<CoverPicker
					albumId={selected.album.id}
					onBack={() => (coverOpen = false)}
					onDone={() => (coverOpen = false)}
				/>
			{/if}
		{/snippet}
	</Popup>
{/if}
