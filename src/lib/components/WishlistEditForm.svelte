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
	let alreadyOwned = $state(false);
	let busy = $state(false);
	let addingAnyway = $state(false);

	const listId = $props.id();

	async function save(addAnyway: boolean) {
		busy = true;
		addingAnyway = addAnyway;
		const outcome = await postAction('?/editWishlistItem', {
			id: item.id,
			artist,
			album,
			variant: variant.trim() || null,
			addAnyway
		});
		busy = false;
		if (!outcome.ok) error = outcome.error;
		else if (outcome.alreadyOwned) alreadyOwned = true;
		else onDone();
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		alreadyOwned = false;
		void save(false);
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
	{#if alreadyOwned}
		<div class="flex flex-col gap-2 rounded-xl bg-muted p-3" role="status">
			<p class="text-sm font-medium">Already owned</p>
			<div>
				<Button disabled={busy} loading={busy && addingAnyway} onclick={() => save(true)}>
					Save anyway
				</Button>
			</div>
		</div>
	{/if}
	{#if error}<p class="text-sm font-medium text-foreground" role="alert">! {error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<Button
			intent="success"
			type="submit"
			disabled={busy && addingAnyway}
			loading={busy && !addingAnyway}
		>
			Save
		</Button>
		<Button onclick={onDone}>Cancel</Button>
	</div>
</form>
