<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tv } from 'tailwind-variants';
	import { cn } from '$lib/utils';
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
		'aria-expanded': ariaExpanded,
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
		'aria-expanded'?: boolean;
		href?: string;
		onclick?: (e: MouseEvent) => void;
		children?: Snippet;
	} = $props();

	const buttonVariants = tv({
		base: 'inline-flex items-center justify-center font-medium transition-colors select-none cursor-pointer disabled:opacity-50 disabled:pointer-events-none',
		variants: {
			variant: COMPONENT_PRESETS.button,
			size: {
				xs: `${CONTROL_HEIGHTS.xs} px-2.5 text-xs rounded-lg gap-1.5`,
				sm: `${CONTROL_HEIGHTS.sm} px-3 text-xs rounded-xl gap-1.5`,
				md: `${CONTROL_HEIGHTS.md} px-4 text-sm rounded-xl gap-2`,
				lg: `${CONTROL_HEIGHTS.lg} px-5 text-base rounded-2xl gap-2.5`
			}
		},
		defaultVariants: {
			variant: 'primary',
			size: 'md'
		}
	});
</script>

{#if href}
	<a
		data-slot="button"
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
		class={cn(
			buttonVariants({ variant, size }),
			'no-underline',
			disabled && 'opacity-50 pointer-events-none',
			className
		)}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		data-slot="button"
		{type}
		{disabled}
		{title}
		aria-label={ariaLabel}
		aria-expanded={ariaExpanded}
		{onclick}
		class={cn(buttonVariants({ variant, size }), className)}
	>
		{@render children?.()}
	</button>
{/if}
