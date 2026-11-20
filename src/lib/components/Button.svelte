<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from './ui/button/index.js';

	let {
		intent = 'neutral',
		size = 'default',
		disabled = false,
		loading = false,
		onclick,
		type = 'button',
		children
	}: {
		intent?: 'success' | 'neutral' | 'danger';
		size?: 'default' | 'sm';
		disabled?: boolean;
		loading?: boolean;
		onclick?: () => void;
		type?: 'button' | 'submit';
		children?: Snippet;
	} = $props();
</script>

<Button variant={intent} {size} {disabled} {loading} {type} {onclick}>
	{@render children?.()}
</Button>
