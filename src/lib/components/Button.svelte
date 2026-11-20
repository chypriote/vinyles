<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from './ui/button/index.js';

	let {
		intent = 'neutral',
		disabled = false,
		loading = false,
		onclick,
		type = 'button',
		children
	}: {
		intent?: 'success' | 'neutral';
		disabled?: boolean;
		loading?: boolean;
		onclick?: () => void;
		type?: 'button' | 'submit';
		children?: Snippet;
	} = $props();
</script>

<Button variant={intent} {disabled} {loading} {type} {onclick}>
	{@render children?.()}
</Button>
