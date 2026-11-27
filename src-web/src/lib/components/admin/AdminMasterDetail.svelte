<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils';
	import type { DataTableColumn } from '$lib/components/ui/types';
	import SplitPane from '$lib/components/ui/workbench/SplitPane.svelte';
	import Sheet from '$lib/components/ui/overlays/Sheet.svelte';
	import DataTable from '$lib/components/ui/telemetry/DataTable.svelte';
	import Skeleton from '$lib/components/ui/feedback/Skeleton.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';

	interface Props {
		columns: DataTableColumn[];
		data: any[];
		keyField?: string;
		selectedId?: string;
		selectable?: boolean;
		selectedIds?: string[];
		loading?: boolean;
		density?: 'compact' | 'default';
		ariaLabel?: string;
		emptyTitle?: string;
		emptyDescription?: string;
		emptyIcon?: any;
		emptyAction?: Snippet;
		inspectorTitle?: string;
		inspectorDescription?: string;
		initialSplitPercent?: number;
		paginateClient?: boolean;
		page?: number;
		pageSize?: number;
		hasMore?: boolean;
		isLoadingMore?: boolean;
		onLoadMore?: () => void;
		heightClass?: string;
		class?: string;
		toolbar?: Snippet;
		banner?: Snippet;
		bulkActions?: Snippet<[{ selectedCount: number; selectedIds: string[]; clearSelection: () => void }]>;
		rowActions?: Snippet<[any]>;
		inspector?: Snippet;
		paginationFooter?: Snippet;
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
		loading = false,
		density = 'compact',
		ariaLabel = 'Workspace records',
		emptyTitle = 'No matching records',
		emptyDescription = 'Adjust search terms or filters, or sync with the coordinator.',
		emptyIcon,
		emptyAction,
		inspectorTitle = 'Inspector',
		inspectorDescription,
		initialSplitPercent = 58,
		paginateClient = true,
		page = $bindable(0),
		pageSize = 50,
		hasMore = false,
		isLoadingMore = false,
		onLoadMore,
		heightClass = 'md:h-[calc(100dvh-14.5rem)] md:min-h-[400px]',
		class: className = '',
		toolbar,
		banner,
		bulkActions,
		rowActions,
		inspector,
		paginationFooter,
		onRowClick,
		onRowActivate,
		onClearSelection
	}: Props = $props();

	let isDesktop = $state(true);

	onMount(() => {
		const mql = window.matchMedia('(min-width: 768px)');
		isDesktop = mql.matches;
		const onChange = (e: MediaQueryListEvent) => {
			isDesktop = e.matches;
		};
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	});

	let totalPages = $derived(Math.max(1, Math.ceil(data.length / Math.max(1, pageSize))));

	$effect(() => {
		if (!paginateClient) return;
		if (page >= totalPages) {
			page = Math.max(0, totalPages - 1);
		}
	});

	let visibleRows = $derived.by(() => {
		if (!paginateClient) return data;
		const start = page * pageSize;
		return data.slice(start, start + pageSize);
	});

	let hasSelection = $derived(selectedId !== '' && Boolean(inspector));

	function clearSelection() {
		selectedId = '';
		onClearSelection?.();
	}

	function clearMultiSelection() {
		selectedIds = [];
	}

	function getMobileSheetOpen(): boolean {
		return !isDesktop && hasSelection;
	}

	function setMobileSheetOpen(next: boolean) {
		if (!next) {
			clearSelection();
		}
	}
</script>

<div
	data-slot="admin-master-detail"
	class={cn(
		'flex flex-col rounded-2xl border border-border bg-card shadow-xs overflow-hidden',
		heightClass,
		className
	)}
>
	{#if toolbar}
		<div class="px-4 py-3 border-b border-border bg-card/90 shrink-0">
			{@render toolbar()}
		</div>
	{/if}

	{#if banner}
		<div class="px-4 py-2.5 border-b border-border bg-muted/20 shrink-0">
			{@render banner()}
		</div>
	{/if}

	{#if selectable && selectedIds.length > 0 && bulkActions}
		<div class="px-4 py-2 border-b border-primary/25 bg-primary/10 flex items-center justify-between gap-3 shrink-0">
			<div class="flex items-center gap-2">
				<span class="text-xs font-semibold text-primary">
					{selectedIds.length} {selectedIds.length === 1 ? 'item' : 'items'} selected
				</span>
				<Button
					variant="ghost"
					size="xs"
					onclick={clearMultiSelection}
					class="text-xs text-muted-foreground hover:text-foreground"
				>
					Clear
				</Button>
			</div>
			<div class="flex items-center gap-2">
				{@render bulkActions({ selectedCount: selectedIds.length, selectedIds, clearSelection: clearMultiSelection })}
			</div>
		</div>
	{/if}

	<div class="flex-1 min-h-0 flex flex-col">
		<SplitPane
			direction="horizontal"
			{initialSplitPercent}
			minPercent={38}
			maxPercent={74}
			secondPaneOpen={isDesktop && hasSelection}
		>
			{#snippet first()}
				<div class="flex flex-col h-full min-h-0">
					<div class="flex-1 min-h-0 overflow-auto">
						{#if loading && data.length === 0}
							<div class="p-4 flex flex-col gap-2">
								{#each [1, 2, 3, 4, 5, 6] as idx (idx)}
									<Skeleton class="h-9 w-full rounded-xl" />
								{/each}
							</div>
						{:else if visibleRows.length === 0}
							<EmptyState
								embedded={true}
								icon={emptyIcon}
								title={emptyTitle}
								description={emptyDescription}
								action={emptyAction}
								class="py-14"
							/>
						{:else}
							<DataTable
								{columns}
								data={visibleRows}
								{keyField}
								bind:selectedId
								{selectable}
								bind:selectedIds
								embedded={true}
								{density}
								{ariaLabel}
								{rowActions}
								{onRowClick}
								{onRowActivate}
								onClearSelection={clearSelection}
							/>
						{/if}
					</div>

					{#if paginationFooter}
						<div class="px-4 py-2 border-t border-border bg-muted/20 shrink-0">
							{@render paginationFooter()}
						</div>
					{:else if (paginateClient && data.length > pageSize) || hasMore}
						<div class="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between gap-3 shrink-0">
							<span class="text-xs text-muted-foreground tabular-nums">
								{#if paginateClient && data.length > pageSize}
									Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.length)} of {data.length}
								{:else}
									{data.length} record(s) loaded
								{/if}
							</span>
							<div class="flex items-center gap-1.5">
								{#if paginateClient && data.length > pageSize}
									<Button
										variant="outline"
										size="xs"
										disabled={page <= 0}
										onclick={() => (page = Math.max(0, page - 1))}
									>
										<ChevronLeft size={13} />
										<span>Prev</span>
									</Button>
									<span class="text-xs font-mono text-muted-foreground tabular-nums px-1.5">
										{page + 1} / {totalPages}
									</span>
									<Button
										variant="outline"
										size="xs"
										disabled={page >= totalPages - 1}
										onclick={() => (page = Math.min(totalPages - 1, page + 1))}
									>
										<span>Next</span>
										<ChevronRight size={13} />
									</Button>
								{/if}
								{#if hasMore && onLoadMore}
									<Button
										variant="secondary"
										size="xs"
										busy={isLoadingMore}
										onclick={onLoadMore}
									>
										<span>{isLoadingMore ? 'Loading...' : 'Load More'}</span>
										<ChevronRight size={13} />
									</Button>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/snippet}

			{#snippet second()}
				{#if inspector}
					{@render inspector()}
				{/if}
			{/snippet}
		</SplitPane>
	</div>
</div>

{#if !isDesktop && inspector}
	<Sheet
		bind:open={getMobileSheetOpen, setMobileSheetOpen}
		side="right"
		title={inspectorTitle}
		description={inspectorDescription}
		class="w-[92vw] sm:w-[28rem] max-w-full p-4"
	>
		<div class="flex-1 min-h-0 flex flex-col">
			{@render inspector()}
		</div>
	</Sheet>
{/if}
