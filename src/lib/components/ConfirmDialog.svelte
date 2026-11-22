<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as AlertDialog from './ui/alert-dialog/index.js';

	let {
		open = $bindable(false),
		title,
		text,
		actionLabel,
		onConfirm,
		actionDisabled = false,
		children
	}: {
		open?: boolean;
		title: string;
		text: string;
		actionLabel: string;
		onConfirm: () => void;
		actionDisabled?: boolean;
		/** Shown between the text and the buttons. */
		children?: Snippet;
	} = $props();
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{text}</AlertDialog.Description>
		</AlertDialog.Header>
		{@render children?.()}
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action disabled={actionDisabled} onclick={onConfirm}>
				{actionLabel}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
