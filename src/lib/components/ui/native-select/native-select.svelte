<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import { cn } from '#lib/utils';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		children,
		...restProps
	}: HTMLSelectAttributes & { ref?: HTMLSelectElement | null } = $props();
</script>

<div class="relative inline-flex w-fit" data-slot="native-select-wrapper">
	<select
		bind:this={ref}
		bind:value
		data-slot="native-select"
		class={cn(
			'min-h-11 w-full min-w-0 cursor-pointer appearance-none rounded-control bg-card py-0 ps-4 pe-10 text-sm font-medium text-foreground shadow-(--shadow-raised) outline-ring focus-visible:outline-3 focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</select>
	<svg
		aria-hidden="true"
		class="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="3"
		stroke-linecap="round"
		stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg
	>
</div>
