<script lang="ts">
	import type { CatalogPackage, OperatorStatusResponse } from 'vrc-packages-api';
	import { formatTimestamp } from '$lib/components/admin/admin-constants';
	import Codeblock from '$lib/components/ui/display/Codeblock.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Input from '$lib/components/ui/forms/Input.svelte';
	import Switch from '$lib/components/ui/forms/Switch.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import AdminFilterBar, { type FacetGroup } from '$lib/components/admin/AdminFilterBar.svelte';
	import AdminMasterDetail from '$lib/components/admin/AdminMasterDetail.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { Database, Play, Flame, X, ExternalLink } from '@lucide/svelte';

	const PURGE_CONFIRM_TOKEN = 'PURGE_DEVELOPMENT_D1';

	let {
		packages = $bindable<CatalogPackage[]>([]),
		nextCursor = $bindable<string | null>(null),
		operatorStatus = null,
		isLoading = false,
		onRefresh
	}: {
		packages?: CatalogPackage[];
		nextCursor?: string | null;
		operatorStatus?: OperatorStatusResponse | null;
		isLoading?: boolean;
		onRefresh?: () => Promise<void>;
	} = $props();

	let initDialogOpen = $state(false);
	let isInitializing = $state(false);
	let initError = $state<string | null>(null);

	let purgeDialogOpen = $state(false);
	let purgeConfirmInput = $state('');
	let purgePreserveNodes = $state(true);
	let purgeSeedStarter = $state(false);
	let isPurging = $state(false);
	let purgeError = $state<string | null>(null);

	let isLoadingCatalog = $state(false);
	let catalogError = $state<string | null>(null);
	let selectedCanonicalId = $state<string>('');
	let searchQuery = $state('');
	let lifecycleFilter = $state('ALL');
	let umbrellaFilter = $state('ALL');
	let page = $state(0);

	let canPurgeDevelopmentD1 = $derived(
		operatorStatus?.environment === 'development' && operatorStatus?.purgeEnabled === true
	);
	let purgeConfirmValid = $derived(purgeConfirmInput.trim() === PURGE_CONFIRM_TOKEN);

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
				(pkg.ownerName ?? '').toLowerCase().includes(q) ||
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
		{ key: 'ownerName', label: 'Owner' },
		{ key: 'verificationStatus', label: 'Verified' },
		{ key: 'umbrella', label: 'Umbrella' },
		{ key: 'lifecycle', label: 'Lifecycle' },
		{
			key: 'sources',
			label: 'Sources',
			align: 'right' as const,
			format: (val: unknown) => (Array.isArray(val) ? String(val.length) : '0')
		},
		{
			key: 'updatedAt',
			label: 'Updated',
			format: (val: unknown) => formatTimestamp(val)
		}
	];

	async function handleRunInit() {
		initError = null;
		isInitializing = true;
		try {
			const res = await adminSession.client.operator.init({ autoSeed: false });
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

	function openPurgeDialog() {
		purgeConfirmInput = '';
		purgePreserveNodes = true;
		purgeSeedStarter = false;
		purgeError = null;
		purgeDialogOpen = true;
	}

	async function handleRunSystemPurge() {
		if (!canPurgeDevelopmentD1 || !purgeConfirmValid) return;
		purgeError = null;
		isPurging = true;
		try {
			const res = await adminSession.client.operator.systemPurge({
				schemaVersion: 1,
				confirm: PURGE_CONFIRM_TOKEN,
				preserveNodes: purgePreserveNodes,
				seedPreviewStarter: purgeSeedStarter
			});
			selectedCanonicalId = '';
			purgeDialogOpen = false;
			toastStore.success(
				`Development D1 purged (nodes preserved: ${res.preservedNodes}, starter profiles: ${res.seededProfiles}).`,
				'System Purged'
			);
			await onRefresh?.();
		} catch (err) {
			purgeError = formatAdminError(err);
		} finally {
			isPurging = false;
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
		hasMore={Boolean(nextCursor)}
		isLoadingMore={isLoadingCatalog}
		onLoadMore={loadMoreCatalog}
		loading={isLoading}
		ariaLabel="Canonical package catalog"
		emptyTitle="No catalog packages match"
		emptyDescription="Initialize the Coordinator schema, configure steering profiles, or adjust active filters."
		inspectorTitle={selectedPackage?.displayName ?? 'Package Provenance'}
		inspectorDescription={selectedPackage?.canonicalId}
	>
		{#snippet toolbar()}
			<AdminFilterBar
				bind:searchQuery
				searchPlaceholder="Filter catalog by ID, display name, owner, or VPM..."
				{facets}
				resultCount={filteredPackages.length}
				totalCount={packages.length}
			>
				{#snippet actions()}
					<div class="flex items-center gap-2">
						{#if canPurgeDevelopmentD1}
							<Button variant="destructive" size="sm" onclick={openPurgeDialog}>
								<Flame size={14} />
								<span>System Purge</span>
							</Button>
						{/if}
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
					</div>
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
						{ key: 'Owner Name', value: selectedPackage.ownerName ?? 'none', category: 'Identity' },
						{ key: 'Owner Key', value: selectedPackage.ownerKey ?? 'none', category: 'Identity' },
						{ key: 'Verification', value: selectedPackage.verificationStatus, category: 'Trust' },
						{ key: 'Verified By App', value: selectedPackage.verifiedByAppId ?? 'none', category: 'Trust' },
						{ key: 'VPM ID', value: selectedPackage.vpmId ?? 'none', category: 'VPM' },
						{ key: 'VPM Version', value: selectedPackage.vpmLatestVersion ?? 'none', category: 'VPM' },
						{ key: 'VPM Repo', value: selectedPackage.vpmRepoUrl ?? 'none', category: 'VPM' },
						{ key: 'Umbrella', value: selectedPackage.umbrella, category: 'Taxonomy' },
						{ key: 'Category', value: selectedPackage.category, category: 'Taxonomy' },
						{ key: 'Content Rating', value: selectedPackage.contentRating, category: 'Taxonomy' },
						{ key: 'Lifecycle', value: selectedPackage.lifecycle, category: 'Taxonomy' },
						{ key: 'Summary', value: selectedPackage.summary ?? 'none', category: 'Metadata' },
						{ key: 'Tags', value: selectedPackage.tags.join(', ') || 'none', category: 'Metadata' },
						{ key: 'Quality Flags', value: selectedPackage.qualityFlags.join(', ') || 'none', category: 'Quality' },
						{
							key: 'Timestamp Confidence',
							value: selectedPackage.timestampConfidence ?? 'unknown',
							category: 'Provenance'
						},
						{ key: 'Listing Sources', value: selectedPackage.sources.length, category: 'Provenance' },
						{ key: 'Relations', value: selectedPackage.relations.length, category: 'Provenance' }
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
						{#if selectedPackage.sources.length > 0 || selectedPackage.relations.length > 0}
							<div class="w-full flex flex-col gap-3">
								{#if selectedPackage.sources.length > 0}
									<div class="flex flex-col gap-2">
										<span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
											Listing Sources ({selectedPackage.sources.length})
										</span>
										{#each selectedPackage.sources as source (source.sourceLinkId)}
											<div class="p-2 rounded-xl border border-border bg-background/60 flex flex-col gap-1 text-xs">
												<div class="flex items-center justify-between gap-2 flex-wrap">
													<div class="flex items-center gap-1.5">
														<Badge variant="emerald" size="xs">{source.platform}</Badge>
														<Badge variant="neutral" size="xs">{source.evidenceKind}</Badge>
														<Badge variant={source.reviewState === 'accepted' ? 'sky' : 'amber'} size="xs">
															{source.reviewState}
														</Badge>
													</div>
													<span class="font-mono text-[11px] text-muted-foreground">
														{source.availability} ({Math.round(source.confidence * 100)}%)
													</span>
												</div>
												<a
													href={source.storefrontUrl}
													target="_blank"
													rel="external noopener noreferrer"
													class="inline-flex items-center gap-1 font-mono text-xs text-sidebar-primary hover:underline break-all"
												>
													<span>{source.storefrontUrl}</span>
													<ExternalLink size={11} class="shrink-0" />
												</a>
											</div>
										{/each}
									</div>
								{/if}

								{#if selectedPackage.relations.length > 0}
									<div class="flex flex-col gap-1.5">
										<span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
											Relations ({selectedPackage.relations.length})
										</span>
										{#each selectedPackage.relations as rel (rel.relationId)}
											<div class="px-2.5 py-1.5 rounded-lg border border-border bg-background/50 flex items-center justify-between gap-2 text-[11px]">
												<span class="font-mono text-foreground truncate">
													{rel.relationType}: {rel.targetAvatarBase ?? rel.targetCanonicalId ?? 'target'}
												</span>
												<span class="font-mono text-muted-foreground shrink-0">
													+{rel.feedbackUpCount} / -{rel.feedbackDownCount}
												</span>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					{/snippet}
				</PropertyInspector>
			{/if}
		{/snippet}
	</AdminMasterDetail>

	<Dialog
		bind:open={initDialogOpen}
		title="Initialize Coordinator Schema"
		description="Dispatches idempotent POST /v1/operator/init (explicit autoSeed: false)."
	>
		<div class="flex flex-col gap-4 text-xs text-muted-foreground">
			{#if initError}
				<Notice variant="danger" title="Initialization Failed">
					{initError}
				</Notice>
			{/if}
			<Codeblock
				language="json"
				code={JSON.stringify({ schemaVersion: 1, autoSeed: false }, null, 2)}
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

	{#if canPurgeDevelopmentD1}
		<Dialog
			bind:open={purgeDialogOpen}
			alert={true}
			title="Purge Development D1 Database"
			description="Drops and rebuilds all 17 Coordinator tables on VRCP_ENV=development."
		>
			<div class="flex flex-col gap-4">
				{#if purgeError}
					<Notice variant="danger" title="System Purge Failed">
						{purgeError}
					</Notice>
				{/if}

				<Notice variant="danger" title="Destructive Development Reset">
					Clears catalog packages, sources, jobs, leads, steering profiles, and governance records.
				</Notice>

				<Switch
					id="purge-preserve-nodes"
					bind:checked={purgePreserveNodes}
					label="Preserve active node credentials"
				/>
				<Switch
					id="purge-seed-starter"
					bind:checked={purgeSeedStarter}
					label="Seed 16 preview starter steering profiles"
				/>

				<Field id="purge-confirm-input" label={`Type ${PURGE_CONFIRM_TOKEN} to confirm`} required={true}>
					<Input
						id="purge-confirm-input"
						bind:value={purgeConfirmInput}
						placeholder={PURGE_CONFIRM_TOKEN}
					/>
				</Field>
			</div>

			{#snippet actions()}
				<Button variant="secondary" size="sm" disabled={isPurging} onclick={() => (purgeDialogOpen = false)}>
					Cancel
				</Button>
				<Button
					variant="destructive"
					size="sm"
					busy={isPurging}
					ariaDisabled={!purgeConfirmValid}
					onclick={handleRunSystemPurge}
				>
					<Flame size={13} />
					<span>{isPurging ? 'Purging...' : 'Execute Purge'}</span>
				</Button>
			{/snippet}
		</Dialog>
	{/if}
</div>
