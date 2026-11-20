<script lang="ts">
	import type { PageProps } from './$types';
	import ImportReview from '#lib/components/ImportReview.svelte';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Vinyles | Import</title></svelte:head>

<ImportReview progress={data.progress} unmatched={data.unmatched} />
