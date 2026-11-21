<script lang="ts">
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

<div class="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xs flex flex-col gap-3 {className}">
	<header class="border-b border-slate-800 pb-2">
		<h4 class="text-xs font-semibold uppercase tracking-wider text-slate-100">{title}</h4>
		{#if subtitle}
			<p class="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
		{/if}
	</header>

	<div class="flex flex-col gap-3">
		{#each Object.entries(categories) as [catName, entries]}
			<div>
				<span class="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block mb-1">
					{catName}
				</span>
				<div class="rounded-xl border border-slate-800 divide-y divide-slate-800/80 bg-slate-950/60">
					{#each entries as entry}
						<div class="flex items-center justify-between px-3 py-1.5 text-xs gap-3">
							<span class="text-slate-400 font-medium shrink-0">{entry.key}</span>
							<span class="font-mono text-slate-100 font-semibold truncate" title={String(entry.value)}>
								{entry.value}{#if entry.unit}<span class="text-slate-400 font-normal ml-0.5">{entry.unit}</span>{/if}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>
