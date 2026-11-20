<script lang="ts">
	import * as AlertDialog from './ui/alert-dialog/index.js';

	let {
		open = $bindable(false),
		title,
		text,
		actionLabel,
		onConfirm
	}: {
		open?: boolean;
		title: string;
		text: string;
		actionLabel: string;
		onConfirm: () => void;
	} = $props();
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{text}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={onConfirm}>{actionLabel}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
