<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		class: className = ''
	}: {
		class?: string;
	} = $props();
</script>

<div data-slot="skeleton" class={cn('animate-pulse rounded-xl bg-muted/80', className)}></div>
