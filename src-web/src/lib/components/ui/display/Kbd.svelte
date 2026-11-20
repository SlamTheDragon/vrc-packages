<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children
	}: {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<kbd class="inline-flex items-center justify-center px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-600 bg-slate-100 border border-slate-300 rounded-md shadow-2xs select-none {className}">
	{@render children?.()}
</kbd>
