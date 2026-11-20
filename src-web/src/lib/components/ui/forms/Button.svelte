<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CONTROL_HEIGHTS, COMPONENT_PRESETS } from '$lib/components/ui/tokens';
	import type { ButtonVariant, ControlSize } from '$lib/components/ui/types';

	let {
		variant = 'primary',
		size = 'md',
		disabled = false,
		class: className = '',
		type = 'button',
		title,
		'aria-label': ariaLabel,
		href,
		onclick,
		children
	}: {
		variant?: ButtonVariant;
		size?: ControlSize;
		disabled?: boolean;
		class?: string;
		type?: 'button' | 'submit' | 'reset';
		title?: string;
		'aria-label'?: string;
		href?: string;
		onclick?: (e: MouseEvent) => void;
		children?: Snippet;
	} = $props();

	const variantStyles = COMPONENT_PRESETS.button;
	let heightClass = $derived(CONTROL_HEIGHTS[size]);
	const sizePaddings = {
		xs: 'px-2.5 text-xs rounded-lg gap-1.5',
		sm: 'px-3 text-xs rounded-xl gap-1.5',
		md: 'px-4 text-sm rounded-xl gap-2',
		lg: 'px-5 text-base rounded-2xl gap-2.5'
	};
</script>

{#if href}
	<a
		href={disabled ? undefined : href}
		{title}
		aria-label={ariaLabel}
		aria-disabled={disabled || undefined}
		role={disabled ? 'link' : undefined}
		tabindex={disabled ? -1 : undefined}
		onclick={(event) => {
			if (disabled) {
				event.preventDefault();
				return;
			}
			onclick?.(event);
		}}
		class="inline-flex items-center justify-center font-medium transition-colors select-none no-underline cursor-pointer
			{variantStyles[variant]} {heightClass} {sizePaddings[size]} {className}
			{disabled ? 'opacity-50 pointer-events-none' : ''}"
	>
		{@render children?.()}
	</a>
{:else}
	<button
		{type}
		{disabled}
		{title}
		aria-label={ariaLabel}
		{onclick}
		class="inline-flex items-center justify-center font-medium transition-colors select-none cursor-pointer
			disabled:opacity-50 disabled:pointer-events-none
			{variantStyles[variant]} {heightClass} {sizePaddings[size]} {className}"
	>
		{@render children?.()}
	</button>
{/if}
