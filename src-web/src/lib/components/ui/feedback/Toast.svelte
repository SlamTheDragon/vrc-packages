<script lang="ts">
	import { Info, CheckCircle2, AlertTriangle, AlertCircle, X } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { compositorTransition } from '$lib/motion';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import type { ToastVariant } from '$lib/stores/toast.svelte';

	interface Props {
		message: string;
		title?: string;
		variant?: ToastVariant;
		durationMs?: number;
		dismissible?: boolean;
		class?: string;
		onDismiss?: () => void;
	}

	let {
		message,
		title,
		variant = 'info',
		durationMs = 3800,
		dismissible = true,
		class: className = '',
		onDismiss
	}: Props = $props();

	$effect(() => {
		if (durationMs <= 0 || !onDismiss) return;
		const timer = setTimeout(() => {
			onDismiss();
		}, durationMs);
		return () => clearTimeout(timer);
	});

	const variantStyles: Record<ToastVariant, string> = {
		info: 'border-chart-2/45 bg-popover/95 text-popover-foreground',
		success: 'border-sidebar-primary/45 bg-popover/95 text-popover-foreground',
		warning: 'border-warning/45 bg-popover/95 text-popover-foreground',
		danger: 'border-destructive/50 bg-popover/95 text-popover-foreground'
	};

	const iconStyles: Record<ToastVariant, string> = {
		info: 'text-chart-2',
		success: 'text-sidebar-primary',
		warning: 'text-warning',
		danger: 'text-destructive'
	};
</script>

<div
	in:compositorTransition={{ y: 8, scale: 0.98, duration: 150 }}
	out:compositorTransition={{ y: 6, scale: 0.98, duration: 120 }}
	data-slot="toast"
	role={variant === 'danger' ? 'alert' : 'status'}
	aria-live={variant === 'danger' ? 'assertive' : 'polite'}
	class={cn(
		'pointer-events-auto flex items-start gap-3 w-full max-w-sm p-3.5 rounded-2xl border backdrop-blur-md shadow-2xl text-xs',
		variantStyles[variant],
		className
	)}
>
	<div class={cn('shrink-0 mt-0.5', iconStyles[variant])}>
		{#if variant === 'info'}
			<Info size={16} />
		{:else if variant === 'success'}
			<CheckCircle2 size={16} />
		{:else if variant === 'warning'}
			<AlertTriangle size={16} />
		{:else}
			<AlertCircle size={16} />
		{/if}
	</div>

	<div class="flex-1 min-w-0 flex flex-col gap-0.5">
		{#if title}
			<span class="font-semibold text-foreground text-balance">{title}</span>
		{/if}
		<p class="text-muted-foreground leading-snug text-pretty">{message}</p>
	</div>

	{#if dismissible && onDismiss}
		<Button
			variant="ghost"
			size="xs"
			aria-label="Dismiss notification"
			onclick={onDismiss}
			class="shrink-0 min-w-7 px-1.5 -mt-0.5 -mr-1 text-muted-foreground hover:text-foreground"
		>
			<X size={14} />
		</Button>
	{/if}
</div>
