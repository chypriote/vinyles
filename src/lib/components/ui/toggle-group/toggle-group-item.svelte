<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: ToggleGroupPrimitive.ItemProps = $props();
</script>

<ToggleGroupPrimitive.Item
	bind:ref
	data-slot="toggle-group-item"
	class={cn(
		'relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-control bg-card px-4 text-sm font-bold text-foreground shadow-(--shadow-raised) outline-ring before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-current before:opacity-0 hover:before:opacity-[.08] focus-visible:outline-3 focus-visible:outline-solid disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-highlight data-[state=on]:text-accent-foreground',
		className
	)}
	{...restProps}
/>
