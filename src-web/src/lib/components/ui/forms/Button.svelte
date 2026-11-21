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
		busy = false,
		ariaDisabled = false,
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
		busy?: boolean;
		ariaDisabled?: boolean;
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
		base: 'inline-flex items-center justify-center font-medium select-none cursor-pointer active:scale-[0.96] transition-[transform,color,background-color,border-color,opacity,box-shadow] duration-100 ease-out disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 aria-disabled:active:scale-100 aria-busy:active:scale-100',
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
		aria-disabled={disabled || ariaDisabled || undefined}
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
			disabled && 'opacity-50 pointer-events-none active:scale-100',
			className
		)}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		data-slot="button"
		{type}
		disabled={disabled || busy}
		aria-busy={busy || undefined}
		aria-disabled={ariaDisabled || disabled || busy || undefined}
		{title}
		aria-label={ariaLabel}
		aria-expanded={ariaExpanded}
		onclick={(event) => {
			if (disabled || busy) {
				event.preventDefault();
				return;
			}
			onclick?.(event);
		}}
		class={cn(
			buttonVariants({ variant, size }),
			ariaDisabled && !disabled && !busy && 'opacity-60 cursor-not-allowed',
			className
		)}
	>
		{@render children?.()}
	</button>
{/if}
