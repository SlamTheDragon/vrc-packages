<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { CONTROL_HEIGHTS, COMPONENT_PRESETS } from '$lib/components/ui/tokens';
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

<div data-slot="select" class="relative inline-flex items-center w-full">
	<select
		{id}
		{name}
		{disabled}
		{required}
		bind:value
		{onchange}
		class={cn(
			'appearance-none w-full cursor-pointer disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed',
			COMPONENT_PRESETS.input.base,
			heightClass,
			sizePaddings[size],
			className
		)}
	>
		{#each options as opt (opt.value)}
			<option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
		{/each}
	</select>

	<div class="absolute right-3 pointer-events-none flex items-center text-muted-foreground">
		<ChevronDown size={16} aria-hidden="true" />
	</div>
</div>
