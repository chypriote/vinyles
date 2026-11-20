<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { CoverCandidate } from '#lib/server/catalog/types';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { Button as GridButton } from './ui/button/index.js';

	let {
		albumId,
		onBack,
		onDone
	}: {
		albumId: number;
		onBack: () => void;
		onDone: () => void;
	} = $props();

	let candidates = $state<CoverCandidate[] | null>(null);
	let error = $state<string | null>(null);
	let pickError = $state<string | null>(null);
	let picked = $state<CoverCandidate | null>(null);
	let confirmOpen = $state(false);
	let busy = $state(false);

	// Candidates load only when the picker opens (it is mounted per opening).
	$effect(() => {
		fetch(`/api/albums/${albumId}/cover-candidates`)
			.then(async (response) => {
				const body = (await response.json()) as { candidates?: CoverCandidate[]; error?: string };
				if (response.ok) candidates = body.candidates ?? [];
				else error = body.error ?? 'Could not load covers';
			})
			.catch(() => (error = 'Could not load covers'));
	});

	function choose(candidate: CoverCandidate) {
		picked = candidate;
		confirmOpen = true;
	}

	async function useCover() {
		if (!picked) return;
		busy = true;
		try {
			const response = await fetch(`/api/albums/${albumId}/cover`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ candidateId: picked.id, source: picked.source })
			});
			if (response.ok) {
				await invalidateAll();
				onDone();
			} else {
				pickError =
					((await response.json()) as { error?: string }).error ?? 'Could not change the cover';
			}
		} catch {
			pickError = 'Could not change the cover';
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex flex-col gap-3">
	{#if pickError}
		<p role="alert" class="text-sm text-destructive">{pickError}</p>
	{/if}
	{#if error}
		<p role="alert" class="text-sm text-destructive">{error}</p>
	{:else if candidates === null}
		<p class="text-sm text-muted-foreground">Loading covers…</p>
	{:else if candidates.length === 0}
		<p class="text-sm text-muted-foreground">No cover found</p>
	{:else}
		<ul class="grid grid-cols-3 gap-2">
			{#each candidates as candidate (candidate.source + candidate.id)}
				<li>
					<GridButton
						variant="neutral"
						class="h-auto w-full flex-col items-stretch gap-1 p-1"
						disabled={busy}
						loading={busy && picked?.id === candidate.id}
						onclick={() => choose(candidate)}
					>
						<img
							src={candidate.imageUrl}
							alt={candidate.title ?? 'Cover candidate'}
							loading="lazy"
							class="aspect-square w-full rounded-(--cover-radius) object-cover"
						/>
						{#if candidate.title}
							<span class="text-[11px] leading-tight break-words">
								{candidate.artist} – {candidate.title}{candidate.year ? ` (${candidate.year})` : ''}
							</span>
						{/if}
					</GridButton>
				</li>
			{/each}
		</ul>
	{/if}
	<Button onclick={onBack}>Back</Button>
</div>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Use this cover?"
	text="It replaces the cover of every record and wishlist item of this album."
	actionLabel="Use this cover"
	onConfirm={useCover}
/>
