<script lang="ts">
	import type { Snippet } from 'svelte';
	import Tabs from './Tabs.svelte';

	let {
		title,
		current,
		chips,
		action,
		controls
	}: {
		title: string;
		current: 'collection' | 'wishlist';
		chips?: Snippet;
		/** Lock button (Viewer) or Add button (Owner). */
		action?: Snippet;
		/** SearchField, Selects, DesireFilter. */
		controls?: Snippet;
	} = $props();
</script>

<header
	class="sticky top-0 z-(--layer-sticky) flex flex-col gap-3 bg-background pt-[max(0.75rem,env(safe-area-inset-top))] pe-[max(1rem,env(safe-area-inset-right))] pb-3 ps-[max(1rem,env(safe-area-inset-left))]"
>
	<div class="flex flex-wrap items-center gap-2">
		<h1>{title}</h1>
		{@render chips?.()}
		{@render action?.()}
	</div>
	<Tabs {current} />
	<div class="flex flex-wrap items-center gap-2">
		{@render controls?.()}
	</div>
</header>
