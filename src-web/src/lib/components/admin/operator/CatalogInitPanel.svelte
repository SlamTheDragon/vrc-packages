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
	import { Database, Play, ChevronRight } from '@lucide/svelte';

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
		{ key: 'updatedAt', label: 'Updated' }
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

<div data-slot="catalog-init-panel" class="flex flex-col gap-6">
	{#if initStatusMessage}
		<Notice variant="success" title="Schema Initialized">
			{initStatusMessage}
		</Notice>
	{/if}

	{#if initError}
		<Notice variant="danger" title="Initialization Failed">
			{initError}
		</Notice>
	{/if}

	{#if catalogError}
		<Notice variant="danger" title="Catalog Query Failed">
			{catalogError}
		</Notice>
	{/if}

	<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
		<div class={selectedPackage ? 'lg:col-span-8' : 'lg:col-span-12'}>
			<Card title="Canonical Package Catalog">
				{#snippet headerRight()}
					<Button variant="secondary" size="xs" onclick={() => (initDialogOpen = true)}>
						<Database size={13} />
						<span>Initialize Schema</span>
					</Button>
				{/snippet}

				{#if packages.length === 0}
					<EmptyState
						title="No packages indexed"
						description="Initialize the Coordinator schema with autoSeed or approve pending discovery leads."
					>
						<Button variant="primary" size="sm" onclick={() => (initDialogOpen = true)}>
							<Database size={14} />
							<span>Initialize Schema</span>
						</Button>
					</EmptyState>
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

		{#if selectedPackage}
			<div class="lg:col-span-4 flex flex-col gap-4">
				<PropertyInspector
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
				/>

				{#if selectedPackage.fronts.length > 0}
					<Card title="Storefront Fronts">
						<div class="flex flex-col gap-2">
							{#each selectedPackage.fronts as front (front.frontId)}
								<div class="p-2.5 rounded-xl border border-border bg-background/60 flex flex-col gap-1 text-xs">
									<div class="flex items-center justify-between">
										<Badge variant="emerald" size="xs">{front.platform}</Badge>
										<span class="font-mono text-[11px] text-muted-foreground">{front.availability}</span>
									</div>
									<a
										href={front.storefrontUrl}
										target="_blank"
										rel="external noopener noreferrer"
										class="font-mono text-xs text-sidebar-primary hover:underline break-all"
									>
										{front.storefrontUrl}
									</a>
								</div>
							{/each}
						</div>
					</Card>
				{/if}
			</div>
		{/if}
	</div>

	<Dialog
		bind:open={initDialogOpen}
		title="Initialize Coordinator Schema"
		description="Dispatches idempotent POST /v1/operator/init to initialize D1 tables."
	>
		<div class="flex flex-col gap-4 text-xs text-muted-foreground">
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
			<Button variant="primary" size="sm" disabled={isInitializing} onclick={handleRunInit}>
				<Play size={13} />
				<span>{isInitializing ? 'Executing...' : 'Confirm & Initialize'}</span>
			</Button>
		{/snippet}
	</Dialog>
</div>
