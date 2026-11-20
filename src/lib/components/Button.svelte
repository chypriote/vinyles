<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from './ui/button/index.js';

	let {
		intent = 'neutral',
		disabled = false,
		onclick,
		type = 'button',
		children
	}: {
		intent?: 'success' | 'neutral';
		disabled?: boolean;
		onclick?: () => void;
		type?: 'button' | 'submit';
		children?: Snippet;
	} = $props();
</script>

<Button variant={intent} {disabled} {type} {onclick}>
	{@render children?.()}
</Button>
