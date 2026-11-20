<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { initials, tileClass } from '#lib/tile';
	import * as Dialog from './ui/dialog/index.js';

	let {
		open = $bindable(false),
		anchor = null,
		album,
		artist = '',
		coverUrl = null,
		onDismiss,
		details,
		actions
	}: {
		open?: boolean;
		anchor?: HTMLElement | null;
		album: string;
		/** Empty for a form Popup: no cover tile and no subtitle. */
		artist?: string;
		coverUrl?: string | null;
		onDismiss?: () => void;
		details?: Snippet;
		actions?: Snippet;
	} = $props();

	const GUTTER = 16;
	let content = $state<HTMLElement | null>(null);
	let pos = $state<{ left: number; top: number } | null>(null);
	let imgFailed = $state(false);
	$effect(() => {
		void coverUrl;
		imgFailed = false;
	});

	// Open over the anchor, clamped to the screen. No anchor: centered by CSS.
	$effect(() => {
		if (!open || !anchor || !content) {
			pos = null;
			return;
		}
		const el = content;
		const a = anchor;
		tick().then(() => {
			const r = a.getBoundingClientRect();
			const w = el.offsetWidth;
			const h = el.offsetHeight;
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const left = Math.min(
				Math.max(r.left + r.width / 2 - w / 2, GUTTER),
				Math.max(vw - w - GUTTER, GUTTER)
			);
			const top = Math.min(Math.max(r.top, GUTTER), Math.max(vh - h - GUTTER, GUTTER));
			pos = { left, top };
		});
	});

	function onOpenChange(next: boolean) {
		if (!next) onDismiss?.();
	}
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content
		bind:ref={content}
		style={pos ? `left:${pos.left}px;top:${pos.top}px;translate:none` : undefined}
		onCloseAutoFocus={(e: Event) => {
			if (anchor) {
				e.preventDefault();
				anchor.focus();
			}
		}}
	>
		{#if artist}
			<div class="grid grid-cols-[minmax(0,var(--popup-cover-size))_minmax(0,1fr)] gap-4">
				{#if coverUrl && !imgFailed}
					<img
						src={coverUrl}
						alt=""
						class="aspect-square w-full rounded-2xl object-cover shadow-(--shadow-raised)"
						onerror={() => (imgFailed = true)}
					/>
				{:else}
					<span
						aria-hidden="true"
						class="flex aspect-square w-full items-center justify-center rounded-2xl text-4xl font-extrabold text-primary-foreground shadow-(--shadow-raised) {tileClass(
							artist
						)}"
					>
						{initials(artist)}
					</span>
				{/if}
				<div class="flex min-w-0 flex-col gap-0.5">
					<Dialog.Title>{album}</Dialog.Title>
					<Dialog.Description class="mb-2">{artist}</Dialog.Description>
					{@render details?.()}
				</div>
			</div>
		{:else}
			<Dialog.Title>{album}</Dialog.Title>
			{@render details?.()}
		{/if}
		{#if actions}
			<Dialog.Footer>{@render actions()}</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
