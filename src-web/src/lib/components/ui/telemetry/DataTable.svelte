<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import type { DataTableColumn } from '$lib/components/ui/types';
	import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';

	interface Props {
		columns: DataTableColumn[];
		data: any[];
		keyField?: string;
		selectedId?: string;
		selectable?: boolean;
		selectedIds?: string[];
		embedded?: boolean;
		density?: 'compact' | 'default';
		ariaLabel?: string;
		class?: string;
		rowActions?: Snippet<[any]>;
		onRowClick?: (row: any) => void;
		onRowActivate?: (row: any) => void;
		onClearSelection?: () => void;
	}

	let {
		columns = [],
		data = [],
		keyField = 'id',
		selectedId = $bindable(''),
		selectable = false,
		selectedIds = $bindable([]),
		embedded = false,
		density = 'compact',
		ariaLabel = 'Data records',
		class: className = '',
		rowActions,
		onRowClick,
		onRowActivate,
		onClearSelection
	}: Props = $props();

	const instanceId = $props.id();
	let activeIndex = $state(-1);
	let lastCheckedIndex = $state<number | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);

	let isAllSelected = $derived(
		selectable && data.length > 0 && data.every((r) => selectedIds.includes(String(r[keyField] ?? '')))
	);
	let isIndeterminate = $derived(
		selectable && !isAllSelected && data.some((r) => selectedIds.includes(String(r[keyField] ?? '')))
	);

	function toggleSelectAll() {
		if (isAllSelected) {
			const visibleKeys = new Set(data.map((r) => String(r[keyField] ?? '')));
			selectedIds = selectedIds.filter((id) => !visibleKeys.has(id));
		} else {
			const allKeys = data.map((r) => String(r[keyField] ?? ''));
			selectedIds = Array.from(new Set([...selectedIds, ...allKeys]));
		}
	}

	function handleCheckboxToggle(event: MouseEvent, index: number, key: string, nextChecked: boolean) {
		if (event.shiftKey && lastCheckedIndex !== null && lastCheckedIndex !== index) {
			const start = Math.min(lastCheckedIndex, index);
			const end = Math.max(lastCheckedIndex, index);
			const keysInRange = data.slice(start, end + 1).map((r) => String(r[keyField] ?? ''));

			if (nextChecked) {
				selectedIds = Array.from(new Set([...selectedIds, ...keysInRange]));
			} else {
				const removeSet = new Set(keysInRange);
				selectedIds = selectedIds.filter((id) => !removeSet.has(id));
			}
		} else {
			if (nextChecked) {
				if (!selectedIds.includes(key)) {
					selectedIds = [...selectedIds, key];
				}
			} else {
				selectedIds = selectedIds.filter((id) => id !== key);
			}
			lastCheckedIndex = index;
		}
	}

	let effectiveIndex = $derived.by(() => {
		if (data.length === 0) return -1;
		if (selectedId !== '') {
			const idx = data.findIndex((row) => String(row[keyField] ?? '') === String(selectedId));
			if (idx >= 0) return idx;
		}
		if (activeIndex >= 0 && activeIndex < data.length) return activeIndex;
		return -1;
	});

	let activeDescendantId = $derived(
		effectiveIndex >= 0 ? `${instanceId}-row-${effectiveIndex}` : undefined
	);

	function rowDomId(idx: number): string {
		return `${instanceId}-row-${idx}`;
	}

	function selectByIndex(idx: number, activate = false) {
		const row = data[idx];
		if (!row) return;
		activeIndex = idx;
		const key = String(row[keyField] ?? '');
		selectedId = key;
		onRowClick?.(row);
		if (activate) {
			onRowActivate?.(row);
		}
		const rowEl = containerEl?.querySelector(`#${CSS.escape(rowDomId(idx))}`);
		rowEl?.scrollIntoView({ block: 'nearest' });
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (data.length === 0) return;
		const target = event.target as HTMLElement | null;
		if (target && target !== containerEl && target.closest('button, a, input, [role="menuitem"]')) {
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			const next = effectiveIndex < data.length - 1 ? effectiveIndex + 1 : 0;
			selectByIndex(next);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			const prev = effectiveIndex > 0 ? effectiveIndex - 1 : data.length - 1;
			selectByIndex(prev);
		} else if (event.key === 'Home') {
			event.preventDefault();
			selectByIndex(0);
		} else if (event.key === 'End') {
			event.preventDefault();
			selectByIndex(data.length - 1);
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			const idx = effectiveIndex >= 0 ? effectiveIndex : 0;
			selectByIndex(idx, true);
		} else if (event.key === 'Escape' && (selectedId !== '' || activeIndex >= 0)) {
			event.preventDefault();
			activeIndex = -1;
			selectedId = '';
			onClearSelection?.();
		}
	}

	const headerCellClass = $derived(density === 'compact' ? 'px-3 py-2' : 'px-4 py-3');
	const bodyCellClass = $derived(density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-2.5');
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={containerEl}
	data-slot="data-table"
	role="grid"
	aria-label={ariaLabel}
	aria-activedescendant={activeDescendantId}
	tabindex={data.length > 0 ? 0 : undefined}
	onkeydown={handleKeyDown}
	class={cn(
		'w-full overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
		!embedded && 'rounded-2xl border border-border bg-card shadow-xs',
		className
	)}
>
	<table class="w-full text-left text-xs border-collapse">
		<thead class="sticky top-0 z-10 bg-card/95 backdrop-blur-xs">
			<tr class="border-b border-border text-muted-foreground font-semibold uppercase tracking-wider">
				{#if selectable}
					<th scope="col" class={cn(headerCellClass, 'w-10 text-center')}>
						<div class="inline-flex items-center justify-center" onclick={(e) => e.stopPropagation()}>
							<Checkbox
								checked={isAllSelected}
								indeterminate={isIndeterminate}
								ariaLabel="Select all visible rows"
								onclick={() => toggleSelectAll()}
							/>
						</div>
					</th>
				{/if}
				{#each columns as col (col.key)}
					<th
						scope="col"
						class={cn(
							headerCellClass,
							col.align === 'center' && 'text-center',
							col.align === 'right' && 'text-right'
						)}
						style={col.width ? `width: ${col.width}` : undefined}
					>
						{col.label}
					</th>
				{/each}
				{#if rowActions}
					<th scope="col" class={cn(headerCellClass, 'w-1 text-right')}>
						<span class="sr-only">Actions</span>
					</th>
				{/if}
			</tr>
		</thead>
		<tbody class="divide-y divide-border/60 font-mono tabular-nums">
			{#if data.length === 0}
				<tr>
					<td
						colspan={columns.length + (rowActions ? 1 : 0) + (selectable ? 1 : 0)}
						class="px-4 py-8 text-center text-muted-foreground font-sans"
					>
						No data available.
					</td>
				</tr>
			{:else}
				{#each data as row, idx (row[keyField] ?? idx)}
					{@const isSelected = selectedId !== '' && String(row[keyField]) === String(selectedId)}
					{@const isActive = idx === effectiveIndex}
					<tr
						id={rowDomId(idx)}
						role="row"
						aria-selected={isSelected}
						onclick={() => selectByIndex(idx, true)}
						class={cn(
							'group transition-colors duration-100 cursor-pointer hover:bg-muted/70',
							isSelected
								? 'bg-primary/20 text-sidebar-primary font-semibold'
								: isActive
									? 'bg-muted/50 text-foreground'
									: 'text-foreground'
						)}
					>
						{#if selectable}
							{@const rowKey = String(row[keyField] ?? '')}
							{@const isChecked = selectedIds.includes(rowKey)}
							<td class={cn(bodyCellClass, 'w-10 text-center')} onclick={(e) => e.stopPropagation()}>
								<div class="inline-flex items-center justify-center">
									<Checkbox
										checked={isChecked}
										ariaLabel={`Select row ${rowKey}`}
										onclick={(e) => handleCheckboxToggle(e, idx, rowKey, !isChecked)}
									/>
								</div>
							</td>
						{/if}
						{#each columns as col (col.key)}
							{@const cellVal = row[col.key]}
							<td
								class={cn(
									bodyCellClass,
									'whitespace-nowrap',
									col.align === 'center' && 'text-center',
									col.align === 'right' && 'text-right'
								)}
							>
								{#if col.format}
									{col.format(cellVal, row)}
								{:else}
									{cellVal ?? '—'}
								{/if}
							</td>
						{/each}
						{#if rowActions}
							<td
								class={cn(bodyCellClass, 'text-right whitespace-nowrap')}
								onclick={(event) => event.stopPropagation()}
							>
								<div
									class={cn(
										'inline-flex items-center justify-end gap-1 transition-opacity duration-100',
										isSelected
											? 'opacity-100'
											: 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
									)}
								>
									{@render rowActions(row)}
								</div>
							</td>
						{/if}
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>
