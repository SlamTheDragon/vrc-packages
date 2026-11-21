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
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Tabs from '$lib/components/ui/navigation/Tabs.svelte';
	import CatalogInitPanel from '$lib/components/admin/operator/CatalogInitPanel.svelte';
	import PoliciesPanel from '$lib/components/admin/operator/PoliciesPanel.svelte';
	import LeadsJobsPanel from '$lib/components/admin/operator/LeadsJobsPanel.svelte';
	import NodesPanel from '$lib/components/admin/operator/NodesPanel.svelte';
	import GovernancePanel from '$lib/components/admin/operator/GovernancePanel.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { KeyRound, RefreshCw } from '@lucide/svelte';

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
		{ id: 'catalog', label: 'Catalog', count: packages.length },
		{ id: 'policies', label: 'Policies', count: activeProfileCount },
		{ id: 'leads', label: 'Leads & Jobs', count: leads.length },
		{ id: 'nodes', label: 'Nodes' },
		{ id: 'governance', label: 'Governance', count: pendingGovernanceCount }
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

<div class="flex flex-col gap-8">
	<div class="flex items-start justify-between gap-4 flex-wrap">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl font-semibold tracking-tight text-slate-100 text-balance">
				Operator Console
			</h1>
			<p class="text-sm text-slate-400 text-pretty">
				Manage catalog projections, source policies, discovery leads, nodes, and governance.
			</p>
		</div>

		{#if hasOperatorSession}
			<Button
				variant="primary"
				size="sm"
				disabled={isLoading}
				onclick={() => void refreshAllPlanes()}
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
	</div>

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
		<div class="pt-2">
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
		</div>
	</Tabs>
</div>
