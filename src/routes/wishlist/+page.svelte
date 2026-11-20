<script lang="ts">
	import type { WishlistItemView } from '#lib/server/catalog/types.ts';
	import Chip from '#lib/components/Chip.svelte';
	import Cover from '#lib/components/Cover.svelte';
	import CoverGrid from '#lib/components/CoverGrid.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import StickyBar from '#lib/components/StickyBar.svelte';

	// `items` comes from the load function (next slice).
	let { data }: { data: { items: WishlistItemView[] } } = $props();
	const items = $derived(data.items);
</script>

<svelte:head><title>Wishlist</title></svelte:head>

<StickyBar title="Wishlist" current="wishlist">
	{#snippet chips()}
		<Chip tone="info" label="items" value={String(items.length)} />
	{/snippet}
</StickyBar>

<main>
	{#if items.length === 0}
		<EmptyState message="Nothing on the wishlist" />
	{:else}
		<CoverGrid>
			{#each items as item (item.id)}
				<li>
					<Cover album={item.album.title} artist={item.album.artist} desire={item.desire} />
				</li>
			{/each}
		</CoverGrid>
	{/if}
</main>
