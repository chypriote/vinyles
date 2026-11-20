<script lang="ts">
	import { postAction } from '#lib/forms';
	import type { WishlistItemView } from '#lib/server/catalog/types';
	import Button from './Button.svelte';
	import Field from './Field.svelte';

	let {
		item,
		artists,
		onDone
	}: {
		item: Pick<WishlistItemView, 'id' | 'variant'> & { album: { artist: string; title: string } };
		artists: { id: number; name: string }[];
		onDone: () => void;
	} = $props();

	// The form is mounted per opening, so the starting values are read once.
	/* svelte-ignore state_referenced_locally */
	let artist = $state(item.album.artist);
	/* svelte-ignore state_referenced_locally */
	let album = $state(item.album.title);
	/* svelte-ignore state_referenced_locally */
	let variant = $state(item.variant ?? '');
	let error = $state<string | null>(null);
	let busy = $state(false);

	const listId = $props.id();

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const outcome = await postAction('?/editWishlistItem', {
			id: item.id,
			artist,
			album,
			variant: variant.trim() || null
		});
		busy = false;
		if (outcome.ok) onDone();
		else error = outcome.error;
	}
</script>

<form class="flex flex-col gap-4" onsubmit={submit}>
	<div>
		<Field label="Artist" required bind:value={artist} list={listId} />
		<datalist id={listId}>
			{#each artists as a (a.id)}<option value={a.name}></option>{/each}
		</datalist>
	</div>
	<Field label="Album" required bind:value={album} />
	<Field label="Variant" bind:value={variant} />
	{#if error}<p class="text-sm font-medium text-foreground" role="alert">! {error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<Button intent="success" type="submit" loading={busy}>Save</Button>
		<Button onclick={onDone}>Cancel</Button>
	</div>
</form>
