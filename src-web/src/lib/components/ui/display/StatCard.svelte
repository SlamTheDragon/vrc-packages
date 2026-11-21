<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		label,
		value,
		subtext,
		trend,
		trendDirection = 'neutral',
		icon: Icon,
		class: className = ''
	}: {
		label: string;
		value: string | number;
		subtext?: string;
		trend?: string;
		trendDirection?: 'up' | 'down' | 'neutral';
		icon?: any;
		class?: string;
	} = $props();

	const trendStyles = {
		up: 'text-sidebar-primary bg-primary/20 border-sidebar-primary/40',
		down: 'text-destructive bg-destructive/15 border-destructive/40',
		neutral: 'text-muted-foreground bg-muted border-border'
	};
</script>

<div
	data-slot="stat-card"
	class={cn('p-5 bg-card rounded-2xl border border-border shadow-xs flex flex-col justify-between', className)}
>
	<div class="flex items-center justify-between text-muted-foreground mb-2">
		<span class="text-xs font-semibold uppercase tracking-wider">{label}</span>
		{#if Icon}
			<div class="p-1.5 rounded-lg bg-muted/80 border border-border text-foreground">
				<Icon size={16} />
			</div>
		{/if}
	</div>

	<div class="flex items-baseline gap-2 mb-1">
		<span class="text-2xl font-bold font-mono tabular-nums text-card-foreground tracking-tight">
			{value}
		</span>
		{#if trend}
			<span class={cn('text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full border', trendStyles[trendDirection])}>
				{trend}
			</span>
		{/if}
	</div>

	{#if subtext}
		<p class="text-xs text-muted-foreground leading-normal text-pretty">{subtext}</p>
	{/if}
</div>
