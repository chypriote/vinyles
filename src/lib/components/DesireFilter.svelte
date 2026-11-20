<script lang="ts">
	import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group/index.js';
	import DesireDots from './DesireDots.svelte';

	let { value = $bindable([]) }: { value?: (1 | 2 | 3)[] } = $props();

	const levels = [3, 2, 1] as const;
</script>

<ToggleGroup
	type="multiple"
	aria-label="Desire"
	bind:value={() => value.map(String), (v) => (value = v.map(Number) as (1 | 2 | 3)[])}
>
	{#each levels as level (level)}
		<ToggleGroupItem value={String(level)}>
			<DesireDots value={level} />
		</ToggleGroupItem>
	{/each}
</ToggleGroup>
