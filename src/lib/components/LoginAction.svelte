<script lang="ts">
	import { Button } from './ui/button/index.js';
	import LoginForm from './LoginForm.svelte';
	import Popup from './Popup.svelte';

	let { isOwner }: { isOwner: boolean } = $props();
	let loginOpen = $state(false);
</script>

{#if isOwner}
	<Button
		variant="neutral"
		href="/admin"
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
			<circle cx="12" cy="12" r="3" />
			<path
				d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"
			/>
		</svg>
		<span class="sr-only">Admin</span>
	</Button>
{:else}
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
{/if}
