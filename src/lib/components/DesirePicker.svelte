<script lang="ts">
	import Button from './Button.svelte';
	import DesireDots from './DesireDots.svelte';

	let {
		value,
		busy = null,
		compact = false,
		onPick
	}: {
		value?: 1 | 2 | 3;
		busy?: 1 | 2 | 3 | null;
		compact?: boolean;
		onPick: (level: 1 | 2 | 3) => void;
	} = $props();

	const levels = [1, 2, 3] as const;
</script>

<span class="flex flex-wrap gap-1.5">
	{#each levels as level (level)}
		<Button
			size={compact ? 'sm' : 'default'}
			loading={busy === level}
			disabled={busy !== null || value === level}
			onclick={() => onPick(level)}
		>
			<DesireDots value={level} />
		</Button>
	{/each}
</span>
