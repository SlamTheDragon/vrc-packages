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

<kbd class="inline-flex items-center justify-center px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-200 bg-slate-800 border border-slate-700 rounded-md shadow-2xs select-none {className}">
	{@render children?.()}
</kbd>
