<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import DialogOverlay from './dialog-overlay.svelte';
	import { cn, type WithoutChildrenOrChild } from '#lib/utils.ts';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton = true,
		closeLabel = 'Close',
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: DialogPrimitive.PortalProps;
		children: Snippet;
		showCloseButton?: boolean;
		closeLabel?: string;
	} = $props();
</script>

<DialogPrimitive.Portal {...portalProps}>
	<DialogOverlay />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		class={cn(
			'fixed top-1/2 left-1/2 z-(--layer-popup) grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-(--popup-width-max) -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl bg-card p-5 text-foreground shadow-(--shadow-raised) data-[state=closed]:opacity-0 motion-safe:transition-opacity motion-safe:duration-150',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close
				class="absolute end-3 top-3 inline-flex size-11 cursor-pointer items-center justify-center rounded-control bg-card text-foreground outline-ring hover:bg-muted focus-visible:outline-3 focus-visible:outline-solid"
			>
				<svg
					aria-hidden="true"
					class="size-5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg
				>
				<span class="sr-only">{closeLabel}</span>
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPrimitive.Portal>
