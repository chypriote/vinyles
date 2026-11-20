<script lang="ts">
	import { addStore, postAction } from '#lib/forms';
	import type { ProductLink } from '#lib/server/catalog/types';
	import Button from './Button.svelte';
	import Field from './Field.svelte';
	import StoreSelect from './StoreSelect.svelte';

	let {
		itemId,
		links,
		stores,
		onDone
	}: {
		itemId: number;
		links: ProductLink[];
		stores: { id: number; name: string }[];
		onDone: () => void;
	} = $props();

	let storeId = $state('');
	let url = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);
	let removing = $state<number | null>(null);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!storeId) {
			error = 'Pick a store';
			return;
		}
		busy = true;
		error = null;
		const saved = await postAction('?/setProductLink', {
			wishlistItemId: itemId,
			storeId: Number(storeId),
			url
		});
		const outcome = saved.ok ? await postAction('?/refreshPrices', { id: itemId }) : saved;
		busy = false;
		if (outcome.ok) {
			storeId = '';
			url = '';
		} else error = outcome.error;
	}

	async function remove(id: number) {
		removing = id;
		const outcome = await postAction('?/removeProductLink', {
			wishlistItemId: itemId,
			storeId: id
		});
		removing = null;
		if (!outcome.ok) error = outcome.error;
	}
</script>

<div class="flex flex-col gap-4">
	{#if links.length}
		<ul class="flex flex-col gap-2">
			{#each links as link (link.store.id)}
				<li class="flex items-center justify-between gap-2 text-[15px]">
					<span class="font-extrabold [overflow-wrap:anywhere]">{link.store.name}</span>
					<Button loading={removing === link.store.id} onclick={() => remove(link.store.id)}>
						Remove
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
	<form class="flex flex-col gap-4" onsubmit={save}>
		<StoreSelect bind:value={storeId} {stores} onAddStore={addStore} />
		<Field label="Product page address" required bind:value={url} />
		{#if error}<p class="text-sm font-medium text-foreground" role="alert">! {error}</p>{/if}
		<div class="flex flex-wrap gap-2">
			<Button intent="success" type="submit" loading={busy}>Save and refresh</Button>
			<Button onclick={onDone}>Back</Button>
		</div>
	</form>
</div>
