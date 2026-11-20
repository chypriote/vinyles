<script lang="ts">
	import Button from './Button.svelte';
	import LoginForm from './LoginForm.svelte';
	import Popup from './Popup.svelte';
	import RecordForm from './RecordForm.svelte';
	import WishlistItemForm from './WishlistItemForm.svelte';

	let {
		isOwner,
		current,
		artists = [],
		stores = []
	}: {
		isOwner: boolean;
		current: 'collection' | 'wishlist';
		artists?: { id: number; name: string }[];
		stores?: { id: number; name: string }[];
	} = $props();

	let loginOpen = $state(false);
	let addOpen = $state(false);
</script>

{#if isOwner}
	<Button intent="success" onclick={() => (addOpen = true)}>Add</Button>
{:else}
	<Button onclick={() => (loginOpen = true)}>
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			class="size-5"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<rect x="4" y="11" width="16" height="10" rx="2" />
			<path d="M8 11V7a4 4 0 0 1 8 0v4" />
		</svg>
		<span class="sr-only">Owner login</span>
	</Button>
{/if}

<Popup bind:open={loginOpen} album="Owner login">
	{#snippet details()}
		<LoginForm onSuccess={() => (loginOpen = false)} />
	{/snippet}
</Popup>

{#if isOwner}
	<Popup bind:open={addOpen} album={current === 'wishlist' ? 'Add to wishlist' : 'Add a record'}>
		{#snippet details()}
			{#if current === 'wishlist'}
				<WishlistItemForm {artists} {stores} onDone={() => (addOpen = false)} />
			{:else}
				<RecordForm {artists} {stores} onDone={() => (addOpen = false)} />
			{/if}
		{/snippet}
	</Popup>
{/if}
