<script lang="ts">
	import Button from './Button.svelte';
	import LoginForm from './LoginForm.svelte';
	import Popup from './Popup.svelte';

	let { isOwner }: { isOwner: boolean } = $props();

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

<!-- Placeholder: the Add form comes in a later slice. -->
<Popup bind:open={addOpen} album="Add" />
