<script lang="ts">
	import type { AcquisitionState } from '#lib/forms';
	import Field from './Field.svelte';
	import StoreSelect from './StoreSelect.svelte';
	import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group/index.js';

	let {
		acquisition = $bindable(),
		stores,
		onAddStore
	}: {
		acquisition: AcquisitionState;
		stores: { id: number; name: string }[];
		onAddStore: (name: string) => Promise<{ id: number | string }>;
	} = $props();

	const labelId = $props.id();
</script>

<div class="flex flex-col gap-1.5">
	<span class="text-sm font-bold" id={labelId}>Acquisition</span>
	<div class="flex items-center gap-3">
		<ToggleGroup
			type="single"
			aria-labelledby={labelId}
			value={acquisition.kind}
			onValueChange={(v) => {
				if (v === 'purchase' || v === 'gift') acquisition.kind = v;
			}}
		>
			<ToggleGroupItem value="purchase">Purchase</ToggleGroupItem>
			<ToggleGroupItem value="gift">Gift</ToggleGroupItem>
		</ToggleGroup>
		{#if acquisition.kind === 'gift'}
			<div class="min-w-0 flex-1">
				<Field label="From" bind:value={acquisition.giver} />
			</div>
		{/if}
	</div>
</div>
{#if acquisition.kind === 'purchase'}
	<StoreSelect bind:value={acquisition.storeId} {stores} {onAddStore} />
	<Field label="Price (€)" type="number" required bind:value={acquisition.price} />
{/if}
