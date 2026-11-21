<script lang="ts">
	import type { DataTableColumn } from '$lib/components/ui/types';

	let {
		columns = [],
		data = [],
		keyField = 'id',
		selectedId = $bindable(''),
		class: className = '',
		onRowClick
	}: {
		columns: DataTableColumn[];
		data: any[];
		keyField?: string;
		selectedId?: string;
		class?: string;
		onRowClick?: (row: any) => void;
	} = $props();
</script>

<div class="w-full overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xs {className}">
	<table class="w-full text-left text-xs border-collapse">
		<thead>
			<tr class="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider">
				{#each columns as col}
					<th
						scope="col"
						class="px-4 py-3"
						style={col.width ? `width: ${col.width}` : undefined}
						class:text-center={col.align === 'center'}
						class:text-right={col.align === 'right'}
					>
						{col.label}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody class="divide-y divide-slate-800/80 font-mono">
			{#if data.length === 0}
				<tr>
					<td colspan={columns.length} class="px-4 py-8 text-center text-slate-500 font-sans">
						No data available.
					</td>
				</tr>
			{:else}
				{#each data as row, idx (row[keyField] ?? idx)}
					{@const isSelected = selectedId !== '' && String(row[keyField]) === String(selectedId)}
					<tr
						onclick={() => {
							selectedId = String(row[keyField] ?? '');
							onRowClick?.(row);
						}}
						class="transition-colors cursor-pointer hover:bg-slate-800/70
							{isSelected ? 'bg-emerald-950/60 text-emerald-200 font-semibold' : 'text-slate-200'}"
					>
						{#each columns as col}
							{@const cellVal = row[col.key]}
							<td
								class="px-4 py-2.5 whitespace-nowrap"
								class:text-center={col.align === 'center'}
								class:text-right={col.align === 'right'}
							>
								{#if col.format}
									{col.format(cellVal, row)}
								{:else}
									{cellVal ?? '—'}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>
