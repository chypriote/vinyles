<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageProps } from './$types';
	import type { WithCoverUrl } from '#lib/covers';
	import type { RecordView } from '#lib/server/catalog/types';
	import { formatCents, formatDate } from '#lib/format';
	import Button from '#lib/components/Button.svelte';
	import CoverPicker from '#lib/components/CoverPicker.svelte';
	import Chip from '#lib/components/Chip.svelte';
	import Cover from '#lib/components/Cover.svelte';
	import CoverGrid from '#lib/components/CoverGrid.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import AddAction from '#lib/components/AddAction.svelte';
	import LoginAction from '#lib/components/LoginAction.svelte';
	import Popup from '#lib/components/Popup.svelte';
	import RecordForm from '#lib/components/RecordForm.svelte';
	import SearchField from '#lib/components/SearchField.svelte';
	import Select from '#lib/components/Select.svelte';
	import StickyBar from '#lib/components/StickyBar.svelte';

	type Row = WithCoverUrl<RecordView>;

	let { data }: PageProps = $props();

	const sorts = [
		{ value: 'artist', label: 'Sort: artist' },
		{ value: 'album', label: 'Sort: album' },
		{ value: 'year', label: 'Sort: release year' },
		{ value: 'acquired', label: 'Sort: acquired' }
	];

	// Filters are page state, not in the URL. The Catalog applies them, through /api/records.
	let search = $state('');
	let artist = $state('');
	let sort = $state('acquired');
	let filtered = $state<Row[] | null>(null);

	const artistNames = $derived(
		[...new Set(data.records.map((r) => r.album.artist))].sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: 'base' })
		)
	);
	const artistOptions = $derived([
		{ value: '', label: `All artists (${artistNames.length})` },
		...artistNames.map((name) => ({ value: name, label: name }))
	]);
	const isFiltering = $derived(search.trim() !== '' || artist !== '');
	const records = $derived(filtered ?? data.records);

	$effect(() => {
		void data.records; // refetch the filtered list after a change
		if (!isFiltering && sort === 'acquired') {
			filtered = null;
			return;
		}
		const query = new SvelteURLSearchParams({ sort });
		if (search.trim()) query.set('search', search.trim());
		if (artist) query.set('artist', artist);
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(`/api/records?${query}`, { signal: controller.signal });
				if (response.ok) filtered = ((await response.json()) as { records: Row[] }).records;
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
	}

	let selectedId = $state<number | null>(null);
	const selected = $derived<Row | null>(data.records.find((row) => row.id === selectedId) ?? null);
	let anchor = $state<HTMLElement | null>(null);
	let open = $state(false);
	let editOpen = $state(false);
	let changingCover = $state(false);

	// The row can disappear after a change (deleted, got, dropped): close its Popups.
	$effect(() => {
		if (selectedId !== null && !selected) {
			open = false;
			editOpen = false;
			selectedId = null;
		}
	});

	function select(record: Row, el: HTMLElement) {
		selectedId = record.id;
		anchor = el;
		open = true;
	}
</script>

<svelte:head><title>Vinyles | Collection</title></svelte:head>

<StickyBar current="collection">
	{#snippet chips()}
		<Chip tone="highlight" label="records" value={String(data.totals.recordCount)} />
		<Chip tone="success" label="spent" value={formatCents(data.totals.totalSpentCents)} />
	{/snippet}
	{#snippet login()}
		{#if !data.isOwner}
			<LoginAction />
		{/if}
	{/snippet}
	{#snippet action()}
		{#if data.isOwner}
			<AddAction current="collection" artists={data.artists} stores={data.stores} />
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
	{/snippet}
</StickyBar>

<main>
	{#if data.records.length === 0}
		<EmptyState message="No records yet" />
	{:else if records.length === 0}
		<EmptyState message="No match">
			{#snippet action()}
				<Button onclick={clearFilters}>Clear filters</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<CoverGrid>
			{#each records as record (record.id)}
				<li>
					<Cover
						album={record.album.title}
						artist={record.album.artist}
						coverUrl={record.album.coverUrl}
						onSelect={(el) => select(record, el)}
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
				{#if selected?.acquisition.kind === 'purchase'}
					<dt class="text-muted-foreground">Acquired</dt>
					<dd>
						Purchase · <span class="whitespace-nowrap">
							{formatDate(selected.acquisition.date)}
						</span>
					</dd>
					<dt class="text-muted-foreground">Store</dt>
					<dd>{selected.acquisition.store.name}</dd>
					<dt class="text-muted-foreground">Price</dt>
					<dd>{formatCents(selected.acquisition.priceCents)}</dd>
				{:else if selected}
					<dt class="text-muted-foreground">Acquired</dt>
					<dd>
						Gift · <span class="whitespace-nowrap">{formatDate(selected.acquisition.date)}</span>
					</dd>
					{#if selected.acquisition.giver}
						<dt class="text-muted-foreground">From</dt>
						<dd>{selected.acquisition.giver}</dd>
					{/if}
				{/if}
			</dl>
		{/snippet}
		{#snippet actions()}
			{#if data.isOwner}
				<Button
					onclick={() => {
						open = false;
						editOpen = true;
					}}
				>
					Edit
				</Button>
			{/if}
		{/snippet}
	</Popup>
{/if}

{#if data.isOwner && selected}
	<Popup
		bind:open={editOpen}
		album="Edit record"
		wide={changingCover}
		onDismiss={() => (changingCover = false)}
	>
		{#snippet details()}
			{#if changingCover}
				<CoverPicker
					albumId={selected.album.id}
					query={`${selected.album.artist} ${selected.album.title}`}
					onBack={() => (changingCover = false)}
					onDone={() => {
						changingCover = false;
						editOpen = false;
					}}
				/>
			{:else}
				<RecordForm
					record={selected}
					artists={data.artists}
					stores={data.stores}
					onDone={() => (editOpen = false)}
					onChangeCover={() => (changingCover = true)}
				/>
			{/if}
		{/snippet}
	</Popup>
{/if}
