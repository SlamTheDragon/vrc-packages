<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import { COMPONENT_PRESETS } from '$lib/components/ui/tokens';
	import type { CardVariant } from '$lib/components/ui/types';

	let {
		variant = 'base',
		title,
		eyebrow,
		accent = 'none',
		class: className = '',
		children,
		headerRight,
		footer
	}: {
		variant?: CardVariant;
		title?: string;
		eyebrow?: string;
		accent?: 'emerald' | 'amber' | 'sky' | 'none';
		class?: string;
		children?: Snippet;
		headerRight?: Snippet;
		footer?: Snippet;
	} = $props();

	const variantStyles = COMPONENT_PRESETS.card;
	const accentStyles = {
		none: '',
		emerald: 'border-sidebar-primary/50 ring-1 ring-sidebar-primary/20 bg-primary/10',
		amber: 'border-warning/50 ring-1 ring-warning/20 bg-warning/10',
		sky: 'border-chart-2/50 ring-1 ring-chart-2/20 bg-chart-2/10'
	};
</script>

<div
	data-slot="card"
	class={cn(variantStyles[variant], accentStyles[accent], 'p-6 relative transition-shadow', className)}
>
	{#if title || eyebrow || headerRight}
		<header class="flex items-start justify-between pb-3 mb-4 border-b border-border gap-4">
			<div class="flex flex-col min-w-0">
				{#if eyebrow}
					<span class="text-xs font-semibold uppercase tracking-wider text-sidebar-primary mb-0.5">
						{eyebrow}
					</span>
				{/if}
				{#if title}
					<h3 class="text-base font-semibold text-card-foreground tracking-tight text-balance">
						{title}
					</h3>
				{/if}
			</div>
			{#if headerRight}
				<div class="shrink-0">
					{@render headerRight()}
				</div>
			{/if}
		</header>
	{/if}

	<div>
		{@render children?.()}
	</div>

	{#if footer}
		<footer class="mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
			{@render footer()}
		</footer>
	{/if}
</div>
