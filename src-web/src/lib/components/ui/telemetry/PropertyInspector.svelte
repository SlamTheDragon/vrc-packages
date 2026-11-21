<script lang="ts">
	import { cn } from '$lib/utils';

	interface PropertyEntry {
		key: string;
		value: string | number;
		unit?: string;
		category?: string;
	}

	let {
		title = 'Component Inspector',
		subtitle,
		properties = [],
		class: className = ''
	}: {
		title?: string;
		subtitle?: string;
		properties: PropertyEntry[];
		class?: string;
	} = $props();

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
	class={cn('rounded-2xl border border-border bg-card p-4 shadow-xs flex flex-col gap-3', className)}
>
	<header class="border-b border-border pb-2">
		<h4 class="text-xs font-semibold uppercase tracking-wider text-card-foreground text-balance">{title}</h4>
		{#if subtitle}
			<p class="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
		{/if}
	</header>

	<div class="flex flex-col gap-3">
		{#each Object.entries(categories) as [catName, entries] (catName)}
			<div>
				<span class="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground block mb-1">
					{catName}
				</span>
				<div class="rounded-xl border border-border divide-y divide-border bg-background/60">
					{#each entries as entry (entry.key)}
						<div class="flex items-center justify-between px-3 py-1.5 text-xs gap-3">
							<span class="text-muted-foreground font-medium shrink-0">{entry.key}</span>
							<span class="font-mono tabular-nums text-foreground font-semibold truncate" title={String(entry.value)}>
								{entry.value}{#if entry.unit}<span class="text-muted-foreground font-normal ml-0.5">{entry.unit}</span>{/if}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>
