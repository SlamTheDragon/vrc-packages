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

<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col gap-3 {className}">
	<header class="border-b border-slate-100 pb-2">
		<h4 class="text-xs font-semibold uppercase tracking-wider text-slate-800">{title}</h4>
		{#if subtitle}
			<p class="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
		{/if}
	</header>

	<div class="flex flex-col gap-3">
		{#each Object.entries(categories) as [catName, entries]}
			<div>
				<span class="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block mb-1">
					{catName}
				</span>
				<div class="rounded-xl border border-slate-100 divide-y divide-slate-100 bg-slate-50/50">
					{#each entries as entry}
						<div class="flex items-center justify-between px-3 py-1.5 text-xs">
							<span class="text-slate-600 font-medium">{entry.key}</span>
							<span class="font-mono text-slate-900 font-semibold">
								{entry.value}{#if entry.unit}<span class="text-slate-500 font-normal ml-0.5">{entry.unit}</span>{/if}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>
