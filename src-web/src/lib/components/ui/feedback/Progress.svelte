<script lang="ts">
	import { Progress as Primitive } from 'bits-ui';
	import { cn } from '$lib/utils';

	let {
		value = 0,
		max = 100,
		color = 'emerald',
		class: className = ''
	}: {
		value?: number;
		max?: number;
		color?: 'emerald' | 'amber' | 'sky';
		class?: string;
	} = $props();

	const colorStyles = {
		emerald: 'bg-sidebar-primary',
		amber: 'bg-warning',
		sky: 'bg-chart-2'
	};

	let pct = $derived(Math.min(100, Math.max(0, (value / max) * 100)));
</script>

<Primitive.Root
	data-slot="progress"
	{value}
	{max}
	class={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted border border-border', className)}
>
	<div
		class={cn('h-full transition-all duration-200 ease-out', colorStyles[color])}
		style="width: {pct}%"
	></div>
</Primitive.Root>
