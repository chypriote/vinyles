<script lang="ts">
	import { addStore, postAction } from '#lib/forms';
	import { eurosToCents } from '#lib/money';
	import type { AddWishlistItemInput, Desire } from '#lib/server/catalog/types';
	import Button from './Button.svelte';
	import DesireDots from './DesireDots.svelte';
	import Field from './Field.svelte';
	import StoreSelect from './StoreSelect.svelte';
	import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group/index.js';

	let {
		artists,
		stores,
		onDone
	}: {
		artists: { id: number; name: string }[];
		stores: { id: number; name: string }[];
		onDone: () => void;
	} = $props();

	let artist = $state('');
	let album = $state('');
	let variant = $state('');
	let desire = $state<Desire>(2);
	let quotes = $state<{ key: number; storeId: string; price: string }[]>([]);
	let nextKey = 0;
	let error = $state<string | null>(null);
	let alreadyOwned = $state(false);
	let busy = $state(false);
	let addingAnyway = $state(false);

	const listId = $props.id();
	const desireLabelId = `${listId}-desire`;

	function buildInput(addAnyway: boolean): AddWishlistItemInput | string {
		const priceQuotes = [];
		for (const q of quotes) {
			const priceCents = eurosToCents(q.price);
			const storeId = Number(q.storeId);
			if (!q.storeId || !Number.isInteger(storeId)) return 'Pick a store for each quote';
			if (priceCents === null) return 'Each quote needs a price in euros';
			priceQuotes.push({ storeId, priceCents });
		}
		return { artist, album, variant: variant.trim() || null, desire, priceQuotes, addAnyway };
	}

	async function save(addAnyway: boolean) {
		const input = buildInput(addAnyway);
		if (typeof input === 'string') {
			error = input;
			return;
		}
		busy = true;
		addingAnyway = addAnyway;
		const outcome = await postAction('?/addWishlistItem', input);
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
	<div class="flex flex-col gap-1.5">
		<span class="text-sm font-bold" id={desireLabelId}>Desire</span>
		<ToggleGroup
			type="single"
			aria-labelledby={desireLabelId}
			value={String(desire)}
			onValueChange={(v) => {
				if (v === '1' || v === '2' || v === '3') desire = Number(v) as Desire;
			}}
		>
			{#each [3, 2, 1] as level (level)}
				<ToggleGroupItem value={String(level)}>
					<DesireDots value={level as Desire} />
				</ToggleGroupItem>
			{/each}
		</ToggleGroup>
	</div>
	<div class="flex flex-col gap-3">
		<span class="text-sm font-bold">Price quotes</span>
		{#each quotes as quote, i (quote.key)}
			<div class="flex flex-wrap items-end gap-2">
				<StoreSelect bind:value={quote.storeId} {stores} onAddStore={addStore} />
				<Field label="Price (€)" type="number" bind:value={quote.price} />
				<Button onclick={() => (quotes = quotes.filter((_, j) => j !== i))}>Remove</Button>
			</div>
		{/each}
		<div>
			<Button onclick={() => (quotes = [...quotes, { key: nextKey++, storeId: '', price: '' }])}>
				Add a quote
			</Button>
		</div>
	</div>
	{#if alreadyOwned}
		<div class="flex flex-col gap-2 rounded-xl bg-muted p-3" role="status">
			<p class="text-sm font-medium">Already owned</p>
			<div>
				<Button disabled={busy} loading={busy && addingAnyway} onclick={() => save(true)}>
					Add anyway
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
