<script lang="ts">
	type Level = 1 | 2 | 3 | 4 | 5;
	let {
		value,
		onPick,
		disabled = false
	}: { value: Level; onPick?: (level: Level) => void; disabled?: boolean } = $props();
	const levels = [1, 2, 3, 4, 5] as const;
</script>

{#if onPick}
	<span
		role="group"
		aria-label="Desire"
		class="-ms-1.5 -my-2 inline-flex items-center text-icon-accent"
	>
		{#each levels as level (level)}
			<button
				type="button"
				{disabled}
				aria-label="Set desire to {level}"
				aria-pressed={level === value}
				class="flex h-11 w-5 cursor-pointer items-center justify-center rounded-full outline-ring focus-visible:outline-3 focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50"
				onclick={() => level !== value && onPick(level)}
			>
				<span class="size-2 rounded-full bg-current {level <= value ? '' : 'opacity-25'}"></span>
			</button>
		{/each}
	</span>
{:else}
	<span class="inline-flex items-center gap-1 text-icon-accent">
		<span aria-hidden="true" class="inline-flex gap-1">
			{#each { length: value }, i (i)}
				<span class="size-2 rounded-full bg-current"></span>
			{/each}
		</span>
		<span class="sr-only">Desire {value} of 5</span>
	</span>
{/if}
