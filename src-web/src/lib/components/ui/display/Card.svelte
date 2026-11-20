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
		emerald: 'border-emerald-300 ring-1 ring-emerald-300/40 bg-emerald-50/10',
		amber: 'border-amber-300 ring-1 ring-amber-300/40 bg-amber-50/10',
		sky: 'border-sky-300 ring-1 ring-sky-300/40 bg-sky-50/10'
	};
</script>

<div class="{variantStyles[variant]} {accentStyles[accent]} p-6 relative transition-all duration-200 {className}">
	{#if title || eyebrow || headerRight}
		<header class="flex items-start justify-between pb-3 mb-4 border-b border-slate-100 gap-4">
			<div class="flex flex-col min-w-0">
				{#if eyebrow}
					<span class="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-0.5">{eyebrow}</span>
				{/if}
				{#if title}
					<h3 class="text-base font-semibold text-slate-900 tracking-tight">{title}</h3>
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
		<footer class="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
			{@render footer()}
		</footer>
	{/if}
</div>
