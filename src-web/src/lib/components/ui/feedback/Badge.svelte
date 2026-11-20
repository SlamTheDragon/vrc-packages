<script lang="ts">
	import type { Snippet } from 'svelte';
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

	const variantStyles = COMPONENT_PRESETS.badge;
	const sizeStyles = {
		xs: 'text-[10px] px-2 py-0.5 rounded-full font-mono font-medium',
		sm: 'text-xs px-2.5 py-0.5 rounded-full font-medium'
	};
</script>

<span class="inline-flex items-center gap-1 select-none {variantStyles[variant]} {sizeStyles[size]} {className}">
	{@render children?.()}
</span>
