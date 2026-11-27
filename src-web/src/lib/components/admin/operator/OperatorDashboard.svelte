<script lang="ts">
	import { onMount } from 'svelte';
	import {
		VRCPApiError,
		type AppCandidateRecord,
		type CatalogPackage,
		type DelegatedClaimRecord,
		type LeadRow,
		type LeadStatus,
		type OperatorJobRecord,
		type OperatorJobState,
		type OperatorNodeRecord,
		type OperatorNodeStatus,
		type OperatorStatusResponse,
		type Platform,
		type PriorityLane,
		type SteeringProfile,
		type SuppressedTarget,
		type TakedownRecord
	} from 'vrc-packages-api';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Tabs from '$lib/components/ui/navigation/Tabs.svelte';
	import CatalogInitPanel from '$lib/components/admin/operator/CatalogInitPanel.svelte';
	import PoliciesPanel from '$lib/components/admin/operator/PoliciesPanel.svelte';
	import LeadsJobsPanel from '$lib/components/admin/operator/LeadsJobsPanel.svelte';
	import NodesPanel from '$lib/components/admin/operator/NodesPanel.svelte';
	import GovernancePanel from '$lib/components/admin/operator/GovernancePanel.svelte';
	import { cn } from '$lib/utils';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { KeyRound, RefreshCw } from '@lucide/svelte';

	const VALID_TABS = ['catalog', 'policies', 'leads', 'nodes', 'governance'] as const;
	type OperatorTabId = (typeof VALID_TABS)[number];

	let activeTab = $state<string>('catalog');
	let hasHydratedTab = $state(false);
	let isLoading = $state(false);
	let isLoadingNodes = $state(false);
	let isLoadingMoreNodes = $state(false);
	let isLoadingJobs = $state(false);
	let isLoadingMoreJobs = $state(false);
	let loadError = $state<string | null>(null);

	let operatorStatus = $state<OperatorStatusResponse | null>(null);
	let packages = $state<CatalogPackage[]>([]);
	let catalogCursor = $state<string | null>(null);
	let profiles = $state<SteeringProfile[]>([]);
	let suppressedTargets = $state<SuppressedTarget[]>([]);
	let leads = $state<LeadRow[]>([]);
	let leadStatusFilter = $state<LeadStatus>('pending_review');
	let jobs = $state<OperatorJobRecord[]>([]);
	let jobsNextCursor = $state<string | null>(null);
	let jobsStateFilter = $state<'all' | OperatorJobState>('all');
	let jobsPlatformFilter = $state<'all' | Platform>('all');
	let jobsPriorityFilter = $state<'all' | PriorityLane>('all');
	let nodes = $state<OperatorNodeRecord[]>([]);
	let nodesNextCursor = $state<string | null>(null);
	let nodesStatusFilter = $state<'all' | OperatorNodeStatus>('all');
	let takedowns = $state<TakedownRecord[]>([]);
	let claims = $state<DelegatedClaimRecord[]>([]);
	let apps = $state<AppCandidateRecord[]>([]);

	let hasOperatorSession = $derived(
		adminSession.authenticated && adminSession.role === 'operator' && adminSession.tokenValidation.valid
	);

	let envBadgeVariant = $derived<'amber' | 'sky' | 'danger' | 'neutral'>(
		operatorStatus?.environment === 'production'
			? 'danger'
			: operatorStatus?.environment === 'preview'
				? 'sky'
				: operatorStatus?.environment === 'development'
					? 'amber'
					: 'neutral'
	);

	let activeProfileCount = $derived(profiles.filter((p) => !p.disabledAt).length);
	let activeNodeCount = $derived(nodes.filter((n) => n.status === 'active').length);
	let claimableJobCount = $derived(operatorStatus?.queueReadiness.claimableJobs ?? jobs.filter((j) => j.claimabilityBlockers.length === 0).length);
	let blockedJobCount = $derived(operatorStatus?.queueReadiness.blockedJobs ?? jobs.filter((j) => j.claimabilityBlockers.length > 0).length);
	let pendingGovernanceCount = $derived(
		takedowns.filter((t) => t.reviewStatus === 'pending').length +
			claims.filter((c) => c.reviewStatus === 'pending').length
	);

	const operatorTabs = $derived([
		{ id: 'catalog', label: 'Catalog', count: packages.length },
		{ id: 'policies', label: 'Steering', count: activeProfileCount },
		{ id: 'leads', label: 'Leads & Jobs', count: leads.length + jobs.length },
		{ id: 'nodes', label: 'Nodes', count: nodes.length },
		{ id: 'governance', label: 'Governance', count: pendingGovernanceCount }
	]);

	onMount(() => {
		adminSession.hydrateFromSessionStorage();
		operatorStatus = adminSession.operatorStatus;
		const tabParam = new URLSearchParams(window.location.search).get('tab');
		if (tabParam && VALID_TABS.includes(tabParam as OperatorTabId)) {
			activeTab = tabParam;
		}
		hasHydratedTab = true;
		if (hasOperatorSession) {
			void refreshAllPlanes();
		}
	});

	$effect(() => {
		if (!hasHydratedTab || typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (url.searchParams.get('tab') !== activeTab) {
			url.searchParams.set('tab', activeTab);
			window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
		}
	});

	function isNotFoundError(err: unknown): boolean {
		if (err instanceof VRCPApiError) {
			return err.status === 404 || err.code === 'not_found';
		}
		const message = formatAdminError(err);
		return message.includes('HTTP 404') || message.includes('[not_found]');
	}

	function formatPlaneFailure(label: string, err: unknown, previewListing: boolean): string {
		const base = `${label}: ${formatAdminError(err)}`;
		if (previewListing && isNotFoundError(err)) {
			return `${base} (target Coordinator Worker may predate Version 0 routes)`;
		}
		return base;
	}

	async function refreshAllPlanes(notifyOnSuccess = false) {
		if (!hasOperatorSession) return;
		loadError = null;
		isLoading = true;
		try {
			const planes: {
				label: string;
				previewListing?: boolean;
				run: () => Promise<void>;
			}[] = [
				{
					label: 'Status',
					run: async () => {
						const res = await adminSession.client.operator.status();
						operatorStatus = res;
						adminSession.operatorStatus = res;
					}
				},
				{
					label: 'Catalog',
					run: async () => {
						const res = await adminSession.client.operator.catalog.list({ limit: 50 });
						packages = res.packages;
						catalogCursor = res.nextCursor;
					}
				},
				{
					label: 'Steering Profiles',
					run: async () => {
						const res = await adminSession.client.operator.steeringProfiles.list({ limit: 50 });
						profiles = res.profiles;
					}
				},
				{
					label: 'Suppressed Targets',
					run: async () => {
						const res = await adminSession.client.operator.suppressedTargets.list({ limit: 50 });
						suppressedTargets = res.targets;
					}
				},
				{
					label: 'Discovery Leads',
					run: async () => {
						const res = await adminSession.client.operator.leads.list({
							status: leadStatusFilter,
							limit: 50
						});
						leads = res.leads;
					}
				},
				{
					label: 'Crawl Jobs',
					previewListing: true,
					run: async () => {
						const res = await adminSession.client.operator.jobs.list({
							state: jobsStateFilter === 'all' ? undefined : jobsStateFilter,
							platform: jobsPlatformFilter === 'all' ? undefined : jobsPlatformFilter,
							priorityLane: jobsPriorityFilter === 'all' ? undefined : jobsPriorityFilter,
							limit: 50
						});
						jobs = res.jobs;
						jobsNextCursor = res.nextCursor;
					}
				},
				{
					label: 'Registered Nodes',
					previewListing: true,
					run: async () => {
						const res = await adminSession.client.operator.nodes.list({
							status: nodesStatusFilter === 'all' ? undefined : nodesStatusFilter,
							limit: 50
						});
						nodes = res.nodes;
						nodesNextCursor = res.nextCursor;
					}
				},
				{
					label: 'Takedowns',
					run: async () => {
						const res = await adminSession.client.operator.takedowns.list({ limit: 50 });
						takedowns = res.records;
					}
				},
				{
					label: 'Claims',
					run: async () => {
						const res = await adminSession.client.operator.claims.list({ limit: 50 });
						claims = res.records;
					}
				},
				{
					label: 'App Candidates',
					run: async () => {
						const res = await adminSession.client.operator.apps.list({ limit: 50 });
						apps = res.apps;
					}
				}
			];

			const results = await Promise.allSettled(planes.map((plane) => plane.run()));
			const errors: string[] = [];
			for (const [index, result] of results.entries()) {
				if (result.status === 'rejected') {
					const plane = planes[index];
					errors.push(
						formatPlaneFailure(plane.label, result.reason, Boolean(plane.previewListing))
					);
				}
			}
			if (errors.length > 0) {
				loadError = errors.join(' | ');
			} else if (notifyOnSuccess) {
				toastStore.success('Synchronized all operator planes.', 'Sync Complete');
			}
		} finally {
			isLoading = false;
		}
	}

	async function handleLeadFilterChange(nextStatus: LeadStatus) {
		leadStatusFilter = nextStatus;
		if (!hasOperatorSession) return;
		loadError = null;
		try {
			const res = await adminSession.client.operator.leads.list({
				status: nextStatus,
				limit: 50
			});
			leads = res.leads;
		} catch (err) {
			loadError = formatPlaneFailure('Discovery Leads', err, false);
		}
	}

	async function handleJobsFilterChange(
		nextState: 'all' | OperatorJobState,
		nextPlatform: 'all' | Platform,
		nextPriority: 'all' | PriorityLane
	) {
		jobsStateFilter = nextState;
		jobsPlatformFilter = nextPlatform;
		jobsPriorityFilter = nextPriority;
		if (!hasOperatorSession) return;
		loadError = null;
		isLoadingJobs = true;
		try {
			const res = await adminSession.client.operator.jobs.list({
				state: nextState === 'all' ? undefined : nextState,
				platform: nextPlatform === 'all' ? undefined : nextPlatform,
				priorityLane: nextPriority === 'all' ? undefined : nextPriority,
				limit: 50
			});
			jobs = res.jobs;
			jobsNextCursor = res.nextCursor;
		} catch (err) {
			loadError = formatPlaneFailure('Crawl Jobs', err, true);
		} finally {
			isLoadingJobs = false;
		}
	}

	async function handleLoadMoreJobs() {
		if (!hasOperatorSession || !jobsNextCursor) return;
		loadError = null;
		isLoadingMoreJobs = true;
		try {
			const res = await adminSession.client.operator.jobs.list({
				state: jobsStateFilter === 'all' ? undefined : jobsStateFilter,
				platform: jobsPlatformFilter === 'all' ? undefined : jobsPlatformFilter,
				priorityLane: jobsPriorityFilter === 'all' ? undefined : jobsPriorityFilter,
				limit: 50,
				cursor: jobsNextCursor
			});
			jobs = [...jobs, ...res.jobs];
			jobsNextCursor = res.nextCursor;
		} catch (err) {
			loadError = formatPlaneFailure('Crawl Jobs', err, true);
		} finally {
			isLoadingMoreJobs = false;
		}
	}

	async function handleNodeFilterChange(nextStatus: 'all' | OperatorNodeStatus) {
		nodesStatusFilter = nextStatus;
		if (!hasOperatorSession) return;
		loadError = null;
		isLoadingNodes = true;
		try {
			const res = await adminSession.client.operator.nodes.list({
				status: nextStatus === 'all' ? undefined : nextStatus,
				limit: 50
			});
			nodes = res.nodes;
			nodesNextCursor = res.nextCursor;
		} catch (err) {
			loadError = formatPlaneFailure('Registered Nodes', err, true);
		} finally {
			isLoadingNodes = false;
		}
	}

	async function handleLoadMoreNodes() {
		if (!hasOperatorSession || !nodesNextCursor) return;
		loadError = null;
		isLoadingMoreNodes = true;
		try {
			const res = await adminSession.client.operator.nodes.list({
				status: nodesStatusFilter === 'all' ? undefined : nodesStatusFilter,
				limit: 50,
				cursor: nodesNextCursor
			});
			nodes = [...nodes, ...res.nodes];
			nodesNextCursor = res.nextCursor;
		} catch (err) {
			loadError = formatPlaneFailure('Registered Nodes', err, true);
		} finally {
			isLoadingMoreNodes = false;
		}
	}
</script>

<div
	data-slot="operator-dashboard"
	class={cn(
		'h-full flex flex-col gap-3 p-4 sm:p-6 md:pl-24 overflow-y-auto',
		!loadError && hasOperatorSession && 'md:overflow-hidden'
	)}
>
	<header class="flex items-center justify-between gap-3 flex-wrap shrink-0">
		<div class="flex items-center gap-2.5 min-w-0 flex-wrap">
			<h1 class="text-lg font-semibold tracking-tight text-foreground text-balance">
				Operator Console
			</h1>
			<span class="hidden sm:inline-block text-xs font-mono text-muted-foreground truncate">
				{adminSession.coordinatorHostname}
			</span>
			{#if operatorStatus}
				<Badge variant={envBadgeVariant} size="xs">
					{operatorStatus.environment.toUpperCase()}
				</Badge>
				<Badge variant={operatorStatus.d1SchemaState === 'v0-17' ? 'emerald' : 'amber'} size="xs">
					{operatorStatus.d1SchemaState}
				</Badge>
			{/if}
		</div>

		{#if hasOperatorSession}
			<Button
				variant="primary"
				size="sm"
				busy={isLoading}
				onclick={() => void refreshAllPlanes(true)}
			>
				<RefreshCw size={14} />
				<span>{isLoading ? 'Syncing...' : 'Sync'}</span>
			</Button>
		{:else}
			<Button variant="primary" size="sm" href="/login">
				<KeyRound size={14} />
				<span>Sign In</span>
			</Button>
		{/if}
	</header>

	<section
		aria-label="Operator telemetry summary"
		class="grid grid-cols-2 lg:grid-cols-4 rounded-2xl border border-border bg-card divide-y sm:divide-y-0 sm:divide-x divide-border overflow-hidden shrink-0 shadow-xs"
	>
		<Button
			variant="ghost"
			size="sm"
			onclick={() => (activeTab = 'nodes')}
			class="h-auto w-full rounded-none px-4 py-2.5 flex-col items-start justify-start text-left gap-0.5 hover:bg-muted/40"
		>
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Active Nodes</span>
			<div class="flex items-center gap-2">
				<span
					class={cn(
						'size-2 rounded-full shrink-0',
						(operatorStatus?.queueReadiness.activeNodes ?? activeNodeCount) > 0 ? 'bg-sidebar-primary' : 'bg-muted-foreground/50'
					)}
				></span>
				<span class="text-base font-semibold text-foreground tabular-nums">
					{operatorStatus?.queueReadiness.activeNodes ?? activeNodeCount}
				</span>
				<span class="text-xs text-muted-foreground tabular-nums">/ {nodes.length} fleet</span>
			</div>
		</Button>

		<Button
			variant="ghost"
			size="sm"
			onclick={() => (activeTab = 'leads')}
			class="h-auto w-full rounded-none px-4 py-2.5 flex-col items-start justify-start text-left gap-0.5 hover:bg-muted/40"
		>
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Claimable Jobs</span>
			<div class="flex items-center gap-2">
				<span
					class={cn(
						'size-2 rounded-full shrink-0',
						blockedJobCount > 0 ? 'bg-warning' : claimableJobCount > 0 ? 'bg-chart-2' : 'bg-muted-foreground/50'
					)}
				></span>
				<span class="text-base font-semibold text-foreground tabular-nums">{claimableJobCount}</span>
				<span class="text-xs text-muted-foreground tabular-nums">/ {blockedJobCount} blocked</span>
			</div>
		</Button>

		<Button
			variant="ghost"
			size="sm"
			onclick={() => (activeTab = 'policies')}
			class="h-auto w-full rounded-none px-4 py-2.5 flex-col items-start justify-start text-left gap-0.5 hover:bg-muted/40"
		>
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Steering Profiles</span>
			<div class="flex items-center gap-2">
				<span
					class={cn(
						'size-2 rounded-full shrink-0',
						(operatorStatus?.queueReadiness.activeSteeringProfiles ?? activeProfileCount) > 0 ? 'bg-sidebar-primary' : 'bg-muted-foreground/50'
					)}
				></span>
				<span class="text-base font-semibold text-foreground tabular-nums">
					{operatorStatus?.queueReadiness.activeSteeringProfiles ?? activeProfileCount}
				</span>
				<span class="text-xs text-muted-foreground tabular-nums">/ {suppressedTargets.length} blocked</span>
			</div>
		</Button>

		<Button
			variant="ghost"
			size="sm"
			onclick={() => (activeTab = 'governance')}
			class="h-auto w-full rounded-none px-4 py-2.5 flex-col items-start justify-start text-left gap-0.5 hover:bg-muted/40"
		>
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Pending Triage</span>
			<div class="flex items-center gap-2">
				<span
					class={cn(
						'size-2 rounded-full shrink-0',
						(operatorStatus?.queueReadiness.pendingLeads ?? leads.length) + pendingGovernanceCount > 0
							? 'bg-warning'
							: 'bg-sidebar-primary'
					)}
				></span>
				<span class="text-base font-semibold text-foreground tabular-nums">
					{operatorStatus?.queueReadiness.pendingLeads ?? leads.length}
				</span>
				<span class="text-xs text-muted-foreground tabular-nums">leads / {pendingGovernanceCount} gov</span>
			</div>
		</Button>
	</section>

	{#if !hasOperatorSession}
		<Notice variant="warning" title="Operator sign-in required">
			Sign in with a 64-character hex operator token on <a href="/login" class="font-semibold underline">/login</a> to load live Coordinator state.
		</Notice>
	{/if}

	{#if loadError}
		<Notice variant="danger" title="Sync Failed">
			{loadError}
		</Notice>
	{/if}

	<Tabs bind:value={activeTab} items={operatorTabs}>
		{#if activeTab === 'catalog'}
			<CatalogInitPanel
				bind:packages
				bind:nextCursor={catalogCursor}
				{operatorStatus}
				isLoading={isLoading}
				onRefresh={() => refreshAllPlanes()}
			/>
		{:else if activeTab === 'policies'}
			<PoliciesPanel
				bind:profiles
				bind:suppressedTargets
				isLoading={isLoading}
				onRefresh={() => refreshAllPlanes()}
			/>
		{:else if activeTab === 'leads'}
			<LeadsJobsPanel
				bind:leads
				bind:leadStatusFilter
				bind:jobs
				bind:jobsNextCursor
				bind:jobsStateFilter
				bind:jobsPlatformFilter
				bind:jobsPriorityFilter
				isLoading={isLoading || isLoadingJobs}
				isLoadingMoreJobs={isLoadingMoreJobs}
				onFilterChange={handleLeadFilterChange}
				onJobsFilterChange={handleJobsFilterChange}
				onLoadMoreJobs={handleLoadMoreJobs}
				onRefresh={() => refreshAllPlanes()}
			/>
		{:else if activeTab === 'nodes'}
			<NodesPanel
				bind:nodes
				bind:statusFilter={nodesStatusFilter}
				bind:nextCursor={nodesNextCursor}
				isLoading={isLoading || isLoadingNodes}
				isLoadingMore={isLoadingMoreNodes}
				onFilterChange={handleNodeFilterChange}
				onLoadMore={handleLoadMoreNodes}
				onRefresh={() => refreshAllPlanes()}
			/>
		{:else}
			<GovernancePanel
				bind:takedowns
				bind:claims
				bind:apps
				isLoading={isLoading}
				onRefresh={() => refreshAllPlanes()}
			/>
		{/if}
	</Tabs>
</div>
