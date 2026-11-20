<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...restProps
	}: WithElementRef<HTMLInputAttributes> = $props();
</script>

<input
	bind:this={ref}
	data-slot="input"
	class={cn(
		'flex min-h-11 w-full min-w-0 rounded-control bg-card px-4 text-sm font-medium text-foreground shadow-(--shadow-raised) outline-ring placeholder:text-muted-foreground focus-visible:outline-3 focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:outline-3 aria-invalid:outline-destructive',
		className
	)}
	bind:value
	{...restProps}
/>
