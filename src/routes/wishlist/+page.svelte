<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageProps } from './$types';
	import type { WithCoverUrl } from '#lib/covers';
	import type { Desire, PriceQuote, Store, WishlistItemView } from '#lib/server/catalog/types';
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
	import DesireSelect from '#lib/components/DesireSelect.svelte';
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
	let desires = $state<Desire[]>([]);
	let filtered = $state<Row[] | null>(null);

	const artistNames = $derived(
		[...new Set(data.items.map((i) => i.album.artist))].sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: 'base' })
		)
	);
	const isFiltering = $derived(
		search.trim() !== '' || selectedArtists.length > 0 || desires.length > 0
	);
	// Items of the same desire show in random order, fixed until the page reloads.
	const tieOrder: Record<number, number> = {};
	const randomOrder = (id: number) => (tieOrder[id] ??= Math.random());
	const items = $derived.by(() => {
		const rows = filtered ?? data.items;
		if (sort !== 'desire') return rows;
		const sign = direction === 'asc' ? 1 : -1;
		return [...rows].sort(
			(a, b) => sign * (a.desire - b.desire) || randomOrder(a.id) - randomOrder(b.id)
		);
	});

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
	/** One row per Store with a price or a Product Link. A Store with only a link shows no price. */
	const storeRows = $derived.by(() => {
		if (!selected) return [];
		const rows: { store: Store; url?: string; quote?: PriceQuote }[] = selected.productLinks.map(
			(link) => ({
				store: link.store,
				url: link.url,
				quote: selected!.priceQuotes.find((q) => q.store.id === link.store.id)
			})
		);
		for (const quote of selected.priceQuotes)
			if (!rows.some((r) => r.store.id === quote.store.id))
				rows.push({ store: quote.store, url: quote.url, quote });
		return rows.sort((a, b) => a.store.name.localeCompare(b.store.name));
	});
	let anchor = $state<HTMLElement | null>(null);
	let open = $state(false);
	let gotItOpen = $state(false);
	let editOpen = $state(false);
	let coverOpen = $state(false);
	let linksOpen = $state(false);

	let discarding = $state(false);
	let refreshing = $state(false);
	let refreshError = $state('');
	let settingDesire = $state(false);
	let selecting = $state(false);
	let checked = $state<number[]>([]);

	async function setDesire(ids: number[], desire: Desire) {
		settingDesire = true;
		const outcome = await postAction('?/setDesire', { ids, desire });
		settingDesire = false;
		return outcome.ok;
	}

	async function setChecked(desire: Desire | null) {
		if (!desire) return;
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

	async function discard() {
		if (!selected) return;
		discarding = true;
		const outcome = await postAction('?/discard', { id: selected.id });
		discarding = false;
		if (outcome.ok) open = false;
	}

	// The row can disappear after a change (deleted, got, discarded): close its Popups.
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

<StickyBar
	current="wishlist"
	searchActive={search.trim() !== ''}
	filtersActive={selectedArtists.length > 0 || desires.length > 0}
>
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
					<DesireSelect
						label="Set desire of selected"
						placeholder="Set desire…"
						disabled={settingDesire}
						onPick={setChecked}
					/>
				{/if}
			{/if}
		{/if}
	{/snippet}
	{#snippet searchBox()}
		<SearchField
			bind:value={search}
			label="Search artist or album"
			placeholder="Search artist or album"
		/>
	{/snippet}
	{#snippet controls()}
		<ArtistFilter bind:value={selectedArtists} names={artistNames} />
		<Select bind:value={sort} label="Sort by" options={sorts} />
		<SortDirection bind:value={direction} />
		<DesireSelect
			label="Filter by desire"
			placeholder="Any desire"
			value={desires[0] ?? null}
			onPick={(level) => (desires = level ? [level] : [])}
		/>
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
							{selected.desire}/5
						</span>
					</dd>
					{#if data.isOwner}
						<dt class="text-muted-foreground">Set to</dt>
						<dd>
							<DesireSelect
								label="Set desire"
								value={selected.desire}
								disabled={settingDesire}
								onPick={(level) => level && selected && setDesire([selected.id], level)}
							/>
						</dd>
					{/if}
				{/if}
			</dl>
		{/snippet}
		{#snippet below()}
			{#if selected}
				<p class="text-xs text-muted-foreground">
					{selected.refreshedAt
						? `Prices checked ${formatDate(selected.refreshedAt)}`
						: 'Prices never checked'}
				</p>
			{/if}
			{#if selected && storeRows.length > 0}
				<ul class="flex flex-col gap-2" aria-label="Prices">
					{#each storeRows as row (row.store.id)}
						<li class="flex items-center gap-3">
							<span class="flex min-w-0 flex-1 flex-col">
								<span class="font-extrabold [overflow-wrap:anywhere]">{row.store.name}</span>
								{#if row.quote?.foundAt}
									<span class="text-xs text-muted-foreground">
										Found {formatDate(row.quote.foundAt)}
									</span>
								{/if}
							</span>
							{#if row.quote}
								<span class="font-extrabold whitespace-nowrap {row.quote.url ? '' : 'italic'}">
									{formatCents(row.quote.priceCents)}
								</span>
							{:else}
								<span class="text-sm whitespace-nowrap text-muted-foreground">No price</span>
							{/if}
							{#if row.url}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external store page -->
								<UiButton
									variant="neutral"
									size="icon"
									href={row.url}
									target="_blank"
									rel="noopener noreferrer"
									aria-label={`Open ${row.store.name}`}
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
					<Button intent="danger" loading={discarding} onclick={discard}>Discard</Button>
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
					quotes={selected.priceQuotes}
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
