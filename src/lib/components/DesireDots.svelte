<script lang="ts">
	let { value }: { value: 1 | 2 | 3 } = $props();
</script>

<span class="inline-flex items-center gap-1 text-icon-accent">
	<span aria-hidden="true" class="inline-flex gap-1">
		{#each { length: value } as _, i (i)}
			<span class="size-2 rounded-full bg-current"></span>
		{/each}
	</span>
	<span class="sr-only">Desire {value} of 3</span>
</span>
