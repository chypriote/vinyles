<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...restProps
	}: ToggleGroupPrimitive.RootProps = $props();
</script>

<ToggleGroupPrimitive.Root
	bind:ref
	bind:value={value as never}
	data-slot="toggle-group"
	class={cn('flex flex-wrap items-center gap-2', className)}
	{...restProps}
/>
