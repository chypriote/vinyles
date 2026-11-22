<script lang="ts">
	import type { Component } from 'svelte';
	import { Badge } from './ui/badge/index.js';

	let {
		tone,
		label,
		value,
		icon: Icon,
		mobileHidden = false
	}: {
		tone: 'highlight' | 'success' | 'info';
		label: string;
		value: string;
		/** Replaces the label below `sm`. */
		icon?: Component<{ class?: string; 'aria-hidden'?: 'true' }>;
		/** Hide the chip below `sm`. */
		mobileHidden?: boolean;
	} = $props();
</script>

<Badge variant={tone} class={mobileHidden ? 'hidden sm:inline-flex' : ''}>
	{#if Icon}
		<Icon aria-hidden="true" class="size-4 sm:hidden" />
	{/if}
	<span class="font-extrabold">{value}</span>
	<span class={Icon ? 'sr-only sm:not-sr-only' : ''}>{label}</span>
</Badge>
