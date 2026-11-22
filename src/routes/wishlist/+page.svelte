<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageProps } from './$types';
	import type { WithCoverUrl } from '#lib/covers';
	import type { WishlistItemView } from '#lib/server/catalog/types';
	import { formatCents, formatDate } from '#lib/format';
	import { postAction } from '#lib/forms';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import ArtistFilter from '#lib/components/ArtistFilter.svelte';
	import Button from '#lib/components/Button.svelte';
	import { Button as UiButton } from '#lib/components/ui/button/index.js';
	import Chip from '#lib/components/Chip.svelte';
	import Cover from '#lib/components/Cover.svelte';
	import CoverPicker from '#lib/components/CoverPicker.svelte';
	import CoverGrid from '#lib/components/CoverGrid.svelte';
	import DesireDots from '#lib/components/DesireDots.svelte';
	import DesirePicker from '#lib/components/DesirePicker.svelte';
	import DesireFilter from '#lib/components/DesireFilter.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import AddAction from '#lib/components/AddAction.svelte';
	import LoginAction from '#lib/components/LoginAction.svelte';
	import ProductLinks from '#lib/components/ProductLinks.svelte';
	import WishlistEditForm from '#lib/components/WishlistEditForm.svelte';
	import GotItForm from '#lib/components/GotItForm.svelte';
	import Popup from '#lib/components/Popup.svelte';
	import SearchField from '#lib/components/SearchField.svelte';
	import SortDirection from '#lib/components/SortDirection.svelte';
	import Select from '#lib/components/Select.svelte';
	import StickyBar from '#lib/components/StickyBar.svelte';

	type Row = WithCoverUrl<WishlistItemView>;

	let { data }: PageProps = $props();

	const sorts = [
		{ value: 'desire', label: 'Sort: most wanted' },
		{ value: 'artist', label: 'Sort: artist' },
		{ value: 'album', label: 'Sort: album' },
		{ value: 'year', label: 'Sort: release year' }
	];

	// The usual direction of each sort: the latest or most first for year, acquired and desire.
	const usualDirection: Record<string, string> = {
		desire: 'desc',
		artist: 'asc',
		album: 'asc',
		year: 'desc'
	};

	// Filters are page state, not in the URL. The Catalog applies them, through /api/wishlist.
	let search = $state('');
	let selectedArtists = $state<string[]>([]);
	let sort = $state('desire');
	let direction = $derived(usualDirection[sort]);
	let desires = $state<(1 | 2 | 3)[]>([]);
	let filtered = $state<Row[] | null>(null);

	const artistNames = $derived(
		[...new Set(data.items.map((i) => i.album.artist))].sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: 'base' })
		)
	);
	const isFiltering = $derived(
		search.trim() !== '' || selectedArtists.length > 0 || desires.length > 0
	);
	const items = $derived(filtered ?? data.items);

	$effect(() => {
		void data.items; // refetch the filtered list after a change
		if (!isFiltering && sort === 'desire' && direction === 'desc') {
			filtered = null;
			return;
		}
		const query = new SvelteURLSearchParams({ sort, direction, desires: desires.join(',') });
		if (search.trim()) query.set('search', search.trim());
		for (const name of selectedArtists) query.append('artist', name);
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
		selectedArtists = [];
		desires = [];
	}

	let selectedId = $state<number | null>(null);
	const selected = $derived<Row | null>(data.items.find((row) => row.id === selectedId) ?? null);
	let anchor = $state<HTMLElement | null>(null);
	let open = $state(false);
	let gotItOpen = $state(false);
	let editOpen = $state(false);
	let coverOpen = $state(false);
	let linksOpen = $state(false);

	let dropping = $state(false);
	let refreshing = $state(false);
	let refreshError = $state('');
	let settingDesire = $state<1 | 2 | 3 | null>(null);
	let selecting = $state(false);
	let checked = $state<number[]>([]);

	async function setDesire(ids: number[], desire: 1 | 2 | 3) {
		settingDesire = desire;
		const outcome = await postAction('?/setDesire', { ids, desire });
		settingDesire = null;
		return outcome.ok;
	}

	async function setChecked(desire: 1 | 2 | 3) {
		if (await setDesire(checked, desire)) checked = [];
	}

	function toggleSelecting() {
		selecting = !selecting;
		checked = [];
	}

	async function refreshPrices() {
		if (!selected) return;
		refreshing = true;
		refreshError = '';
		const outcome = await postAction('?/refreshPrices', { id: selected.id });
		refreshing = false;
		if (!outcome.ok) refreshError = outcome.error;
	}

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
			editOpen = false;
			coverOpen = false;
			linksOpen = false;
			selectedId = null;
		}
	});

	function select(item: Row, el: HTMLElement) {
		if (selecting) {
			checked = checked.includes(item.id)
				? checked.filter((id) => id !== item.id)
				: [...checked, item.id];
			return;
		}
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
		<LoginAction isOwner={data.isOwner} />
	{/snippet}
	{#snippet action()}
		{#if data.isOwner}
			<AddAction current="wishlist" artists={data.artists} stores={data.stores} />
			<Button onclick={toggleSelecting}>{selecting ? 'Done' : 'Select'}</Button>
			{#if selecting}
				<span class="text-sm font-extrabold">{checked.length} selected</span>
				{#if checked.length > 0}
					<DesirePicker busy={settingDesire} onPick={setChecked} />
				{/if}
			{/if}
		{/if}
	{/snippet}
	{#snippet controls()}
		<SearchField
			bind:value={search}
			label="Search artist or album"
			placeholder="Search artist or album"
		/>
		<ArtistFilter bind:value={selectedArtists} names={artistNames} />
		<Select bind:value={sort} label="Sort by" options={sorts} />
		<SortDirection bind:value={direction} />
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
						selected={selecting ? checked.includes(item.id) : undefined}
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
				class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[15px] [&_dd]:font-extrabold [&_dd]:[overflow-wrap:break-word]"
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
					{#if data.isOwner}
						<dt class="text-muted-foreground">Set to</dt>
						<dd>
							<DesirePicker
								value={selected.desire}
								busy={settingDesire}
								compact
								onPick={(level) => selected && setDesire([selected.id], level)}
							/>
						</dd>
					{/if}
				{/if}
			</dl>
			{#if selected && selected.priceQuotes.length > 0}
				<ul class="mt-4 flex flex-col gap-2" aria-label="Prices">
					{#each selected.priceQuotes as quote (quote.store.id)}
						<li class="flex items-center gap-3">
							<span class="flex min-w-0 flex-1 flex-col">
								<span class="font-extrabold [overflow-wrap:anywhere]">{quote.store.name}</span>
								{#if quote.foundAt}
									<span class="text-xs text-muted-foreground">
										Found {formatDate(quote.foundAt)}
									</span>
								{/if}
							</span>
							<span class="font-extrabold whitespace-nowrap">{formatCents(quote.priceCents)}</span>
							{#if quote.url}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external store page -->
								<UiButton
									variant="neutral"
									size="icon"
									href={quote.url}
									target="_blank"
									rel="noopener noreferrer"
									aria-label={`Open ${quote.store.name}`}
								>
									<ExternalLinkIcon class="size-4" />
								</UiButton>
							{:else}
								<span class="size-11 shrink-0" aria-hidden="true"></span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/snippet}
		{#snippet actions()}
			{#if data.isOwner}
				<div class="flex w-full gap-2">
					<Button
						intent="success"
						onclick={() => {
							open = false;
							gotItOpen = true;
						}}
					>
						Got it
					</Button>
					<Button intent="danger" loading={dropping} onclick={drop}>Drop</Button>
				</div>
				<Button
					onclick={() => {
						open = false;
						editOpen = true;
					}}
				>
					Edit
				</Button>
				<Button
					onclick={() => {
						open = false;
						coverOpen = true;
					}}
				>
					Change cover
				</Button>
				<Button loading={refreshing} onclick={refreshPrices}>Refresh prices</Button>
				<Button
					onclick={() => {
						open = false;
						linksOpen = true;
					}}
				>
					Product links
				</Button>
				{#if refreshError}
					<p class="text-sm font-extrabold text-destructive" role="alert">{refreshError}</p>
				{/if}
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
					variant={selected.variant}
					stores={data.stores}
					onDone={() => (gotItOpen = false)}
				/>
			{/if}
		{/snippet}
	</Popup>
{/if}

{#if data.isOwner && selected}
	<Popup bind:open={editOpen} album={`Edit ${selected.album.title}`}>
		{#snippet details()}
			{#if selected}
				<WishlistEditForm
					item={selected}
					artists={data.artists}
					onDone={() => (editOpen = false)}
				/>
			{/if}
		{/snippet}
	</Popup>
{/if}

{#if data.isOwner && selected}
	<Popup bind:open={linksOpen} album={`Links for ${selected.album.title}`}>
		{#snippet details()}
			{#if selected}
				<ProductLinks
					itemId={selected.id}
					links={selected.productLinks}
					stores={data.stores}
					onDone={() => {
						linksOpen = false;
						open = true;
					}}
				/>
			{/if}
		{/snippet}
	</Popup>
{/if}

{#if data.isOwner && selected}
	<Popup bind:open={coverOpen} album="Change cover" wide>
		{#snippet details()}
			{#if selected}
				<CoverPicker
					albumId={selected.album.id}
					query={`${selected.album.artist} ${selected.album.title}`}
					onBack={() => (coverOpen = false)}
					onDone={() => (coverOpen = false)}
				/>
			{/if}
		{/snippet}
	</Popup>
{/if}
