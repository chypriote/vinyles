<script lang="ts">
	import { addStore, postAction } from '#lib/forms';
	import { centsToEuros, eurosToCents } from '#lib/money';
	import type { PriceQuote, ProductLink } from '#lib/server/catalog/types';
	import Button from './Button.svelte';
	import Field from './Field.svelte';
	import StoreSelect from './StoreSelect.svelte';

	let {
		itemId,
		links,
		quotes,
		stores,
		onDone
	}: {
		itemId: number;
		links: ProductLink[];
		quotes: PriceQuote[];
		stores: { id: number; name: string; productLinksEnabled: boolean }[];
		onDone: () => void;
	} = $props();

	const offered = $derived(stores.filter((s) => s.productLinksEnabled));

	let storeId = $state('');
	let url = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);
	let removing = $state<number | null>(null);
	let saving = $state<number | null>(null);
	// What the Owner typed, by Store. Missing: the field shows the Owner's saved price.
	let typed = $state<Record<number, string>>({});

	/** The price field of a Store: the Owner's own price, not one the Refresh read. */
	function price(storeId: number): string {
		if (storeId in typed) return typed[storeId];
		const quote = quotes.find((q) => q.store.id === storeId && !q.url);
		return quote ? centsToEuros(quote.priceCents) : '';
	}

	async function savePrice(storeId: number) {
		const text = price(storeId).trim();
		const priceCents = text === '' ? null : eurosToCents(text);
		if (text !== '' && priceCents === null) {
			error = 'Type the price in euros, like 12,50';
			return;
		}
		saving = storeId;
		error = null;
		const outcome = await postAction('?/setManualPrice', {
			wishlistItemId: itemId,
			storeId,
			priceCents
		});
		saving = null;
		if (outcome.ok) delete typed[storeId];
		else error = outcome.error;
	}

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
				<li class="flex flex-col gap-2 text-[15px]">
					<div class="flex items-center justify-between gap-2">
						<span class="font-extrabold [overflow-wrap:anywhere]">{link.store.name}</span>
						<Button loading={removing === link.store.id} onclick={() => remove(link.store.id)}>
							Remove
						</Button>
					</div>
					<div class="flex items-end gap-2">
						<Field
							label="Price (€), if it could not be read"
							bind:value={() => price(link.store.id), (v) => (typed[link.store.id] = v)}
						/>
						<Button loading={saving === link.store.id} onclick={() => savePrice(link.store.id)}>
							Save price
						</Button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
	<form class="flex flex-col gap-4" onsubmit={save}>
		<StoreSelect bind:value={storeId} stores={offered} onAddStore={addStore} />
		<Field label="Product page address" required bind:value={url} />
		{#if error}<p class="text-sm font-medium text-foreground" role="alert">! {error}</p>{/if}
		<div class="flex flex-wrap gap-2">
			<Button intent="success" type="submit" loading={busy}>Save and refresh</Button>
			<Button onclick={onDone}>Back</Button>
		</div>
	</form>
</div>
