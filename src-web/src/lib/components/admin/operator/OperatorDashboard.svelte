<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		CatalogPackage,
		SourceAccessProfile,
		AutoQueueRule,
		LeadRow,
		LeadStatus,
		TakedownRecord
	} from 'vrc-packages-api';
	import type {
		DelegatedClaimRecord,
		AppCandidateRecord
	} from '$lib/api/admin-client';
	import StatCard from '$lib/components/ui/display/StatCard.svelte';
	import VRCPEmblem from '$lib/components/ui/display/VRCPEmblem.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import EvidenceBadge from '$lib/components/ui/feedback/EvidenceBadge.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Tabs from '$lib/components/ui/navigation/Tabs.svelte';
	import ObserverToolbar from '$lib/components/ui/telemetry/ObserverToolbar.svelte';
	import CatalogInitPanel from '$lib/components/admin/operator/CatalogInitPanel.svelte';
	import PoliciesPanel from '$lib/components/admin/operator/PoliciesPanel.svelte';
	import LeadsJobsPanel from '$lib/components/admin/operator/LeadsJobsPanel.svelte';
	import NodesPanel from '$lib/components/admin/operator/NodesPanel.svelte';
	import GovernancePanel from '$lib/components/admin/operator/GovernancePanel.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import {
		ShieldCheck,
		Package,
		Compass,
		FileCheck2,
		Scale,
		KeyRound,
		RefreshCw
	} from '@lucide/svelte';

	let activeTab = $state('catalog');
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);

	let packages = $state<CatalogPackage[]>([]);
	let catalogCursor = $state<string | null>(null);
	let profiles = $state<SourceAccessProfile[]>([]);
	let rules = $state<AutoQueueRule[]>([]);
	let leads = $state<LeadRow[]>([]);
	let leadStatusFilter = $state<LeadStatus>('pending_review');
	let takedowns = $state<TakedownRecord[]>([]);
	let claims = $state<DelegatedClaimRecord[]>([]);
	let apps = $state<AppCandidateRecord[]>([]);

	let hasOperatorSession = $derived(
		adminSession.authenticated && adminSession.role === 'operator' && adminSession.tokenValidation.valid
	);

	let activeProfileCount = $derived(profiles.filter((p) => !p.disabledAt).length);
	let pendingGovernanceCount = $derived(
		takedowns.filter((t) => t.reviewStatus === 'pending').length +
			claims.filter((c) => c.reviewStatus === 'pending').length
	);

	const operatorTabs = $derived([
		{ id: 'catalog', label: '1. Schema Init & Catalog', count: packages.length },
		{ id: 'policies', label: '2. Source Profiles & Rules', count: activeProfileCount },
		{ id: 'leads', label: '3. Discovery Leads & Jobs', count: leads.length },
		{ id: 'nodes', label: '4. Crawler Nodes' },
		{ id: 'governance', label: '5. Takedowns, Claims & Apps', count: pendingGovernanceCount }
	]);

	onMount(() => {
		adminSession.hydrateFromSessionStorage();
		if (hasOperatorSession) {
			void refreshAllPlanes();
		}
	});

	async function refreshAllPlanes() {
		if (!hasOperatorSession) return;
		loadError = null;
		isLoading = true;
		try {
			const [catRes, profRes, ruleRes, leadRes, tdRes, clRes, appRes] = await Promise.all([
				adminSession.client.operator.catalog.list({ limit: 50 }),
				adminSession.client.operator.sourceProfiles.list({ limit: 50 }),
				adminSession.client.operator.autoQueueRules.list({ limit: 50 }),
				adminSession.client.operator.leads.list({ status: leadStatusFilter, limit: 50 }),
				adminSession.client.operator.takedowns.list({ limit: 50 }),
				adminSession.client.operator.claims.list({ limit: 50 }),
				adminSession.client.operator.apps.list({ limit: 50 })
			]);
			packages = catRes.packages;
			catalogCursor = catRes.nextCursor;
			profiles = profRes.profiles;
			rules = ruleRes.rules;
			leads = leadRes.leads;
			takedowns = tdRes.records;
			claims = clRes.records;
			apps = appRes.apps;
		} catch (err) {
			loadError = formatAdminError(err);
		} finally {
			isLoading = false;
		}
	}

	async function handleLeadFilterChange(nextStatus: LeadStatus) {
		leadStatusFilter = nextStatus;
		if (!hasOperatorSession) return;
		try {
			const res = await adminSession.client.operator.leads.list({
				status: nextStatus,
				limit: 50
			});
			leads = res.leads;
		} catch (err) {
			loadError = formatAdminError(err);
		}
	}
</script>

<div class="page-stack">
	<div class="page-heading">
		<div class="flex items-center gap-3">
			<div class="p-2.5 rounded-2xl bg-emerald-950/70 border border-emerald-700/60">
				<VRCPEmblem size={28} color="#10b981" />
			</div>
			<div>
				<span class="eyebrow">OPERATOR GOVERNANCE CONSOLE // /operator</span>
				<h1 class="text-2xl font-bold tracking-tight text-slate-100">
					Coordinator Control Plane &amp; Fleet Governance
				</h1>
				<p class="text-xs text-slate-400 mt-0.5">
					Connected to <code class="font-mono text-emerald-400">{adminSession.coordinatorUrl}</code> via <code class="font-mono">{adminSession.pipelineInfo.sdkPackage}</code> ({adminSession.pipelineInfo.sdkChannel} channel).
				</p>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2.5">
			<ObserverToolbar
				onReset={() => void refreshAllPlanes()}
				onFilter={() => (activeTab = 'leads')}
			/>
			<EvidenceBadge state={adminSession.evidenceState} size="md" />
			{#if hasOperatorSession}
				<Button
					variant="secondary"
					size="sm"
					disabled={isLoading}
					onclick={() => void refreshAllPlanes()}
				>
					<RefreshCw size={14} />
					<span>{isLoading ? 'Syncing...' : 'Sync All Planes'}</span>
				</Button>
			{:else}
				<Button variant="primary" size="sm" href="/login">
					<KeyRound size={14} />
					<span>Sign In as Operator</span>
				</Button>
			{/if}
		</div>
	</div>

	{#if !hasOperatorSession}
		<Notice variant="warning" title="Operator Authentication Required (64-hex Secret)">
			You are currently browsing in read-only preview mode. Authenticate with an <code class="font-mono">OPERATOR_TOKEN</code> (64-character hex) on <a href="/login" class="font-semibold underline">/login</a> to load live Coordinator D1 state and execute governance mutations.
		</Notice>
	{/if}

	{#if loadError}
		<Notice variant="danger" title="Coordinator Sync Error">
			{loadError}
		</Notice>
	{/if}

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
		<StatCard
			label="Catalog Packages"
			value={packages.length}
			subtext="Canonical package projections"
			trend="GET /v1/operator/catalog"
			trendDirection="up"
			icon={Package}
		/>
		<StatCard
			label="Active Source Profiles"
			value={activeProfileCount}
			subtext={`${rules.length} auto-queue rules loaded`}
			trend="RFC 9309 + Profile Gate"
			trendDirection="neutral"
			icon={FileCheck2}
		/>
		<StatCard
			label="Discovery Leads"
			value={leads.length}
			subtext={`Filter: ${leadStatusFilter}`}
			trend="snake_case DTOs"
			trendDirection="neutral"
			icon={Compass}
		/>
		<StatCard
			label="Pending Takedowns & Claims"
			value={pendingGovernanceCount}
			subtext={`${apps.length} registered apps`}
			trend="Legal & Delegation"
			trendDirection={pendingGovernanceCount > 0 ? 'down' : 'up'}
			icon={Scale}
		/>
	</div>

	<Tabs bind:value={activeTab} items={operatorTabs}>
		{#if activeTab === 'catalog'}
			<CatalogInitPanel
				bind:packages
				bind:nextCursor={catalogCursor}
				onRefresh={refreshAllPlanes}
			/>
		{:else if activeTab === 'policies'}
			<PoliciesPanel
				bind:profiles
				bind:rules
				onRefresh={refreshAllPlanes}
			/>
		{:else if activeTab === 'leads'}
			<LeadsJobsPanel
				bind:leads
				bind:leadStatusFilter
				onFilterChange={handleLeadFilterChange}
				onRefresh={refreshAllPlanes}
			/>
		{:else if activeTab === 'nodes'}
			<NodesPanel />
		{:else}
			<GovernancePanel
				bind:takedowns
				bind:claims
				bind:apps
				onRefresh={refreshAllPlanes}
			/>
		{/if}
	</Tabs>
</div>
