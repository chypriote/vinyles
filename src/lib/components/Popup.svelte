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
		style={pos ? `left:${pos.left}px;top:${pos.top}px;transform:none` : undefined}
		onCloseAutoFocus={(e: Event) => {
			if (anchor) {
				e.preventDefault();
				anchor.focus();
			}
		}}
	>
		<Dialog.Header>
			<div class="flex items-start gap-4">
				{#if !artist}
					<!-- Form Popup: title only. -->
				{:else if coverUrl && !imgFailed}
					<img
						src={coverUrl}
						alt=""
						class="size-(--popup-cover-size) shrink-0 rounded-(--cover-radius) object-cover"
						onerror={() => (imgFailed = true)}
					/>
				{:else}
					<span
						aria-hidden="true"
						class="flex size-(--popup-cover-size) shrink-0 items-center justify-center rounded-(--cover-radius) text-4xl font-extrabold text-primary-foreground {tileClass(
							artist
						)}"
					>
						{initials(artist)}
					</span>
				{/if}
				<div class="flex min-w-0 flex-col gap-1">
					<Dialog.Title>{album}</Dialog.Title>
					{#if artist}<Dialog.Description>{artist}</Dialog.Description>{/if}
				</div>
			</div>
		</Dialog.Header>
		{@render details?.()}
		{#if actions}
			<Dialog.Footer>{@render actions()}</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
