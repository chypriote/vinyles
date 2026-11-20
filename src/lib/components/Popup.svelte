<script lang="ts">
	import type { Snippet } from 'svelte';
	import { initials, tileClass } from '#lib/tile';
	import * as Dialog from './ui/dialog/index.js';

	let {
		open = $bindable(false),
		anchor = null,
		album,
		artist = '',
		coverUrl = null,
		wide = false,
		onDismiss,
		details,
		actions
	}: {
		open?: boolean;
		/** The Cover that opened the Popup. Focus goes back to it on close. */
		anchor?: HTMLElement | null;
		album: string;
		/** Empty for a form Popup: no cover tile and no subtitle. */
		artist?: string;
		coverUrl?: string | null;
		/** A wider Popup without a cover, for the cover picker. */
		wide?: boolean;
		onDismiss?: () => void;
		details?: Snippet;
		actions?: Snippet;
	} = $props();

	let imgFailed = $state(false);
	$effect(() => {
		void coverUrl;
		imgFailed = false;
	});

	function onOpenChange(next: boolean) {
		if (!next) onDismiss?.();
	}
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content
		class={wide || artist ? 'max-w-2xl' : undefined}
		onCloseAutoFocus={(e: Event) => {
			if (anchor) {
				e.preventDefault();
				anchor.focus();
			}
		}}
	>
		{#if artist}
			<div class="grid grid-cols-[minmax(0,min(var(--popup-cover-size),28vw))_minmax(0,1fr)] gap-4">
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
