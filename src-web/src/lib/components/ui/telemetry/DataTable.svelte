<script lang="ts">
	import { cn } from '$lib/utils';
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

<div
	data-slot="data-table"
	class={cn('w-full overflow-x-auto rounded-2xl border border-border bg-card shadow-xs', className)}
>
	<table class="w-full text-left text-xs border-collapse">
		<thead>
			<tr class="border-b border-border bg-background/60 text-muted-foreground font-semibold uppercase tracking-wider">
				{#each columns as col (col.key)}
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
		<tbody class="divide-y divide-border font-mono tabular-nums">
			{#if data.length === 0}
				<tr>
					<td colspan={columns.length} class="px-4 py-8 text-center text-muted-foreground font-sans">
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
						class={cn(
							'transition-colors cursor-pointer hover:bg-muted/70',
							isSelected
								? 'bg-primary/20 text-sidebar-primary font-semibold'
								: 'text-foreground'
						)}
					>
						{#each columns as col (col.key)}
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
