<script lang="ts">
	import { Info, CheckCircle2, AlertTriangle, AlertCircle } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		variant = 'info',
		title,
		class: className = '',
		children
	}: {
		variant?: 'info' | 'success' | 'warning' | 'danger';
		title?: string;
		class?: string;
		children?: Snippet;
	} = $props();

	const variantStyles = {
		info: 'bg-sky-950/50 text-sky-200 border-sky-800/70',
		success: 'bg-emerald-950/50 text-emerald-200 border-emerald-800/70',
		warning: 'bg-amber-950/50 text-amber-200 border-amber-800/70',
		danger: 'bg-red-950/50 text-red-200 border-red-800/70'
	};

	const iconStyles = {
		info: 'text-sky-400',
		success: 'text-emerald-400',
		warning: 'text-amber-400',
		danger: 'text-red-400'
	};
</script>

<div class="flex items-start gap-3 p-3.5 rounded-xl border text-sm {variantStyles[variant]} {className}">
	<div class="shrink-0 mt-0.5 {iconStyles[variant]}">
		{#if variant === 'info'}
			<Info size={18} />
		{:else if variant === 'success'}
			<CheckCircle2 size={18} />
		{:else if variant === 'warning'}
			<AlertTriangle size={18} />
		{:else}
			<AlertCircle size={18} />
		{/if}
	</div>

	<div class="flex flex-col gap-0.5 min-w-0">
		{#if title}
			<span class="font-semibold">{title}</span>
		{/if}
		<div class="text-xs leading-relaxed opacity-90">
			{@render children?.()}
		</div>
	</div>
</div>
