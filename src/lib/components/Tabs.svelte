<script lang="ts">
	import { resolve } from '$app/paths';
	import { cn } from '#lib/utils';

	let { current }: { current: 'collection' | 'wishlist' } = $props();

	const links = [
		{ key: 'collection', href: '/', label: 'Collection' },
		{ key: 'wishlist', href: '/wishlist', label: 'Wishlist' }
	] as const;
</script>

<nav
	aria-label="Lists"
	class="inline-flex gap-0.5 rounded-control bg-card p-1 shadow-(--shadow-raised)"
>
	{#each links as link (link.key)}
		<a
			href={resolve(link.href)}
			aria-current={current === link.key ? 'page' : undefined}
			class={cn(
				'inline-flex min-h-11 items-center rounded-control px-5 text-sm font-extrabold outline-ring focus-visible:outline-3 focus-visible:outline-solid',
				current === link.key
					? 'bg-primary text-primary-foreground'
					: 'bg-transparent text-foreground'
			)}
		>
			{link.label}
		</a>
	{/each}
</nav>
