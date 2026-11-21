<script lang="ts">
	import type { CatalogPackage } from 'vrc-packages-api';
	import Card from '$lib/components/ui/display/Card.svelte';
	import Codeblock from '$lib/components/ui/display/Codeblock.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Switch from '$lib/components/ui/forms/Switch.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import DataTable from '$lib/components/ui/telemetry/DataTable.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { Database, RefreshCw, Play, ChevronRight } from '@lucide/svelte';

	let {
		packages = $bindable<CatalogPackage[]>([]),
		nextCursor = $bindable<string | null>(null),
		onRefresh
	}: {
		packages?: CatalogPackage[];
		nextCursor?: string | null;
		onRefresh?: () => Promise<void>;
	} = $props();

	let autoSeed = $state(true);
	let initDialogOpen = $state(false);
	let isInitializing = $state(false);
	let initStatusMessage = $state<string | null>(null);
	let initError = $state<string | null>(null);

	let isLoadingCatalog = $state(false);
	let catalogError = $state<string | null>(null);
	let selectedCanonicalId = $state<string>('');

	let selectedPackage = $derived(
		packages.find((pkg) => pkg.canonicalId === selectedCanonicalId) ?? packages[0] ?? null
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
		{ key: 'updatedAt', label: 'Updated At' }
	];

	async function handleRunInit() {
		initError = null;
		initStatusMessage = null;
		isInitializing = true;
		try {
			const res = await adminSession.client.operator.init({ autoSeed });
			initStatusMessage = `${res.message} (status=${res.status}, autoSeed=${String(res.autoSeed)}).`;
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

<div class="flex flex-col gap-6">
	<Card
		title="Coordinator D1 Schema Initialization (POST /v1/operator/init)"
		eyebrow="CONTROL PLANE 1A // STORAGE BOOTSTRAP"
	>
		{#snippet headerRight()}
			<Badge variant="emerald" size="xs">IDEMPOTENT DDL</Badge>
		{/snippet}

		<div class="flex flex-col gap-4">
			<p class="text-xs text-slate-300 leading-relaxed">
				Initializes Cloudflare D1 tables (<code class="font-mono">src-worker/src/storage/d1/utils.ts</code>) and optionally seeds default approved source profiles and discovery candidates without bypassing source-access gates.
			</p>

			<div class="flex flex-wrap items-center justify-between gap-4">
				<Switch
					id="init-autoseed-switch"
					bind:checked={autoSeed}
					label="Enable autoSeed (seed default approved VPM source profile & rule)"
				/>

				<Button variant="primary" size="sm" onclick={() => (initDialogOpen = true)}>
					<Database size={14} />
					<span>Initialize Coordinator Schema</span>
				</Button>
			</div>

			{#if initStatusMessage}
				<Notice variant="success" title="Schema Initialized">
					{initStatusMessage}
				</Notice>
			{/if}

			{#if initError}
				<Notice variant="danger" title="Initialization Error">
					{initError}
				</Notice>
			{/if}
		</div>
	</Card>

	<Dialog
		bind:open={initDialogOpen}
		title="Confirm Coordinator Schema Initialization"
		description="Dispatches POST /v1/operator/init to the configured Coordinator."
	>
		<div class="flex flex-col gap-3 text-xs text-slate-300">
			<p>
				Target Coordinator: <strong class="font-mono text-slate-100">{adminSession.coordinatorUrl}</strong>
			</p>
			<Codeblock
				language="json"
				code={JSON.stringify({ schemaVersion: 1, autoSeed }, null, 2)}
			/>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (initDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" disabled={isInitializing} onclick={handleRunInit}>
				<Play size={13} />
				<span>{isInitializing ? 'Executing...' : 'Confirm & Initialize'}</span>
			</Button>
		{/snippet}
	</Dialog>

	<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
		<div class="lg:col-span-8 flex flex-col gap-4">
			<Card
				title="Canonical Package Catalog (GET /v1/operator/catalog)"
				eyebrow="CONTROL PLANE 1B // CANONICAL PROJECTION"
			>
				{#snippet headerRight()}
					<div class="flex items-center gap-2">
						<Badge variant="neutral" size="xs">{packages.length} loaded</Badge>
						<Button variant="secondary" size="xs" onclick={() => onRefresh?.()}>
							<RefreshCw size={12} />
							<span>Refresh</span>
						</Button>
					</div>
				{/snippet}

				{#if catalogError}
					<Notice variant="danger" title="Catalog Query Error" class="mb-3">
						{catalogError}
					</Notice>
				{/if}

				{#if packages.length === 0}
					<EmptyState
						title="No Canonical Packages Indexed"
						description="Initialize the coordinator with autoSeed enabled or approve pending discovery leads to populate the catalog."
					/>
				{:else}
					<DataTable
						columns={catalogColumns}
						data={packages}
						keyField="canonicalId"
						bind:selectedId={selectedCanonicalId}
					/>
				{/if}

				{#if nextCursor}
					<div class="mt-4 flex justify-end">
						<Button
							variant="secondary"
							size="sm"
							disabled={isLoadingCatalog}
							onclick={loadMoreCatalog}
						>
							<span>{isLoadingCatalog ? 'Loading...' : 'Load Next Page'}</span>
							<ChevronRight size={14} />
						</Button>
					</div>
				{/if}
			</Card>
		</div>

		<div class="lg:col-span-4 flex flex-col gap-4">
			{#if selectedPackage}
				<PropertyInspector
					title="Package Provenance Inspector"
					subtitle={selectedPackage.canonicalId}
					properties={[
						{ key: 'Canonical ID', value: selectedPackage.canonicalId, category: 'Identity' },
						{ key: 'Display Name', value: selectedPackage.displayName, category: 'Identity' },
						{ key: 'VPM ID', value: selectedPackage.vpmId ?? 'none', category: 'Identity' },
						{ key: 'Umbrella', value: selectedPackage.umbrella, category: 'Taxonomy' },
						{ key: 'Category', value: selectedPackage.category, category: 'Taxonomy' },
						{ key: 'Lifecycle', value: selectedPackage.lifecycle, category: 'Taxonomy' },
						{
							key: 'Timestamp Confidence',
							value: selectedPackage.timestampConfidence ?? 'unknown',
							category: 'Provenance'
						},
						{
							key: 'Accepted Identity Links',
							value: selectedPackage.acceptedLinks.length,
							category: 'Provenance'
						},
						{
							key: 'Storefront Fronts',
							value: selectedPackage.fronts.length,
							category: 'Provenance'
						}
					]}
				/>

				{#if selectedPackage.fronts.length > 0}
					<Card title="Outbound Storefront Fronts (LEGAL.md §4)" eyebrow="DEEP-ROUTING">
						<div class="flex flex-col gap-2">
							{#each selectedPackage.fronts as front (front.frontId)}
								<div class="p-2.5 rounded-xl border border-slate-800 bg-slate-950/70 flex flex-col gap-1 text-xs">
									<div class="flex items-center justify-between">
										<Badge variant="emerald" size="xs">{front.platform}</Badge>
										<span class="font-mono text-[11px] text-slate-400">{front.availability}</span>
									</div>
									<a
										href={front.storefrontUrl}
										target="_blank"
										rel="external noopener noreferrer"
										class="font-mono text-xs text-emerald-400 hover:underline break-all"
									>
										{front.storefrontUrl}
									</a>
								</div>
							{/each}
						</div>
					</Card>
				{/if}
			{:else}
				<PropertyInspector
					title="Package Provenance Inspector"
					subtitle="Select a canonical package row to inspect identity links and storefront fronts"
					properties={[
						{ key: 'Selection', value: 'None', category: 'Status' }
					]}
				/>
			{/if}
		</div>
	</div>
</div>
