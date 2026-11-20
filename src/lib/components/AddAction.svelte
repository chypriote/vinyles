<script lang="ts">
	import Button from './Button.svelte';
	import Popup from './Popup.svelte';
	import RecordForm from './RecordForm.svelte';
	import WishlistItemForm from './WishlistItemForm.svelte';

	let {
		current,
		artists = [],
		stores = []
	}: {
		current: 'collection' | 'wishlist';
		artists?: { id: number; name: string }[];
		stores?: { id: number; name: string }[];
	} = $props();

	let addOpen = $state(false);
</script>

<Button intent="success" onclick={() => (addOpen = true)}>Add</Button>

<Popup bind:open={addOpen} album={current === 'wishlist' ? 'Add to wishlist' : 'Add a record'}>
	{#snippet details()}
		{#if current === 'wishlist'}
			<WishlistItemForm {artists} {stores} onDone={() => (addOpen = false)} />
		{:else}
			<RecordForm {artists} {stores} onDone={() => (addOpen = false)} />
		{/if}
	{/snippet}
</Popup>
