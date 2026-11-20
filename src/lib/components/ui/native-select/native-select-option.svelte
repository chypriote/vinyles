<script lang="ts">
	import type { HTMLOptionAttributes } from 'svelte/elements';

	let { children, ...restProps }: HTMLOptionAttributes = $props();
</script>

<option data-slot="native-select-option" {...restProps}>{@render children?.()}</option>
