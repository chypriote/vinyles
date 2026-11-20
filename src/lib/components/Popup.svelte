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
		large = false,
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
		/** A bigger card: the cover takes the full height and the actions sit bottom right. */
		large?: boolean;
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
		class={large ? 'max-w-3xl p-6' : wide || artist ? 'max-w-2xl' : undefined}
		onCloseAutoFocus={(e: Event) => {
			if (anchor) {
				e.preventDefault();
				anchor.focus();
			}
		}}
	>
		{#if artist}
			<div
				class="grid gap-4 {large
					? 'grid-cols-[min(var(--popup-cover-size-large),34vw)_minmax(0,1fr)] gap-6'
					: 'grid-cols-[minmax(0,min(var(--popup-cover-size),28vw))_minmax(0,1fr)]'}"
			>
				{#if large}
					<div class="relative min-h-[min(var(--popup-cover-size-large),34vw)]">
						{#if coverUrl && !imgFailed}
							<img
								src={coverUrl}
								alt=""
								class="absolute inset-0 size-full rounded-2xl object-cover shadow-(--shadow-raised)"
								onerror={() => (imgFailed = true)}
							/>
						{:else}
							<span
								aria-hidden="true"
								class="absolute inset-0 flex items-center justify-center rounded-2xl text-6xl font-extrabold text-primary-foreground shadow-(--shadow-raised) {tileClass(
									artist
								)}"
							>
								{initials(artist)}
							</span>
						{/if}
					</div>
				{:else if coverUrl && !imgFailed}
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
					{#if large && actions}
						<Dialog.Footer class="mt-auto justify-end pt-4">{@render actions()}</Dialog.Footer>
					{/if}
				</div>
			</div>
		{:else}
			<Dialog.Title>{album}</Dialog.Title>
			{@render details?.()}
		{/if}
		{#if actions && !(large && artist)}
			<Dialog.Footer>{@render actions()}</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
