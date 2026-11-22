<script lang="ts">
	let { value = $bindable([]), names }: { value?: string[]; names: string[] } = $props();
</script>

<details class="relative">
	<summary
		class="flex min-h-11 cursor-pointer items-center rounded-control bg-card px-4 text-sm font-bold text-foreground shadow-(--shadow-raised)"
	>
		{value.length ? `Artists (${value.length})` : `All artists (${names.length})`}
	</summary>
	<div
		class="absolute start-0 top-full z-(--layer-sticky) mt-1 flex max-h-72 min-w-56 flex-col overflow-y-auto rounded-control bg-card p-2 shadow-(--shadow-raised)"
	>
		{#each names as name (name)}
			<label class="flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm">
				<input type="checkbox" value={name} bind:group={value} />
				{name}
			</label>
		{/each}
	</div>
</details>
