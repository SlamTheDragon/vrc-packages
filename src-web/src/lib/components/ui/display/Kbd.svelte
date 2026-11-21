<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		class: className = '',
		children
	}: {
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<kbd
	data-slot="kbd"
	class={cn(
		'inline-flex items-center justify-center px-2 py-0.5 text-[11px] font-mono font-semibold text-foreground bg-muted border border-border rounded-md shadow-2xs select-none',
		className
	)}
>
	{@render children?.()}
</kbd>
