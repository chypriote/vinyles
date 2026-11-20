<script lang="ts">
	import Button from './Button.svelte';
	import DesireDots from './DesireDots.svelte';

	let {
		value,
		busy = null,
		onPick
	}: { value?: 1 | 2 | 3; busy?: 1 | 2 | 3 | null; onPick: (level: 1 | 2 | 3) => void } = $props();

	const levels = [1, 2, 3] as const;
</script>

<span class="inline-flex gap-1.5">
	{#each levels as level (level)}
		<Button
			loading={busy === level}
			disabled={busy !== null || value === level}
			onclick={() => onPick(level)}
		>
			<DesireDots value={level} />
		</Button>
	{/each}
</span>
