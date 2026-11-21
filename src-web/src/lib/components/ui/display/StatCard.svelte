<script lang="ts">
	import type { Component } from 'svelte';

	let {
		label,
		value,
		subtext,
		trend,
		trendDirection = 'neutral',
		icon: Icon,
		class: className = ''
	}: {
		label: string;
		value: string | number;
		subtext?: string;
		trend?: string;
		trendDirection?: 'up' | 'down' | 'neutral';
		icon?: any;
		class?: string;
	} = $props();

	const trendStyles = {
		up: 'text-emerald-300 bg-emerald-950/70 border-emerald-700/60',
		down: 'text-red-300 bg-red-950/70 border-red-700/60',
		neutral: 'text-slate-300 bg-slate-800 border-slate-700'
	};
</script>

<div class="p-5 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xs flex flex-col justify-between {className}">
	<div class="flex items-center justify-between text-slate-400 mb-2">
		<span class="text-xs font-semibold uppercase tracking-wider">{label}</span>
		{#if Icon}
			<div class="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
				<Icon size={16} />
			</div>
		{/if}
	</div>

	<div class="flex items-baseline gap-2 mb-1">
		<span class="text-2xl font-bold font-mono text-slate-100 tracking-tight">{value}</span>
		{#if trend}
			<span class="text-[10px] font-mono px-2 py-0.5 rounded-full border {trendStyles[trendDirection]}">
				{trend}
			</span>
		{/if}
	</div>

	{#if subtext}
		<p class="text-xs text-slate-400 leading-normal">{subtext}</p>
	{/if}
</div>
