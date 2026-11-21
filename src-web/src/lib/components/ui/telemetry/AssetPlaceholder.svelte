<script lang="ts">
	import { Image } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let {
		label = 'Asset Diagram',
		dimensions = '100% x 200px',
		class: className = ''
	}: {
		label?: string;
		dimensions?: string;
		class?: string;
	} = $props();
</script>

<div
	data-slot="asset-placeholder"
	class={cn(
		'flex flex-col items-center justify-center p-6 bg-card/60 border border-dashed border-border rounded-2xl text-center select-none',
		className
	)}
>
	<div class="p-2.5 rounded-full bg-muted text-muted-foreground border border-border mb-2">
		<Image size={20} />
	</div>
	<span class="text-xs font-semibold text-foreground">{label}</span>
	<span class="text-[10px] font-mono tabular-nums text-muted-foreground mt-0.5">{dimensions}</span>
</div>
