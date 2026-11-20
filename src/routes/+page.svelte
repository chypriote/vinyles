<script lang="ts">
	import type { RecordView } from '#lib/server/catalog/types.ts';
	import Chip from '#lib/components/Chip.svelte';
	import Cover from '#lib/components/Cover.svelte';
	import CoverGrid from '#lib/components/CoverGrid.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import StickyBar from '#lib/components/StickyBar.svelte';

	// `records` comes from the load function (next slice).
	let { data }: { data: { records: RecordView[] } } = $props();
	const records = $derived(data.records);
</script>

<svelte:head><title>Collection</title></svelte:head>

<StickyBar title="Collection" current="collection">
	{#snippet chips()}
		<Chip tone="highlight" label="records" value={String(records.length)} />
	{/snippet}
</StickyBar>

<main>
	{#if records.length === 0}
		<EmptyState message="No records yet" />
	{:else}
		<CoverGrid>
			{#each records as record (record.id)}
				<li>
					<Cover album={record.album.title} artist={record.album.artist} />
				</li>
			{/each}
		</CoverGrid>
	{/if}
</main>
