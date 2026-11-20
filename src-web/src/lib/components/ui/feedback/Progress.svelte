<script lang="ts">
	import { Progress as Primitive } from 'bits-ui';

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
		emerald: 'bg-emerald-600',
		amber: 'bg-amber-600',
		sky: 'bg-sky-600'
	};

	let pct = $derived(Math.min(100, Math.max(0, (value / max) * 100)));
</script>

<Primitive.Root
	{value}
	{max}
	class="relative h-2 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200 {className}"
>
	<div
		class="h-full transition-all duration-300 ease-out {colorStyles[color]}"
		style="width: {pct}%"
	></div>
</Primitive.Root>
