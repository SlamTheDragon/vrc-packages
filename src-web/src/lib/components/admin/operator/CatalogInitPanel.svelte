<script lang="ts">
	import type { CatalogPackage } from 'vrc-packages-api';
	import Codeblock from '$lib/components/ui/display/Codeblock.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Switch from '$lib/components/ui/forms/Switch.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import AdminFilterBar, { type FacetGroup } from '$lib/components/admin/AdminFilterBar.svelte';
	import AdminMasterDetail from '$lib/components/admin/AdminMasterDetail.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { Database, Play, ChevronRight, X, ExternalLink } from '@lucide/svelte';

	let {
		packages = $bindable<CatalogPackage[]>([]),
		nextCursor = $bindable<string | null>(null),
		isLoading = false,
		onRefresh
	}: {
		packages?: CatalogPackage[];
		nextCursor?: string | null;
		isLoading?: boolean;
		onRefresh?: () => Promise<void>;
	} = $props();

	let autoSeed = $state(true);
	let initDialogOpen = $state(false);
	let isInitializing = $state(false);
	let initError = $state<string | null>(null);

	let isLoadingCatalog = $state(false);
	let catalogError = $state<string | null>(null);
	let selectedCanonicalId = $state<string>('');
	let searchQuery = $state('');
	let lifecycleFilter = $state('ALL');
	let umbrellaFilter = $state('ALL');
	let page = $state(0);

	const lifecycleOptions = $derived.by(() => {
		const values = Array.from(new Set(packages.map((p) => p.lifecycle))).sort();
		return [
			{ value: 'ALL', label: 'All Lifecycles' },
			...values.map((v) => ({ value: v, label: v }))
		];
	});

	const umbrellaOptions = $derived.by(() => {
		const values = Array.from(new Set(packages.map((p) => p.umbrella))).sort();
		return [
			{ value: 'ALL', label: 'All Umbrellas' },
			...values.map((v) => ({ value: v, label: v }))
		];
	});

	const facets = $derived<FacetGroup[]>([
		{
			id: 'lifecycle',
			label: 'Lifecycle',
			value: lifecycleFilter,
			allValue: 'ALL',
			options: lifecycleOptions,
			onChange: (val) => {
				lifecycleFilter = val;
				page = 0;
			}
		},
		{
			id: 'umbrella',
			label: 'Umbrella',
			value: umbrellaFilter,
			allValue: 'ALL',
			options: umbrellaOptions,
			onChange: (val) => {
				umbrellaFilter = val;
				page = 0;
			}
		}
	]);

	let filteredPackages = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return packages.filter((pkg) => {
			if (lifecycleFilter !== 'ALL' && pkg.lifecycle !== lifecycleFilter) return false;
			if (umbrellaFilter !== 'ALL' && pkg.umbrella !== umbrellaFilter) return false;
			if (!q) return true;
			return (
				pkg.canonicalId.toLowerCase().includes(q) ||
				pkg.displayName.toLowerCase().includes(q) ||
				(pkg.vpmId ?? '').toLowerCase().includes(q) ||
				pkg.umbrella.toLowerCase().includes(q) ||
				pkg.category.toLowerCase().includes(q)
			);
		});
	});

	let selectedPackage = $derived(
		filteredPackages.find((pkg) => pkg.canonicalId === selectedCanonicalId) ??
			packages.find((pkg) => pkg.canonicalId === selectedCanonicalId) ??
			null
	);

	const catalogColumns = [
		{ key: 'canonicalId', label: 'Canonical ID' },
		{ key: 'displayName', label: 'Display Name' },
		{ key: 'umbrella', label: 'Umbrella' },
		{ key: 'category', label: 'Category' },
		{ key: 'lifecycle', label: 'Lifecycle' },
		{
			key: 'fronts',
			label: 'Fronts',
			align: 'right' as const,
			format: (val: unknown) => (Array.isArray(val) ? String(val.length) : '0')
		},
		{ key: 'updatedAt', label: 'Updated' }
	];

	async function handleRunInit() {
		initError = null;
		isInitializing = true;
		try {
			const res = await adminSession.client.operator.init({ autoSeed });
			toastStore.success(
				`${res.message} (status=${res.status}, autoSeed=${String(res.autoSeed)}).`,
				'Schema Initialized'
			);
			initDialogOpen = false;
			await onRefresh?.();
		} catch (err) {
			initError = formatAdminError(err);
		} finally {
			isInitializing = false;
		}
	}

	async function loadMoreCatalog() {
		if (!nextCursor) return;
		catalogError = null;
		isLoadingCatalog = true;
		try {
			const res = await adminSession.client.operator.catalog.list({
				limit: 50,
				cursor: nextCursor
			});
			packages = [...packages, ...res.packages];
			nextCursor = res.nextCursor;
		} catch (err) {
			catalogError = formatAdminError(err);
		} finally {
			isLoadingCatalog = false;
		}
	}
</script>

<div data-slot="catalog-init-panel" class="flex flex-col gap-3">
	<AdminMasterDetail
		columns={catalogColumns}
		data={filteredPackages}
		keyField="canonicalId"
		bind:selectedId={selectedCanonicalId}
		bind:page
		loading={isLoading}
		ariaLabel="Canonical package catalog"
		emptyTitle="No catalog packages match"
		emptyDescription="Initialize the Coordinator schema with autoSeed or clear active filters."
		inspectorTitle={selectedPackage?.displayName ?? 'Package Provenance'}
		inspectorDescription={selectedPackage?.canonicalId}
	>
		{#snippet toolbar()}
			<AdminFilterBar
				bind:searchQuery
				searchPlaceholder="Filter catalog by ID, display name, or VPM..."
				{facets}
				resultCount={filteredPackages.length}
				totalCount={packages.length}
			>
				{#snippet actions()}
					<Button
						variant="secondary"
						size="sm"
						onclick={() => {
							initError = null;
							initDialogOpen = true;
						}}
					>
						<Database size={14} />
						<span>Initialize Schema</span>
					</Button>
				{/snippet}
			</AdminFilterBar>
		{/snippet}

		{#snippet banner()}
			{#if catalogError}
				<Notice variant="danger" title="Catalog Query Failed">
					{catalogError}
				</Notice>
			{/if}
		{/snippet}

		{#snippet emptyAction()}
			<Button
				variant="primary"
				size="sm"
				onclick={() => {
					initError = null;
					initDialogOpen = true;
				}}
			>
				<Database size={14} />
				<span>Initialize Schema</span>
			</Button>
		{/snippet}

		{#snippet rowActions(pkg: CatalogPackage)}
			<Button
				variant="ghost"
				size="xs"
				onclick={() => (selectedCanonicalId = pkg.canonicalId)}
			>
				Inspect
			</Button>
		{/snippet}

		{#snippet inspector()}
			{#if selectedPackage}
				<PropertyInspector
					embedded={true}
					title="Package Provenance"
					subtitle={selectedPackage.canonicalId}
					properties={[
						{ key: 'Display Name', value: selectedPackage.displayName, category: 'Identity' },
						{ key: 'VPM ID', value: selectedPackage.vpmId ?? 'none', category: 'Identity' },
						{ key: 'Umbrella', value: selectedPackage.umbrella, category: 'Taxonomy' },
						{ key: 'Category', value: selectedPackage.category, category: 'Taxonomy' },
						{ key: 'Content Rating', value: selectedPackage.contentRating, category: 'Taxonomy' },
						{ key: 'Lifecycle', value: selectedPackage.lifecycle, category: 'Taxonomy' },
						{
							key: 'Timestamp Confidence',
							value: selectedPackage.timestampConfidence ?? 'unknown',
							category: 'Provenance'
						},
						{
							key: 'Identity Links',
							value: selectedPackage.acceptedLinks.length,
							category: 'Provenance'
						},
						{
							key: 'Storefront Fronts',
							value: selectedPackage.fronts.length,
							category: 'Provenance'
						}
					]}
				>
					{#snippet headerActions()}
						<Button
							variant="ghost"
							size="xs"
							aria-label="Close inspector"
							title="Close inspector"
							onclick={() => (selectedCanonicalId = '')}
							class="min-w-7 px-1.5"
						>
							<X size={14} />
						</Button>
					{/snippet}

					{#snippet footerActions()}
						{#if selectedPackage.fronts.length > 0}
							<div class="w-full flex flex-col gap-2">
								<span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Storefront Fronts ({selectedPackage.fronts.length})
								</span>
								{#each selectedPackage.fronts as front (front.frontId)}
									<div class="p-2 rounded-xl border border-border bg-background/60 flex flex-col gap-1 text-xs">
										<div class="flex items-center justify-between gap-2">
											<Badge variant="emerald" size="xs">{front.platform}</Badge>
											<span class="font-mono text-[11px] text-muted-foreground">{front.availability}</span>
										</div>
										<a
											href={front.storefrontUrl}
											target="_blank"
											rel="external noopener noreferrer"
											class="inline-flex items-center gap-1 font-mono text-xs text-sidebar-primary hover:underline break-all"
										>
											<span>{front.storefrontUrl}</span>
											<ExternalLink size={11} class="shrink-0" />
										</a>
									</div>
								{/each}
							</div>
						{/if}
					{/snippet}
				</PropertyInspector>
			{/if}
		{/snippet}

		{#snippet paginationFooter()}
			{#if nextCursor || filteredPackages.length > 50}
				<div class="flex items-center justify-between gap-3 flex-wrap">
					<span class="text-xs text-muted-foreground tabular-nums">
						{filteredPackages.length} matching package(s) loaded
					</span>
					<div class="flex items-center gap-2">
						{#if filteredPackages.length > 50}
							<Button
								variant="outline"
								size="xs"
								disabled={page <= 0}
								onclick={() => (page = Math.max(0, page - 1))}
							>
								Prev Page
							</Button>
							<Button
								variant="outline"
								size="xs"
								disabled={(page + 1) * 50 >= filteredPackages.length}
								onclick={() => (page = page + 1)}
							>
								Next Page
							</Button>
						{/if}
						{#if nextCursor}
							<Button
								variant="secondary"
								size="xs"
								busy={isLoadingCatalog}
								onclick={loadMoreCatalog}
							>
								<span>{isLoadingCatalog ? 'Loading...' : 'Load More from Coordinator'}</span>
								<ChevronRight size={13} />
							</Button>
						{/if}
					</div>
				</div>
			{/if}
		{/snippet}
	</AdminMasterDetail>

	<Dialog
		bind:open={initDialogOpen}
		title="Initialize Coordinator Schema"
		description="Dispatches idempotent POST /v1/operator/init to initialize D1 tables."
	>
		<div class="flex flex-col gap-4 text-xs text-muted-foreground">
			{#if initError}
				<Notice variant="danger" title="Initialization Failed">
					{initError}
				</Notice>
			{/if}
			<Switch
				id="init-autoseed-switch"
				bind:checked={autoSeed}
				label="Seed default approved VPM source profile and rule (autoSeed)"
			/>
			<Codeblock
				language="json"
				code={JSON.stringify({ schemaVersion: 1, autoSeed }, null, 2)}
			/>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (initDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" busy={isInitializing} onclick={handleRunInit}>
				<Play size={13} />
				<span>{isInitializing ? 'Executing...' : 'Confirm & Initialize'}</span>
			</Button>
		{/snippet}
	</Dialog>
</div>
