<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import { CONTROL_HEIGHTS, COMPONENT_PRESETS } from '$lib/components/ui/tokens';
	import Input from '$lib/components/ui/forms/Input.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Kbd from '$lib/components/ui/display/Kbd.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import Popover from '$lib/components/ui/overlays/Popover.svelte';
	import { Search, SlidersHorizontal, X } from '@lucide/svelte';

	export interface FacetOption {
		value: string;
		label: string;
	}

	export interface FacetGroup {
		id: string;
		label: string;
		value: string;
		allValue?: string;
		options: FacetOption[];
		onChange: (value: string) => void;
	}

	interface Props {
		searchQuery?: string;
		searchPlaceholder?: string;
		enableShortcut?: boolean;
		facets?: FacetGroup[];
		resultCount?: number;
		totalCount?: number;
		onClearAll?: () => void;
		extraControls?: Snippet;
		actions?: Snippet;
		class?: string;
	}

	let {
		searchQuery = $bindable(''),
		searchPlaceholder = 'Filter records...',
		enableShortcut = true,
		facets = [],
		resultCount,
		totalCount,
		onClearAll,
		extraControls,
		actions,
		class: className = ''
	}: Props = $props();

	const instanceUid = $props.id();
	const searchInputId = `omnisearch-${instanceUid}`;
	let facetPopoverOpen = $state(false);

	let activeFacets = $derived(
		facets.filter((group) => group.value !== (group.allValue ?? 'ALL'))
	);

	let hasActiveFilters = $derived(searchQuery.trim() !== '' || activeFacets.length > 0);

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (!enableShortcut || event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
			return;
		}
		const target = event.target as HTMLElement | null;
		if (
			target &&
			(target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.tagName === 'SELECT' ||
				target.isContentEditable)
		) {
			return;
		}
		const inputEl = document.getElementById(searchInputId) as HTMLInputElement | null;
		if (!inputEl || inputEl.offsetParent === null) return;
		event.preventDefault();
		inputEl.focus();
		inputEl.select();
	}

	function handleSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && searchQuery !== '') {
			event.stopPropagation();
			searchQuery = '';
		}
	}

	function resetAllFilters() {
		searchQuery = '';
		for (const group of facets) {
			const baseline = group.allValue ?? 'ALL';
			if (group.value !== baseline) {
				group.onChange(baseline);
			}
		}
		onClearAll?.();
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div data-slot="admin-filter-bar" class={cn('flex flex-col gap-2', className)}>
	<div class="flex flex-wrap items-center justify-between gap-2.5">
		<div class="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
			<div class="w-full sm:w-72 md:w-80">
				<Input
					id={searchInputId}
					bind:value={searchQuery}
					placeholder={searchPlaceholder}
					size="sm"
					onkeydown={handleSearchKeydown}
				>
					{#snippet leftIcon()}
						<Search size={14} />
					{/snippet}
					{#snippet rightIcon()}
						{#if enableShortcut}
							<Kbd class="px-1.5 py-0 text-[10px]">/</Kbd>
						{/if}
					{/snippet}
				</Input>
			</div>

			{#if facets.length > 0}
				<Popover bind:open={facetPopoverOpen} class="w-80">
					{#snippet trigger()}
						<span
							class={cn(
								CONTROL_HEIGHTS.sm,
								COMPONENT_PRESETS.button.secondary,
								'inline-flex items-center justify-center px-3 text-xs font-medium rounded-xl gap-1.5 select-none active:scale-[0.96] transition-[transform,color,background-color,border-color,opacity,box-shadow] duration-100 ease-out'
							)}
						>
							<SlidersHorizontal size={13} />
							<span>Filters</span>
							{#if activeFacets.length > 0}
								<Badge variant="emerald" size="xs" class="tabular-nums">
									{activeFacets.length}
								</Badge>
							{/if}
						</span>
					{/snippet}

					<div class="flex flex-col gap-3.5">
						<div class="flex items-center justify-between gap-2 pb-2 border-b border-border">
							<span class="text-xs font-semibold text-foreground">Filter Facets</span>
							{#if activeFacets.length > 0}
								<Button
									variant="ghost"
									size="xs"
									onclick={() => {
										for (const g of facets) g.onChange(g.allValue ?? 'ALL');
									}}
								>
									Reset facets
								</Button>
							{/if}
						</div>

						{#each facets as group (group.id)}
							<div class="flex flex-col gap-1.5">
								<span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									{group.label}
								</span>
								<div class="flex flex-wrap gap-1.5">
									{#each group.options as opt (opt.value)}
										<Button
											variant={group.value === opt.value ? 'primary' : 'outline'}
											size="xs"
											onclick={() => group.onChange(opt.value)}
										>
											{opt.label}
										</Button>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</Popover>
			{/if}

			{#if extraControls}
				<div class="flex flex-wrap items-center gap-2">
					{@render extraControls()}
				</div>
			{/if}

			{#if typeof resultCount === 'number'}
				<span class="text-xs font-mono text-muted-foreground tabular-nums px-1">
					{#if typeof totalCount === 'number' && totalCount !== resultCount}
						{resultCount} / {totalCount}
					{:else}
						{resultCount} rows
					{/if}
				</span>
			{/if}
		</div>

		{#if actions}
			<div class="flex flex-wrap items-center gap-2 shrink-0">
				{@render actions()}
			</div>
		{/if}
	</div>

	{#if hasActiveFilters}
		<div class="flex flex-wrap items-center gap-1.5 pt-0.5">
			{#if searchQuery.trim() !== ''}
				<Button
					variant="outline"
					size="xs"
					onclick={() => (searchQuery = '')}
					class="rounded-full font-normal text-foreground"
				>
					<span class="text-muted-foreground">Query:</span>
					<span class="font-mono">{searchQuery.trim()}</span>
					<X size={11} class="text-muted-foreground" />
				</Button>
			{/if}

			{#each activeFacets as group (group.id)}
				{@const selectedOpt = group.options.find((o) => o.value === group.value)}
				<Button
					variant="outline"
					size="xs"
					onclick={() => group.onChange(group.allValue ?? 'ALL')}
					class="rounded-full font-normal text-foreground"
				>
					<span class="text-muted-foreground">{group.label}:</span>
					<span class="font-medium">{selectedOpt?.label ?? group.value}</span>
					<X size={11} class="text-muted-foreground" />
				</Button>
			{/each}

			<Button variant="ghost" size="xs" onclick={resetAllFilters} class="text-muted-foreground">
				Clear all
			</Button>
		</div>
	{/if}
</div>
