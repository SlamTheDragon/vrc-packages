<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import { CONTROL_HEIGHTS, COMPONENT_PRESETS } from '$lib/components/ui/tokens';
	import type { ControlSize } from '$lib/components/ui/types';

	let {
		value = $bindable(''),
		type = 'text',
		placeholder = '',
		size = 'md',
		disabled = false,
		readonly = false,
		required = false,
		error = false,
		min,
		max,
		step,
		class: className = '',
		id,
		name,
		oninput,
		onchange,
		onkeydown,
		leftIcon,
		rightIcon
	}: {
		value?: string | number;
		type?: string;
		placeholder?: string;
		size?: ControlSize;
		disabled?: boolean;
		readonly?: boolean;
		required?: boolean;
		error?: boolean;
		min?: number | string;
		max?: number | string;
		step?: number | string;
		class?: string;
		id?: string;
		name?: string;
		oninput?: (e: Event) => void;
		onchange?: (e: Event) => void;
		onkeydown?: (e: KeyboardEvent) => void;
		leftIcon?: Snippet;
		rightIcon?: Snippet;
	} = $props();

	let heightClass = $derived(CONTROL_HEIGHTS[size]);
	const sizePaddings = {
		xs: 'text-xs px-2.5',
		sm: 'text-xs px-3',
		md: 'text-sm px-3.5',
		lg: 'text-base px-4'
	};
</script>

<div data-slot="input" class="relative inline-flex items-center w-full">
	{#if leftIcon}
		<div class="absolute left-3 flex items-center pointer-events-none text-muted-foreground">
			{@render leftIcon()}
		</div>
	{/if}

	<input
		{id}
		{name}
		{type}
		{placeholder}
		{disabled}
		{readonly}
		{required}
		{min}
		{max}
		{step}
		bind:value
		{oninput}
		{onchange}
		{onkeydown}
		class={cn(
			COMPONENT_PRESETS.input.base,
			heightClass,
			sizePaddings[size],
			'w-full',
			leftIcon && 'pl-9',
			rightIcon && 'pr-9',
			error && 'border-destructive focus:border-destructive focus:ring-destructive',
			disabled && 'bg-muted text-muted-foreground cursor-not-allowed border-border',
			className
		)}
	/>

	{#if rightIcon}
		<div class="absolute right-3 flex items-center pointer-events-none text-muted-foreground">
			{@render rightIcon()}
		</div>
	{/if}
</div>
