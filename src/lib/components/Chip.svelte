<script lang="ts">
	import type { Component } from 'svelte';
	import { Badge } from './ui/badge/index.js';

	let {
		tone,
		label,
		value,
		icon: Icon,
		compact = false
	}: {
		tone: 'highlight' | 'success' | 'info';
		label: string;
		value: string;
		/** Shown in place of the label below `sm`. */
		icon?: Component<{ class?: string; 'aria-hidden'?: 'true' }>;
		/** Hide the label below `sm`, keeping the value. */
		compact?: boolean;
	} = $props();
</script>

<Badge variant={tone}>
	{#if Icon}
		<Icon aria-hidden="true" class="size-4 sm:hidden" />
	{/if}
	<span class="font-extrabold">{value}</span>
	<span class={compact || Icon ? 'sr-only sm:not-sr-only' : ''}>{label}</span>
</Badge>
