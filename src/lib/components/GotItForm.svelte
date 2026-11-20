<script lang="ts">
	import { addStore, emptyAcquisition, postAction, toAcquisitionInput } from '#lib/forms';
	import AcquisitionFields from './AcquisitionFields.svelte';
	import Button from './Button.svelte';

	let {
		wishlistItemId,
		stores,
		onDone
	}: { wishlistItemId: number; stores: { id: number; name: string }[]; onDone: () => void } = $props();

	let acquisition = $state(emptyAcquisition());
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const input = toAcquisitionInput(acquisition);
		if (typeof input === 'string') {
			error = input;
			return;
		}
		busy = true;
		const outcome = await postAction('?/gotIt', { wishlistItemId, acquisition: input });
		busy = false;
		if (outcome.ok) onDone();
		else error = outcome.error;
	}
</script>

<form class="flex flex-col gap-4" onsubmit={submit}>
	<AcquisitionFields bind:acquisition {stores} onAddStore={addStore} />
	{#if error}<p class="text-sm font-medium text-foreground" role="alert">! {error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<Button intent="success" type="submit" disabled={busy}>Save</Button>
		<Button onclick={onDone}>Cancel</Button>
	</div>
</form>
