<script lang="ts">
	let { value = $bindable([]), names }: { value?: string[]; names: string[] } = $props();

	function toggle(name: string, on: boolean) {
		value = on ? [...value, name] : value.filter((n) => n !== name);
	}
</script>

<details class="relative">
	<summary
		class="flex min-h-11 cursor-pointer items-center rounded-control bg-card px-4 text-sm font-bold text-foreground shadow-(--shadow-raised)"
	>
		{value.length ? `Artists (${value.length})` : `All artists (${names.length})`}
	</summary>
	<div
		class="absolute top-full right-0 z-(--layer-sticky) mt-1 max-h-72 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-lg bg-card shadow-(--shadow-raised)"
	>
		<div class="sticky top-0 border-b border-border bg-card p-2">
			<button
				type="button"
				class="min-h-11 w-full cursor-pointer rounded-control px-2 text-left text-sm font-bold disabled:cursor-default disabled:opacity-50"
				disabled={value.length === 0}
				onclick={() => (value = [])}
			>
				Clear selection
			</button>
		</div>
		<div class="flex flex-col p-2">
			{#each names as name (name)}
				<label class="flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm">
					<!-- autocomplete off: the browser must not restore stale checks on reload -->
					<input
						type="checkbox"
						autocomplete="off"
						checked={value.includes(name)}
						onchange={(e) => toggle(name, e.currentTarget.checked)}
					/>
					{name}
				</label>
			{/each}
		</div>
	</div>
</details>
