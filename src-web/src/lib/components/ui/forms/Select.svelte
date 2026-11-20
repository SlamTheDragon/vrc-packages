<script lang="ts">
	import { CONTROL_HEIGHTS } from '$lib/components/ui/tokens';
	import type { ControlSize, SelectOption } from '$lib/components/ui/types';

	let {
		value = $bindable(''),
		options = [],
		size = 'md',
		disabled = false,
		required = false,
		class: className = '',
		id,
		name,
		onchange
	}: {
		value?: string;
		options?: SelectOption[];
		size?: ControlSize;
		disabled?: boolean;
		required?: boolean;
		class?: string;
		id?: string;
		name?: string;
		onchange?: (e: Event) => void;
	} = $props();

	let heightClass = $derived(CONTROL_HEIGHTS[size]);
	const sizePaddings = {
		xs: 'text-xs px-2.5 pr-8',
		sm: 'text-xs px-3 pr-8',
		md: 'text-sm px-3.5 pr-10',
		lg: 'text-base px-4 pr-10'
	};
</script>

<div class="relative inline-flex items-center w-full">
	<select
		{id}
		{name}
		{disabled}
		{required}
		bind:value
		{onchange}
		class="appearance-none w-full bg-white text-slate-900 border border-slate-200 rounded-xl
			focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors shadow-xs
			disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer
			{heightClass} {sizePaddings[size]} {className}"
	>
		{#each options as opt}
			<option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
		{/each}
	</select>

	<div class="absolute right-3 pointer-events-none flex items-center text-slate-400">
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</div>
</div>
