<script lang="ts">
	import type { Snippet } from 'svelte';
	import Tabs from './Tabs.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	let {
		current,
		chips,
		login,
		action,
		controls
	}: {
		current: 'collection' | 'wishlist';
		chips?: Snippet;
		/** Lock button (Viewer), in the title row. */
		login?: Snippet;
		/** Add button (Owner), next to the tabs. */
		action?: Snippet;
		/** SearchField, Selects, DesireFilter. */
		controls?: Snippet;
	} = $props();
</script>

<header
	class="sticky top-0 z-(--layer-sticky) flex flex-col gap-3 bg-background pt-[max(0.75rem,env(safe-area-inset-top))] pe-[max(1rem,env(safe-area-inset-right))] pb-3 ps-[max(1rem,env(safe-area-inset-left))]"
>
	<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
		<h1>Vinyles<span class="text-icon-accent">.</span></h1>
		<div class="flex flex-wrap items-center gap-2">
			{@render chips?.()}
			{@render login?.()}
			<ThemeToggle />
		</div>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<Tabs {current} />
		{@render action?.()}
	</div>
	<div class="flex flex-wrap items-center gap-2">
		{@render controls?.()}
	</div>
</header>
