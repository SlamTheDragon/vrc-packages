<script lang="ts">
	import { Info, CheckCircle2, AlertTriangle, AlertCircle } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import { compositorTransition } from '$lib/motion';

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
		info: 'bg-chart-2/10 text-foreground border-chart-2/40',
		success: 'bg-primary/15 text-foreground border-sidebar-primary/45',
		warning: 'bg-warning/10 text-foreground border-warning/40',
		danger: 'bg-destructive/15 text-destructive border-destructive/40'
	};

	const iconStyles = {
		info: 'text-chart-2',
		success: 'text-sidebar-primary',
		warning: 'text-warning',
		danger: 'text-destructive'
	};
</script>

<div
	in:compositorTransition={{ y: -4, duration: 150 }}
	out:compositorTransition={{ y: -4, duration: 110 }}
	data-slot="notice"
	role={variant === 'danger' ? 'alert' : 'status'}
	class={cn('flex items-start gap-3 p-3.5 rounded-xl border text-sm', variantStyles[variant], className)}
>
	<div class={cn('shrink-0 mt-0.5', iconStyles[variant])}>
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
			<span class="font-semibold text-balance">{title}</span>
		{/if}
		<div class="text-xs leading-relaxed opacity-90 text-pretty">
			{@render children?.()}
		</div>
	</div>
</div>
