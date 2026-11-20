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
		up: 'text-emerald-700 bg-emerald-50 border-emerald-200',
		down: 'text-red-700 bg-red-50 border-red-200',
		neutral: 'text-slate-600 bg-slate-100 border-slate-200'
	};
</script>

<div class="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between {className}">
	<div class="flex items-center justify-between text-slate-500 mb-2">
		<span class="text-xs font-semibold uppercase tracking-wider">{label}</span>
		{#if Icon}
			<div class="p-1.5 rounded-lg bg-slate-50 border border-slate-100 text-slate-400">
				<Icon size={16} />
			</div>
		{/if}
	</div>

	<div class="flex items-baseline gap-2 mb-1">
		<span class="text-2xl font-bold font-mono text-slate-900 tracking-tight">{value}</span>
		{#if trend}
			<span class="text-[10px] font-mono px-2 py-0.5 rounded-full border {trendStyles[trendDirection]}">
				{trend}
			</span>
		{/if}
	</div>

	{#if subtext}
		<p class="text-xs text-slate-500 leading-normal">{subtext}</p>
	{/if}
</div>
