<script lang="ts">
	import {
		addStore,
		emptyAcquisition,
		postAction,
		toAcquisitionInput,
		type AcquisitionState
	} from '#lib/forms';
	import { centsToEuros } from '#lib/money';
	import type { RecordView } from '#lib/server/catalog/types';
	import AcquisitionFields from './AcquisitionFields.svelte';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import Field from './Field.svelte';

	type EditableRecord = Pick<RecordView, 'id' | 'variant' | 'acquisition'> & {
		album: { artist: string; title: string };
	};

	let {
		record = null,
		artists,
		stores,
		onDone
	}: {
		/** Set to edit this Record: the form is prefilled and gets "Delete record". */
		record?: EditableRecord | null;
		artists: { id: number; name: string }[];
		stores: { id: number; name: string }[];
		onDone: () => void;
	} = $props();

	function startingAcquisition(): AcquisitionState {
		const a = record?.acquisition;
		if (!a) return emptyAcquisition();
		return a.kind === 'purchase'
			? {
					kind: 'purchase',
					date: a.date,
					storeId: String(a.store.id),
					price: centsToEuros(a.priceCents),
					giver: ''
				}
			: { ...emptyAcquisition(), kind: 'gift', date: a.date, giver: a.giver ?? '' };
	}

	// The form is mounted per opening, so the starting values are read once.
	/* svelte-ignore state_referenced_locally */
	let artist = $state(record?.album.artist ?? '');
	/* svelte-ignore state_referenced_locally */
	let album = $state(record?.album.title ?? '');
	/* svelte-ignore state_referenced_locally */
	let variant = $state(record?.variant ?? '');
	let acquisition = $state(startingAcquisition());
	let error = $state<string | null>(null);
	let busy = $state(false);
	let confirmOpen = $state(false);

	const listId = $props.id();

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const input = toAcquisitionInput(acquisition);
		if (typeof input === 'string') {
			error = input;
			return;
		}
		busy = true;
		const body = { artist, album, variant: variant.trim() || null, acquisition: input };
		const outcome = record
			? await postAction('?/editRecord', { id: record.id, ...body })
			: await postAction('?/addRecord', body);
		busy = false;
		if (outcome.ok) onDone();
		else error = outcome.error;
	}

	async function remove() {
		if (!record) return;
		busy = true;
		const outcome = await postAction('?/deleteRecord', { id: record.id });
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
	<AcquisitionFields bind:acquisition {stores} onAddStore={addStore} />
	{#if error}<p class="text-sm font-medium text-foreground" role="alert">! {error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<Button intent="success" type="submit" disabled={busy}>Save</Button>
		<Button onclick={onDone}>Cancel</Button>
		{#if record}
			<Button disabled={busy} onclick={() => (confirmOpen = true)}>Delete record</Button>
		{/if}
	</div>
</form>

{#if record}
	<ConfirmDialog
		bind:open={confirmOpen}
		title={`Delete ${record.album.title}?`}
		text="This removes the record from your collection."
		actionLabel="Delete"
		onConfirm={remove}
	/>
{/if}
