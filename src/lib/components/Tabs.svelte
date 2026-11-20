<script lang="ts">
	import { cn } from '#lib/utils';
	import { buttonVariants } from './ui/button/index.js';

	let { current }: { current: 'collection' | 'wishlist' } = $props();

	const links = [
		{ key: 'collection', href: '/', label: 'Collection' },
		{ key: 'wishlist', href: '/wishlist', label: 'Wishlist' }
	] as const;
</script>

<nav aria-label="Lists" class="flex gap-2">
	{#each links as link (link.key)}
		<a
			href={link.href}
			aria-current={current === link.key ? 'page' : undefined}
			class={cn(
				buttonVariants({ variant: current === link.key ? 'default' : 'neutral' }),
				'font-bold'
			)}>{link.label}</a
		>
	{/each}
</nav>
