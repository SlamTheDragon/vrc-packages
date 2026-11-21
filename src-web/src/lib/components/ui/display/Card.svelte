<script lang="ts">
	import type { Snippet } from 'svelte';
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
		emerald: 'border-emerald-700/70 ring-1 ring-emerald-500/20 bg-emerald-950/15',
		amber: 'border-amber-700/70 ring-1 ring-amber-500/20 bg-amber-950/15',
		sky: 'border-sky-700/70 ring-1 ring-sky-500/20 bg-sky-950/15'
	};
</script>

<div class="{variantStyles[variant]} {accentStyles[accent]} p-6 relative transition-all duration-200 {className}">
	{#if title || eyebrow || headerRight}
		<header class="flex items-start justify-between pb-3 mb-4 border-b border-slate-800 gap-4">
			<div class="flex flex-col min-w-0">
				{#if eyebrow}
					<span class="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-0.5">{eyebrow}</span>
				{/if}
				{#if title}
					<h3 class="text-base font-semibold text-slate-100 tracking-tight">{title}</h3>
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
		<footer class="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400">
			{@render footer()}
		</footer>
	{/if}
</div>
