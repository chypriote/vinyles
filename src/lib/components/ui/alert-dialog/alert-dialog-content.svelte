<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import AlertDialogOverlay from './alert-dialog-overlay.svelte';
	import { cn, type WithoutChild } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		...restProps
	}: WithoutChild<AlertDialogPrimitive.ContentProps> & {
		portalProps?: AlertDialogPrimitive.PortalProps;
	} = $props();
</script>

<AlertDialogPrimitive.Portal {...portalProps}>
	<AlertDialogOverlay />
	<AlertDialogPrimitive.Content
		bind:ref
		data-slot="alert-dialog-content"
		class={cn(
			'fixed top-1/2 left-1/2 z-(--layer-popup) grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-(--popup-width-max) -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl bg-card p-5 text-foreground shadow-(--shadow-raised) data-[state=closed]:opacity-0 motion-safe:transition-opacity motion-safe:duration-150',
			className
		)}
		{...restProps}
	/>
</AlertDialogPrimitive.Portal>
