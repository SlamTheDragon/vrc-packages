<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	interface PropertyEntry {
		key: string;
		value: string | number;
		unit?: string;
		category?: string;
	}

	interface Props {
		title?: string;
		subtitle?: string;
		properties: PropertyEntry[];
		embedded?: boolean;
		class?: string;
		headerActions?: Snippet;
		footerActions?: Snippet;
	}

	let {
		title = 'Component Inspector',
		subtitle,
		properties = [],
		embedded = false,
		class: className = '',
		headerActions,
		footerActions
	}: Props = $props();

	let categories = $derived.by(() => {
		const cats: Record<string, PropertyEntry[]> = {};
		for (const p of properties) {
			const cat = p.category ?? 'General Parameters';
			if (!cats[cat]) cats[cat] = [];
			cats[cat].push(p);
		}
		return cats;
	});
</script>

<div
	data-slot="property-inspector"
	class={cn(
		'flex flex-col min-h-0',
		!embedded && 'rounded-2xl border border-border bg-card p-4 shadow-xs gap-3',
		embedded && 'h-full',
		className
	)}
>
	<header
		class={cn(
			'flex items-start justify-between gap-3 border-b border-border shrink-0',
			embedded ? 'px-4 py-3' : 'pb-2'
		)}
	>
		<div class="min-w-0">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-card-foreground text-balance">
				{title}
			</h4>
			{#if subtitle}
				<p class="text-[11px] font-mono text-muted-foreground mt-0.5 truncate" title={subtitle}>
					{subtitle}
				</p>
			{/if}
		</div>
		{#if headerActions}
			<div class="shrink-0 flex items-center gap-1">
				{@render headerActions()}
			</div>
		{/if}
	</header>

	<div class={cn('flex-1 min-h-0 overflow-y-auto flex flex-col gap-4', embedded && 'p-4')}>
		{#each Object.entries(categories) as [catName, entries] (catName)}
			<div class="flex flex-col gap-1">
				<span class="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
					{catName}
				</span>
				<div
					class={cn(
						'divide-y divide-border/50',
						!embedded && 'rounded-xl border border-border bg-background/60'
					)}
				>
					{#each entries as entry (entry.key)}
						<div
							class={cn(
								'flex items-center justify-between py-1.5 text-xs gap-3',
								!embedded && 'px-3'
							)}
						>
							<span class="text-muted-foreground font-medium shrink-0">{entry.key}</span>
							<span
								class="font-mono tabular-nums text-foreground font-semibold truncate select-text"
								title={String(entry.value)}
							>
								{entry.value}{#if entry.unit}<span class="text-muted-foreground font-normal ml-0.5">{entry.unit}</span>{/if}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	{#if footerActions}
		<footer
			class={cn(
				'shrink-0 border-t border-border flex flex-wrap items-center justify-end gap-2',
				embedded ? 'px-4 py-3 bg-card/80' : 'pt-3 mt-1'
			)}
		>
			{@render footerActions()}
		</footer>
	{/if}
</div>
