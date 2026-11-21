<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tv } from 'tailwind-variants';
	import { cn } from '$lib/utils';
	import { COMPONENT_PRESETS } from '$lib/components/ui/tokens';
	import type { BadgeVariant } from '$lib/components/ui/types';

	let {
		variant = 'neutral',
		size = 'sm',
		class: className = '',
		children
	}: {
		variant?: BadgeVariant;
		size?: 'xs' | 'sm';
		class?: string;
		children?: Snippet;
	} = $props();

	const badgeVariants = tv({
		base: 'inline-flex items-center gap-1 select-none',
		variants: {
			variant: COMPONENT_PRESETS.badge,
			size: {
				xs: 'text-[10px] px-2 py-0.5 rounded-full font-mono font-medium tabular-nums',
				sm: 'text-xs px-2.5 py-0.5 rounded-full font-medium tabular-nums'
			}
		},
		defaultVariants: {
			variant: 'neutral',
			size: 'sm'
		}
	});
</script>

<span data-slot="badge" class={cn(badgeVariants({ variant, size }), className)}>
	{@render children?.()}
</span>
