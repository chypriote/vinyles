<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { CoverCandidate } from '#lib/server/catalog/types';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { Button as IconButton } from './ui/button/index.js';
	import { Input } from './ui/input/index.js';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import LinkIcon from '@lucide/svelte/icons/link';
	import SpinnerIcon from '@lucide/svelte/icons/loader-circle';
	import { tick, untrack } from 'svelte';

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
	/** The quality check of each candidate: its failure reason, null when it passes. Missing until rated. */
	let ratings = $state<Record<string, string | null>>({});
	const loading = $derived(candidates === null && !error);
	const key = (c: CoverCandidate) => c.source + c.id;
	// A candidate whose image does not load is left out.
	const shown = $derived((candidates ?? []).filter((c) => !failed.includes(key(c))));
	// The field starts from the prop and is then edited freely.
	let text = $state(untrack(() => query));
	// Drops the answer of an older request when a newer one was sent.
	let latest = 0;

	async function load(url: string) {
		const mine = ++latest;
		error = null;
		candidates = null;
		failed = [];
		ratings = {};
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

	const RATING_PARALLEL = 3;

	/** Rates the candidates a few at a time: each one is a request to the server. */
	async function rate(list: CoverCandidate[], mine: number) {
		const queue = [...list];
		const worker = async () => {
			for (let next = queue.shift(); next && mine === latest; next = queue.shift()) {
				try {
					const params = new URLSearchParams({ source: next.source, id: next.id });
					const response = await fetch(`/api/albums/${albumId}/cover-candidates/rating?${params}`);
					if (!response.ok) continue;
					const { reason } = (await response.json()) as { reason: string | null };
					if (mine === latest) ratings[key(next)] = reason;
				} catch {
					// The candidate stays unrated.
				}
			}
		};
		await Promise.all(Array.from({ length: RATING_PARALLEL }, worker));
	}

	$effect(() => {
		const list = candidates;
		if (list?.length) untrack(() => rate(list, latest));
	});

	// Candidates load only when the picker opens (it is mounted per opening).
	$effect(() => {
		load(`/api/albums/${albumId}/cover-candidates`);
	});

	function search(event: SubmitEvent) {
		event.preventDefault();
		if (text.trim()) load(`/api/albums/${albumId}/cover-candidates?q=${encodeURIComponent(text)}`);
	}

	let fileInput = $state<HTMLInputElement | null>(null);
	let uploading = $state(false);

	/** Scales the image down to 1000 px on its long side and re-encodes it as JPEG. */
	async function shrink(file: File): Promise<Blob> {
		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();
		const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
		if (!blob) throw new Error('shrink failed');
		return blob;
	}

	/** What the Owner is asked to confirm: a candidate or an uploaded image. */
	let preview = $state<{ url: string; label: string; source: string } | null>(null);
	let upload = $state<Blob | null>(null);
	let remoteUrl = $state<string | null>(null);
	let urlOpen = $state(false);
	let urlText = $state('');
	let urlInput = $state<HTMLInputElement | null>(null);

	async function toggleUrl() {
		urlOpen = !urlOpen;
		if (!urlOpen) return;
		await tick();
		urlInput?.focus();
	}

	function chooseUrl(event: SubmitEvent) {
		event.preventDefault();
		const address = urlText.trim();
		if (!/^https?:\/\//i.test(address)) {
			pickError = 'Use an http or https address';
			return;
		}
		pickError = null;
		picked = null;
		upload = null;
		remoteUrl = address;
		preview = { url: address, label: address, source: 'Web address' };
		confirmOpen = true;
	}

	async function chooseFile() {
		const file = fileInput?.files?.[0];
		if (!file) return;
		uploading = true;
		pickError = null;
		try {
			upload = await shrink(file);
			picked = null;
			remoteUrl = null;
			preview = { url: URL.createObjectURL(upload), label: file.name, source: 'Upload' };
			confirmOpen = true;
		} catch {
			pickError = 'Could not read this image';
		} finally {
			uploading = false;
			if (fileInput) fileInput.value = '';
		}
	}

	// MusicBrainz previews are 250 px; the confirm dialog wants the 500 px image.
	const largeUrl = (c: CoverCandidate) =>
		c.source === 'discogs' ? c.id : c.imageUrl.replace('front-250', 'front-500');

	function choose(candidate: CoverCandidate) {
		picked = candidate;
		upload = null;
		remoteUrl = null;
		preview = {
			url: largeUrl(candidate),
			label: candidate.title
				? `${candidate.artist} – ${candidate.title}${candidate.year ? ` (${candidate.year})` : ''}`
				: '',
			source: candidate.source === 'discogs' ? 'Discogs' : 'MusicBrainz'
		};
		confirmOpen = true;
	}

	// Frees the browser copy of an uploaded image once the dialog closes.
	$effect(() => {
		if (confirmOpen || !preview?.url.startsWith('blob:')) return;
		URL.revokeObjectURL(preview.url);
	});

	async function useCover() {
		if (!picked && !upload && !remoteUrl) return;
		confirmOpen = false;
		busy = true;
		try {
			const response = remoteUrl
				? await fetch(`/api/albums/${albumId}/cover-url`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ url: remoteUrl })
					})
				: upload
					? await fetch(`/api/albums/${albumId}/cover-upload`, {
							method: 'POST',
							headers: { 'content-type': upload.type },
							body: upload
						})
					: await fetch(`/api/albums/${albumId}/cover`, {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ candidateId: picked!.id, source: picked!.source })
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
	{#if busy}
		<!-- Covers the whole Popup (its content is the nearest positioned ancestor). -->
		<div
			role="status"
			aria-label="Saving the cover"
			class="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/70"
		>
			<SpinnerIcon class="size-10 text-primary motion-safe:animate-spin" />
		</div>
	{/if}
	<form class="flex gap-2" onsubmit={search}>
		<input
			bind:this={fileInput}
			type="file"
			accept="image/jpeg,image/png,image/webp"
			class="hidden"
			onchange={chooseFile}
		/>
		<IconButton
			variant="neutral"
			size="icon"
			aria-label="Upload a cover"
			loading={uploading}
			disabled={busy}
			onclick={() => fileInput?.click()}
		>
			<UploadIcon class="size-5" />
		</IconButton>
		<IconButton
			variant="neutral"
			size="icon"
			aria-label="Use an image address"
			aria-expanded={urlOpen}
			disabled={busy}
			onclick={toggleUrl}
		>
			<LinkIcon class="size-5" />
		</IconButton>
		<Input type="search" bind:value={text} aria-label="Search covers" class="flex-1" />
		<Button type="submit" disabled={!text.trim()} {loading}>Search</Button>
	</form>
	{#if urlOpen}
		<form class="flex gap-2" onsubmit={chooseUrl}>
			<Input
				type="url"
				bind:ref={urlInput}
				bind:value={urlText}
				aria-label="Image address"
				placeholder="https://…"
				class="flex-1"
			/>
			<Button type="submit" disabled={!urlText.trim()}>Preview</Button>
		</form>
	{/if}
	{#if pickError}
		<p role="alert" class="text-sm text-destructive">{pickError}</p>
	{/if}
	{#if error}
		<p role="alert" class="text-sm text-destructive">{error}</p>
	{:else if candidates === null}
		<ul class="grid grid-cols-4 gap-3" aria-busy="true" aria-label="Loading covers">
			{#each Array.from({ length: 8 }, (_, i) => i) as i (i)}
				<li class="aspect-square rounded-sm bg-muted motion-safe:animate-pulse"></li>
			{/each}
		</ul>
	{:else if shown.length === 0 && candidates.length === 0}
		<p class="text-sm text-muted-foreground">No cover found</p>
	{:else}
		<ul class="grid grid-cols-4 gap-3">
			{#each candidates as candidate (key(candidate))}
				<li class="min-w-0" hidden={failed.includes(key(candidate))}>
					<button
						type="button"
						class="flex w-full min-w-0 cursor-pointer flex-col gap-1 text-start outline-ring focus-visible:outline-3 focus-visible:outline-solid disabled:opacity-50"
						disabled={busy}
						onclick={() => choose(candidate)}
					>
						<img
							src={candidate.imageUrl}
							alt=""
							loading="lazy"
							onerror={() => (failed = [...failed, key(candidate)])}
							class="aspect-square w-full rounded-sm bg-muted object-cover shadow-(--shadow-raised)"
						/>
						{#if candidate.title}
							<span
								class="line-clamp-2 text-[11px] leading-tight font-bold break-words"
								title="{candidate.artist} – {candidate.title}"
							>
								{candidate.artist} – {candidate.title}{candidate.year ? ` (${candidate.year})` : ''}
							</span>
						{/if}
						<span class="block truncate text-[11px] leading-tight text-muted-foreground">
							{candidate.source === 'discogs' ? 'Discogs' : 'MusicBrainz'}
						</span>
						{#if key(candidate) in ratings}
							{@const reason = ratings[key(candidate)]}
							<span
								class="block truncate text-[11px] leading-tight {reason
									? 'text-destructive'
									: 'text-muted-foreground'}"
								title={reason ?? 'Passes the quality check'}
							>
								{reason ?? 'Good quality'}
							</span>
						{/if}
					</button>
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
>
	{#if preview}
		<figure class="flex flex-col items-center gap-1">
			<img
				src={preview.url}
				alt=""
				class="aspect-square w-full max-w-72 rounded-sm bg-muted object-cover shadow-(--shadow-raised)"
			/>
			<figcaption class="max-w-72 text-center text-sm">
				{#if preview.label}<span class="block font-bold break-words">{preview.label}</span>{/if}
				<span class="block text-xs text-muted-foreground">{preview.source}</span>
			</figcaption>
		</figure>
	{/if}
</ConfirmDialog>
