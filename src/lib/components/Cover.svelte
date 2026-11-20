<script lang="ts">
	import { initials, tileClass } from '#lib/tile';
	import DesireDots from './DesireDots.svelte';

	let {
		album,
		artist,
		coverUrl = null,
		desire,
		onSelect
	}: {
		album: string;
		artist: string;
		coverUrl?: string | null;
		desire?: 1 | 2 | 3;
		onSelect?: (el: HTMLElement) => void;
	} = $props();

	let failed = $state(false);
	let img = $state<HTMLImageElement | null>(null);
	const showImage = $derived(!!coverUrl && !failed);

	// An image can fail before hydration, so the error event is already gone.
	$effect(() => {
		if (img && img.complete && img.naturalWidth === 0) failed = true;
	});
</script>

<button
	type="button"
	class="group flex min-h-11 w-full cursor-pointer flex-col gap-1 rounded-(--cover-radius) text-start outline-ring focus-visible:outline-3 focus-visible:outline-solid"
	onclick={(e) => onSelect?.(e.currentTarget)}
>
	<span
		class="block aspect-square w-full overflow-hidden rounded-(--cover-radius) shadow-(--shadow-raised) motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:group-hover:-translate-y-[3px] motion-safe:group-hover:-rotate-[1.5deg] motion-safe:group-focus-visible:-translate-y-[3px] motion-safe:group-focus-visible:-rotate-[1.5deg]"
	>
		{#if showImage}
			<img
				bind:this={img}
				src={coverUrl}
				alt=""
				loading="lazy"
				class="size-full object-cover"
				onerror={() => (failed = true)}
			/>
		{:else}
			<span
				class="flex size-full items-center justify-center text-2xl font-extrabold text-primary-foreground {tileClass(
					artist
				)}"
				aria-hidden="true"
			>
				{initials(artist)}
			</span>
		{/if}
	</span>
	<span class="block text-xs leading-tight font-extrabold break-words text-foreground">
		{album}
	</span>
	<span class="block text-[11px] leading-tight font-medium break-words text-muted-foreground">
		{artist}
	</span>
	{#if desire}
		<DesireDots value={desire} />
	{/if}
</button>
