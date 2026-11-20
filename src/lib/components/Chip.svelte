<script lang="ts">
	import { Badge } from './ui/badge/index.js';

	let {
		tone,
		label,
		value
	}: { tone: 'highlight' | 'success' | 'info'; label: string; value: string } = $props();
</script>

<Badge variant={tone}>
	<span class="font-extrabold">{value}</span>
	<span>{label}</span>
</Badge>
