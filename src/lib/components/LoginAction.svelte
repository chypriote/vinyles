<script lang="ts">
	import { Button } from './ui/button/index.js';
	import LoginForm from './LoginForm.svelte';
	import Popup from './Popup.svelte';

	let loginOpen = $state(false);
</script>

<Button
	variant="neutral"
	onclick={() => (loginOpen = true)}
	class="size-7 min-h-0 px-0 after:absolute after:-inset-2 after:content-['']"
>
	<svg
		aria-hidden="true"
		viewBox="0 0 24 24"
		class="size-4"
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

<Popup bind:open={loginOpen} album="Owner login">
	{#snippet details()}
		<LoginForm onSuccess={() => (loginOpen = false)} />
	{/snippet}
</Popup>
