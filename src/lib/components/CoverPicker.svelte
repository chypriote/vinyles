<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { CoverCandidate } from '#lib/server/catalog/types';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { Button as GridButton } from './ui/button/index.js';
	import { Input } from './ui/input/index.js';

	let {
		albumId,
		query,
		onBack,
		onDone
	}: {
		albumId: number;
		/** Prefill of the search field: "artist album". */
		query: string;
		onBack: () => void;
		onDone: () => void;
	} = $props();

	let candidates = $state<CoverCandidate[] | null>(null);
	let error = $state<string | null>(null);
	let pickError = $state<string | null>(null);
	let picked = $state<CoverCandidate | null>(null);
	let confirmOpen = $state(false);
	let busy = $state(false);
	let failed = $state<string[]>([]);
	const key = (c: CoverCandidate) => c.source + c.id;
	// A candidate whose image does not load is left out.
	const shown = $derived((candidates ?? []).filter((c) => !failed.includes(key(c))));
	let text = $state(query);
	// Drops the answer of an older request when a newer one was sent.
	let latest = 0;

	async function load(url: string) {
		const mine = ++latest;
		error = null;
		candidates = null;
		failed = [];
		try {
			const response = await fetch(url);
			const body = (await response.json()) as { candidates?: CoverCandidate[]; error?: string };
			if (mine !== latest) return;
			if (response.ok) candidates = body.candidates ?? [];
			else error = body.error ?? 'Could not load covers';
		} catch {
			if (mine === latest) error = 'Could not load covers';
		}
	}

	// Candidates load only when the picker opens (it is mounted per opening).
	$effect(() => {
		load(`/api/albums/${albumId}/cover-candidates`);
	});

	function search(event: SubmitEvent) {
		event.preventDefault();
		if (text.trim()) load(`/api/albums/${albumId}/cover-candidates?q=${encodeURIComponent(text)}`);
	}

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

<div class="flex min-w-0 flex-col gap-3">
	<form class="flex gap-2" onsubmit={search}>
		<Input type="search" bind:value={text} aria-label="Search covers" class="flex-1" />
		<Button type="submit" disabled={!text.trim() || (candidates === null && !error)}>Search</Button>
	</form>
	{#if pickError}
		<p role="alert" class="text-sm text-destructive">{pickError}</p>
	{/if}
	{#if error}
		<p role="alert" class="text-sm text-destructive">{error}</p>
	{:else if candidates === null}
		<p class="text-sm text-muted-foreground">Loading covers…</p>
	{:else if shown.length === 0 && candidates.length === 0}
		<p class="text-sm text-muted-foreground">No cover found</p>
	{:else}
		<ul class="grid grid-cols-3 gap-2">
			{#each candidates as candidate (key(candidate))}
				<li class="min-w-0" hidden={failed.includes(key(candidate))}>
					<GridButton
						variant="neutral"
						class="h-auto w-full min-w-0 flex-col items-stretch gap-1 overflow-hidden p-1 whitespace-normal"
						disabled={busy}
						loading={busy && picked?.id === candidate.id}
						onclick={() => choose(candidate)}
					>
						<img
							src={candidate.imageUrl}
							alt=""
							loading="lazy"
							onerror={() => (failed = [...failed, key(candidate)])}
							class="aspect-square w-full rounded-(--cover-radius) object-cover"
						/>
						{#if candidate.title}
							<span
								class="block truncate text-[11px] leading-tight"
								title="{candidate.artist} – {candidate.title}"
							>
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
