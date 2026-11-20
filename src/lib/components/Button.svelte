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
		class: className,
		children
	}: {
		intent?: 'success' | 'neutral' | 'danger';
		size?: 'default' | 'sm';
		class?: string;
		disabled?: boolean;
		loading?: boolean;
		onclick?: () => void;
		type?: 'button' | 'submit';
		children?: Snippet;
	} = $props();
</script>

<Button variant={intent} {size} {disabled} {loading} {type} {onclick} class={className}>
	{@render children?.()}
</Button>
