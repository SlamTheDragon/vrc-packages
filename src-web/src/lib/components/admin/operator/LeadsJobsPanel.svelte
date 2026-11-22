<script lang="ts">
	import type { LeadRow, LeadStatus } from 'vrc-packages-api';
	import type {
		OperatorJobRecord,
		OperatorJobState,
		Platform
	} from '$lib/api/admin-client';
	import { cn } from '$lib/utils';
	import { CONTROL_HEIGHTS, COMPONENT_PRESETS } from '$lib/components/ui/tokens';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Input from '$lib/components/ui/forms/Input.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import ToggleGroup from '$lib/components/ui/navigation/ToggleGroup.svelte';
	import DropdownMenu from '$lib/components/ui/navigation/DropdownMenu.svelte';
	import DropdownItem from '$lib/components/ui/navigation/DropdownItem.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import AdminFilterBar, { type FacetGroup } from '$lib/components/admin/AdminFilterBar.svelte';
	import AdminMasterDetail from '$lib/components/admin/AdminMasterDetail.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { Check, X, Send, ChevronRight, MoreHorizontal } from '@lucide/svelte';

	let {
		leads = $bindable<LeadRow[]>([]),
		leadStatusFilter = $bindable<LeadStatus>('pending_review'),
		jobs = $bindable<OperatorJobRecord[]>([]),
		jobsNextCursor = $bindable<string | null>(null),
		jobsStateFilter = $bindable<'all' | OperatorJobState>('all'),
		jobsPlatformFilter = $bindable<'all' | Platform>('all'),
		isLoading = false,
		isLoadingMoreJobs = false,
		onFilterChange,
		onJobsFilterChange,
		onLoadMoreJobs,
		onRefresh
	}: {
		leads?: LeadRow[];
		leadStatusFilter?: LeadStatus;
		jobs?: OperatorJobRecord[];
		jobsNextCursor?: string | null;
		jobsStateFilter?: 'all' | OperatorJobState;
		jobsPlatformFilter?: 'all' | Platform;
		isLoading?: boolean;
		isLoadingMoreJobs?: boolean;
		onFilterChange?: (status: LeadStatus) => Promise<void>;
		onJobsFilterChange?: (
			state: 'all' | OperatorJobState,
			platform: 'all' | Platform
		) => Promise<void>;
		onLoadMoreJobs?: () => Promise<void>;
		onRefresh?: () => Promise<void>;
	} = $props();

	let activeQueue = $state<'leads' | 'jobs'>('leads');
	let searchQuery = $state('');
	let leadKindFilter = $state('ALL');
	let page = $state(0);

	let selectedLeadKey = $state('');
	let selectedJobId = $state('');
	let selectedLeadKeys = $state<string[]>([]);
	let selectedPendingLeads = $derived(
		leads.filter((l) => selectedLeadKeys.includes(l.lead_key) && l.status === 'pending_review')
	);

	let approveDialogOpen = $state(false);
	let rejectDialogOpen = $state(false);
	let enqueueDialogOpen = $state(false);
	let bulkApproveDialogOpen = $state(false);
	let bulkRejectDialogOpen = $state(false);

	let approveMinDelayMs = $state(2000);
	let approveReason = $state('Verified public metadata source under active profile');
	let approveError = $state<string | null>(null);
	let rejectReason = $state('Out of scope or unapproved origin');
	let rejectError = $state<string | null>(null);
	let isTriaging = $state(false);

	let bulkApproveMinDelayMs = $state(2000);
	let bulkApproveReason = $state('Verified public metadata source under active profile');
	let bulkApproveError = $state<string | null>(null);
	let bulkRejectReason = $state('Out of scope or unapproved origin');
	let bulkRejectError = $state<string | null>(null);
	let isBulkTriaging = $state(false);

	let jobUrl = $state('https://vrchat-community.github.io/template-package/index.json');
	let jobPlatform = $state<Platform>('vpm');
	let jobPurpose = $state<'discovery' | 'metadata'>('discovery');
	let jobMinDelayMs = $state(2000);
	let jobReason = $state('Manual operator discovery queue dispatch');
	let enqueueError = $state<string | null>(null);
	let isEnqueuing = $state(false);

	const queueOptions = $derived([
		{ value: 'leads', label: `Discovery Leads (${leads.length})` },
		{ value: 'jobs', label: `Crawl Jobs (${jobs.length})` }
	]);

	const statusOptions = [
		{ value: 'pending_review', label: 'Pending Review' },
		{ value: 'approved', label: 'Approved' },
		{ value: 'rejected', label: 'Rejected' }
	];

	const jobStateOptions = [
		{ value: 'all', label: 'All States' },
		{ value: 'pending', label: 'pending' },
		{ value: 'leased', label: 'leased' },
		{ value: 'done', label: 'done' },
		{ value: 'backoff', label: 'backoff' },
		{ value: 'blocked', label: 'blocked' }
	];

	const platformOptions = [
		{ value: 'vpm', label: 'VPM Registry (vpm)' },
		{ value: 'github', label: 'GitHub Repository (github)' },
		{ value: 'booth', label: 'BOOTH.pm (booth)' },
		{ value: 'gumroad', label: 'Gumroad (gumroad)' },
		{ value: 'jinxxy', label: 'Jinxxy (jinxxy)' },
		{ value: 'itch', label: 'itch.io (itch)' },
		{ value: 'curated', label: 'Curated (curated)' },
		{ value: 'shopify', label: 'Shopify (shopify)' },
		{ value: 'sellfy', label: 'Sellfy (sellfy)' },
		{ value: 'custom_domain', label: 'Custom Domain (custom_domain)' }
	];

	const jobPlatformFilterOptions = [
		{ value: 'all', label: 'All Platforms' },
		...platformOptions.map((o) => ({ value: o.value, label: o.value }))
	];

	const purposeOptions = [
		{ value: 'discovery', label: 'Discovery (discovery)' },
		{ value: 'metadata', label: 'Metadata (metadata)' }
	];

	const leadKindOptions = $derived.by(() => {
		const values = Array.from(new Set(leads.map((l) => l.kind))).sort();
		return [{ value: 'ALL', label: 'All Kinds' }, ...values.map((v) => ({ value: v, label: v }))];
	});

	const leadFacets = $derived<FacetGroup[]>([
		{
			id: 'leadStatus',
			label: 'Review Status (Coordinator)',
			value: leadStatusFilter,
			allValue: 'pending_review',
			options: statusOptions,
			onChange: (val) => {
				page = 0;
				void onFilterChange?.(val as LeadStatus);
			}
		},
		{
			id: 'leadKind',
			label: 'Lead Kind',
			value: leadKindFilter,
			allValue: 'ALL',
			options: leadKindOptions,
			onChange: (val) => {
				leadKindFilter = val;
				page = 0;
			}
		}
	]);

	const jobFacets = $derived<FacetGroup[]>([
		{
			id: 'jobState',
			label: 'Job State (Coordinator)',
			value: jobsStateFilter,
			allValue: 'all',
			options: jobStateOptions,
			onChange: (val) => {
				page = 0;
				void onJobsFilterChange?.(val as 'all' | OperatorJobState, jobsPlatformFilter);
			}
		},
		{
			id: 'jobPlatform',
			label: 'Platform (Coordinator)',
			value: jobsPlatformFilter,
			allValue: 'all',
			options: jobPlatformFilterOptions,
			onChange: (val) => {
				page = 0;
				void onJobsFilterChange?.(jobsStateFilter, val as 'all' | Platform);
			}
		}
	]);

	let filteredLeads = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return leads.filter((l) => {
			if (leadKindFilter !== 'ALL' && l.kind !== leadKindFilter) return false;
			if (!q) return true;
			return (
				l.lead_key.toLowerCase().includes(q) ||
				l.kind.toLowerCase().includes(q) ||
				l.target_url.toLowerCase().includes(q) ||
				(l.claimed_package_id ?? '').toLowerCase().includes(q) ||
				l.discovered_from_url.toLowerCase().includes(q) ||
				l.status.toLowerCase().includes(q)
			);
		});
	});

	let filteredJobs = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return jobs.filter((j) => {
			if (!q) return true;
			return (
				j.jobId.toLowerCase().includes(q) ||
				j.origin.toLowerCase().includes(q) ||
				j.url.toLowerCase().includes(q) ||
				j.platform.toLowerCase().includes(q) ||
				j.state.toLowerCase().includes(q) ||
				j.purpose.toLowerCase().includes(q) ||
				(j.claimedBy ?? '').toLowerCase().includes(q) ||
				(j.sourceRuleId ?? '').toLowerCase().includes(q)
			);
		});
	});

	let selectedLead = $derived(
		selectedLeadKey ? (leads.find((l) => l.lead_key === selectedLeadKey) ?? null) : null
	);
	let selectedJob = $derived(
		selectedJobId ? (jobs.find((j) => j.jobId === selectedJobId) ?? null) : null
	);

	let enqueueFormValid = $derived(
		jobUrl.trim().startsWith('https://') &&
			Number(jobMinDelayMs) >= 0 &&
			jobReason.trim().length >= 1 &&
			jobReason.trim().length <= 300
	);
	let approveReasonValid = $derived(approveReason.trim().length >= 3);
	let rejectReasonValid = $derived(rejectReason.trim().length >= 3);
	let bulkApproveReasonValid = $derived(bulkApproveReason.trim().length >= 3);
	let bulkRejectReasonValid = $derived(bulkRejectReason.trim().length >= 3);

	const leadColumns = [
		{
			key: 'lead_key',
			label: 'lead_key',
			format: (v: unknown) => (typeof v === 'string' ? `${v.slice(0, 12)}...` : '—')
		},
		{ key: 'kind', label: 'kind' },
		{
			key: 'target_url',
			label: 'target_url',
			format: (v: unknown) => truncateText(v, 44)
		},
		{ key: 'claimed_package_id', label: 'claimed_package_id' },
		{ key: 'status', label: 'status' },
		{
			key: 'first_seen_at',
			label: 'first_seen_at',
			format: (v: unknown) => formatTimestamp(v)
		}
	];

	const jobColumns = [
		{ key: 'platform', label: 'Platform' },
		{ key: 'state', label: 'State' },
		{ key: 'purpose', label: 'Purpose' },
		{
			key: 'url',
			label: 'URL',
			format: (v: unknown) => truncateText(v, 44)
		},
		{
			key: 'claimedBy',
			label: 'Claimed By',
			format: (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : '—')
		},
		{
			key: 'nextFetchAt',
			label: 'Next Fetch',
			format: (v: unknown) => formatTimestamp(v)
		}
	];

	function truncateText(value: unknown, maxLen: number): string {
		if (typeof value !== 'string' || value.length === 0) return '—';
		return value.length > maxLen ? `${value.slice(0, maxLen - 3)}...` : value;
	}

	function formatTimestamp(value: unknown, fallback = '—'): string {
		if (typeof value !== 'string' || value.length === 0) return fallback;
		return value.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
	}

	function openEnqueueDialog() {
		enqueueError = null;
		enqueueDialogOpen = true;
	}

	function openApproveDialog(lead?: LeadRow) {
		if (lead) selectedLeadKey = lead.lead_key;
		approveError = null;
		approveDialogOpen = true;
	}

	function openRejectDialog(lead?: LeadRow) {
		if (lead) selectedLeadKey = lead.lead_key;
		rejectError = null;
		rejectDialogOpen = true;
	}

	function openBulkApproveDialog() {
		bulkApproveReason = 'Verified public metadata source under active profile';
		bulkApproveError = null;
		bulkApproveDialogOpen = true;
	}

	function openBulkRejectDialog() {
		bulkRejectReason = 'Out of scope or unapproved origin';
		bulkRejectError = null;
		bulkRejectDialogOpen = true;
	}

	async function handleApproveLead() {
		if (!selectedLead || !approveReasonValid) return;
		approveError = null;
		isTriaging = true;
		try {
			const res = await adminSession.client.operator.leads.approve(selectedLead.lead_key, {
				minDelayMs: Number(approveMinDelayMs),
				reason: approveReason.trim()
			});
			approveDialogOpen = false;
			toastStore.success(
				res.status === 'approved'
					? `Approved lead ${res.leadKey.slice(0, 12)}... (jobId: ${res.jobId}).`
					: `Updated lead ${res.leadKey}.`,
				'Lead Approved'
			);
			await onRefresh?.();
		} catch (err) {
			approveError = formatAdminError(err);
		} finally {
			isTriaging = false;
		}
	}

	async function handleRejectLead() {
		if (!selectedLead || !rejectReasonValid) return;
		rejectError = null;
		isTriaging = true;
		try {
			const res = await adminSession.client.operator.leads.reject(selectedLead.lead_key, {
				reason: rejectReason.trim()
			});
			rejectDialogOpen = false;
			toastStore.success(`Rejected lead ${res.leadKey.slice(0, 12)}...`, 'Lead Rejected');
			await onRefresh?.();
		} catch (err) {
			rejectError = formatAdminError(err);
		} finally {
			isTriaging = false;
		}
	}

	async function handleBulkApprove() {
		if (!bulkApproveReasonValid || selectedPendingLeads.length === 0) return;
		bulkApproveError = null;
		isBulkTriaging = true;
		let successCount = 0;
		let failCount = 0;
		const targets = [...selectedPendingLeads];
		const approvedKeys: string[] = [];

		for (const lead of targets) {
			try {
				await adminSession.client.operator.leads.approve(lead.lead_key, {
					minDelayMs: Number(bulkApproveMinDelayMs),
					reason: bulkApproveReason.trim()
				});
				successCount++;
				approvedKeys.push(lead.lead_key);
			} catch (_) {
				failCount++;
			}
		}

		isBulkTriaging = false;
		bulkApproveDialogOpen = false;
		selectedLeadKeys = selectedLeadKeys.filter((k) => !approvedKeys.includes(k));

		if (successCount > 0) {
			toastStore.success(`Approved ${successCount} lead(s).`, 'Bulk Approval Complete');
		}
		if (failCount > 0) {
			toastStore.error(`Failed to approve ${failCount} lead(s).`, 'Bulk Partial Failure');
		}
		await onRefresh?.();
	}

	async function handleBulkReject() {
		if (!bulkRejectReasonValid || selectedPendingLeads.length === 0) return;
		bulkRejectError = null;
		isBulkTriaging = true;
		let successCount = 0;
		let failCount = 0;
		const targets = [...selectedPendingLeads];
		const rejectedKeys: string[] = [];

		for (const lead of targets) {
			try {
				await adminSession.client.operator.leads.reject(lead.lead_key, {
					reason: bulkRejectReason.trim()
				});
				successCount++;
				rejectedKeys.push(lead.lead_key);
			} catch (_) {
				failCount++;
			}
		}

		isBulkTriaging = false;
		bulkRejectDialogOpen = false;
		selectedLeadKeys = selectedLeadKeys.filter((k) => !rejectedKeys.includes(k));

		if (successCount > 0) {
			toastStore.success(`Rejected ${successCount} lead(s).`, 'Bulk Rejection Complete');
		}
		if (failCount > 0) {
			toastStore.error(`Failed to reject ${failCount} lead(s).`, 'Bulk Partial Failure');
		}
		await onRefresh?.();
	}

	async function handleEnqueueJob() {
		if (!enqueueFormValid) return;
		enqueueError = null;
		isEnqueuing = true;
		try {
			const res = await adminSession.client.operator.jobs.enqueue({
				schemaVersion: 1,
				url: jobUrl.trim(),
				platform: jobPlatform,
				purpose: jobPurpose,
				minDelayMs: Number(jobMinDelayMs),
				reason: jobReason.trim()
			});
			enqueueDialogOpen = false;
			toastStore.success(`Enqueued job ${res.jobId} for ${jobUrl.trim()}.`, 'Job Enqueued');
			await onRefresh?.();
		} catch (err) {
			enqueueError = formatAdminError(err);
		} finally {
			isEnqueuing = false;
		}
	}
</script>

<div data-slot="leads-jobs-panel" class="flex flex-col gap-3">
	{#if activeQueue === 'leads'}
		<AdminMasterDetail
			columns={leadColumns}
			data={filteredLeads}
			keyField="lead_key"
			bind:selectedId={selectedLeadKey}
			selectable={true}
			bind:selectedIds={selectedLeadKeys}
			bind:page
			loading={isLoading}
			ariaLabel="Discovery leads queue"
			emptyTitle={`No ${leadStatusFilter.replace('_', ' ')} leads`}
			emptyDescription="Switch the review status facet, clear search filters, or enqueue a manual crawl job."
			inspectorTitle={selectedLead?.kind ?? 'Lead Inspector'}
			inspectorDescription={selectedLead?.lead_key}
		>
			{#snippet bulkActions()}
				<div class="flex items-center gap-2">
					{#if selectedPendingLeads.length > 0}
						<Button
							variant="primary"
							size="xs"
							onclick={openBulkApproveDialog}
						>
							<Check size={13} />
							<span>Approve ({selectedPendingLeads.length})</span>
						</Button>
						<Button
							variant="destructive"
							size="xs"
							onclick={openBulkRejectDialog}
						>
							<X size={13} />
							<span>Reject ({selectedPendingLeads.length})</span>
						</Button>
					{/if}
				</div>
			{/snippet}
			{#snippet toolbar()}
				<AdminFilterBar
					bind:searchQuery
					searchPlaceholder="Filter leads by key, URL, package ID, or origin..."
					facets={leadFacets}
					resultCount={filteredLeads.length}
					totalCount={leads.length}
				>
					{#snippet extraControls()}
						<ToggleGroup
							bind:value={activeQueue}
							options={queueOptions}
							onValueChange={(v) => {
								if (v === 'leads' || v === 'jobs') {
									activeQueue = v;
									page = 0;
								}
							}}
						/>
					{/snippet}

					{#snippet actions()}
						<Button variant="secondary" size="sm" onclick={openEnqueueDialog}>
							<Send size={14} />
							<span>Enqueue Job</span>
						</Button>
					{/snippet}
				</AdminFilterBar>
			{/snippet}

			{#snippet emptyAction()}
				<Button variant="primary" size="sm" onclick={openEnqueueDialog}>
					<Send size={14} />
					<span>Enqueue Job</span>
				</Button>
			{/snippet}

			{#snippet rowActions(lead: LeadRow)}
				<div class="inline-flex items-center justify-end gap-1">
					<Button
						variant="ghost"
						size="xs"
						onclick={() => (selectedLeadKey = lead.lead_key)}
					>
						Inspect
					</Button>
					{#if lead.status === 'pending_review'}
						<DropdownMenu>
							{#snippet trigger()}
								<span
									aria-label={`Triage actions for ${lead.lead_key}`}
									class={cn(
										CONTROL_HEIGHTS.xs,
										COMPONENT_PRESETS.button.ghost,
										'inline-flex items-center justify-center px-1.5 rounded-lg'
									)}
								>
									<MoreHorizontal size={14} />
								</span>
							{/snippet}
							<DropdownItem label="Inspect Lead" onclick={() => (selectedLeadKey = lead.lead_key)} />
							<DropdownItem label="Approve & Queue" onclick={() => openApproveDialog(lead)} />
							<DropdownItem label="Reject Lead" destructive={true} onclick={() => openRejectDialog(lead)} />
						</DropdownMenu>
					{/if}
				</div>
			{/snippet}

			{#snippet inspector()}
				{#if selectedLead}
					<PropertyInspector
						embedded={true}
						title="Lead Wire DTO"
						subtitle={selectedLead.lead_key}
						properties={[
							{ key: 'kind', value: selectedLead.kind, category: 'DTO' },
							{ key: 'status', value: selectedLead.status, category: 'DTO' },
							{ key: 'target_url', value: selectedLead.target_url, category: 'Origin' },
							{
								key: 'claimed_package_id',
								value: selectedLead.claimed_package_id ?? 'null',
								category: 'Origin'
							},
							{
								key: 'discovered_from_url',
								value: selectedLead.discovered_from_url,
								category: 'Provenance'
							},
							{
								key: 'discovered_from_item_key',
								value: selectedLead.discovered_from_item_key ?? 'null',
								category: 'Provenance'
							},
							{ key: 'first_seen_at', value: selectedLead.first_seen_at, category: 'Timestamps' },
							{ key: 'last_seen_at', value: selectedLead.last_seen_at, category: 'Timestamps' }
						]}
					>
						{#snippet headerActions()}
							<Button
								variant="ghost"
								size="xs"
								aria-label="Clear lead selection"
								title="Clear lead selection"
								onclick={() => (selectedLeadKey = '')}
								class="min-w-7 px-1.5"
							>
								<X size={14} />
							</Button>
						{/snippet}

						{#snippet footerActions()}
							{#if selectedLead.status === 'pending_review'}
								<div class="w-full flex items-center justify-end gap-2 flex-wrap">
									<Button variant="destructive" size="sm" onclick={() => openRejectDialog()}>
										<X size={14} />
										<span>Reject</span>
									</Button>
									<Button variant="primary" size="sm" onclick={() => openApproveDialog()}>
										<Check size={14} />
										<span>Approve</span>
									</Button>
								</div>
							{/if}
						{/snippet}
					</PropertyInspector>
				{/if}
			{/snippet}
		</AdminMasterDetail>
	{:else}
		<AdminMasterDetail
			columns={jobColumns}
			data={filteredJobs}
			keyField="jobId"
			bind:selectedId={selectedJobId}
			bind:page
			loading={isLoading}
			ariaLabel="Coordinator crawl jobs"
			emptyTitle="No crawl jobs"
			emptyDescription="Adjust state or platform facets, clear filters, or enqueue a manual crawl job."
			inspectorTitle={selectedJob ? `${selectedJob.platform} · ${selectedJob.state}` : 'Crawl Job Details'}
			inspectorDescription={selectedJob?.jobId}
		>
			{#snippet toolbar()}
				<AdminFilterBar
					bind:searchQuery
					searchPlaceholder="Filter jobs by ID, origin, URL, or lease node..."
					facets={jobFacets}
					resultCount={filteredJobs.length}
					totalCount={jobs.length}
				>
					{#snippet extraControls()}
						<ToggleGroup
							bind:value={activeQueue}
							options={queueOptions}
							onValueChange={(v) => {
								if (v === 'leads' || v === 'jobs') {
									activeQueue = v;
									page = 0;
								}
							}}
						/>
					{/snippet}

					{#snippet actions()}
						<Button variant="primary" size="sm" onclick={openEnqueueDialog}>
							<Send size={14} />
							<span>Enqueue Job</span>
						</Button>
					{/snippet}
				</AdminFilterBar>
			{/snippet}

			{#snippet emptyAction()}
				<Button variant="primary" size="sm" onclick={openEnqueueDialog}>
					<Send size={14} />
					<span>Enqueue Job</span>
				</Button>
			{/snippet}

			{#snippet rowActions(job: OperatorJobRecord)}
				<Button
					variant="ghost"
					size="xs"
					onclick={() => (selectedJobId = job.jobId)}
				>
					Inspect
				</Button>
			{/snippet}

			{#snippet inspector()}
				{#if selectedJob}
					<PropertyInspector
						embedded={true}
						title="Crawl Job Details"
						subtitle={selectedJob.jobId}
						properties={[
							{ key: 'jobId', value: selectedJob.jobId, category: 'Job' },
							{ key: 'origin', value: selectedJob.origin, category: 'Job' },
							{ key: 'url', value: selectedJob.url, category: 'Job' },
							{ key: 'platform', value: selectedJob.platform, category: 'Job' },
							{ key: 'state', value: selectedJob.state, category: 'Job' },
							{ key: 'purpose', value: selectedJob.purpose, category: 'Job' },
							{ key: 'claimedBy', value: selectedJob.claimedBy ?? 'unclaimed', category: 'Lease' },
							{
								key: 'leaseExpiresAt',
								value: selectedJob.leaseExpiresAt ?? 'none',
								category: 'Lease'
							},
							{ key: 'nextFetchAt', value: selectedJob.nextFetchAt, category: 'Lease' },
							{
								key: 'robotsDeferredUntil',
								value: selectedJob.robotsDeferredUntil ?? 'none',
								category: 'Lease'
							},
							{
								key: 'sourceRuleId',
								value: selectedJob.sourceRuleId ?? 'none',
								category: 'Provenance'
							},
							{
								key: 'leaseProfileId',
								value: selectedJob.leaseProfileId ?? 'none',
								category: 'Provenance'
							},
							{ key: 'createdAt', value: selectedJob.createdAt, category: 'Provenance' }
						]}
					>
						{#snippet headerActions()}
							<Button
								variant="ghost"
								size="xs"
								aria-label="Clear job selection"
								title="Clear job selection"
								onclick={() => (selectedJobId = '')}
								class="min-w-7 px-1.5"
							>
								<X size={14} />
							</Button>
						{/snippet}
					</PropertyInspector>
				{/if}
			{/snippet}

			{#snippet paginationFooter()}
				{#if jobsNextCursor || filteredJobs.length > 50}
					<div class="flex items-center justify-between gap-3 flex-wrap">
						<span class="text-xs text-muted-foreground tabular-nums">
							{filteredJobs.length} matching job(s) loaded
						</span>
						<div class="flex items-center gap-2">
							{#if filteredJobs.length > 50}
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
									disabled={(page + 1) * 50 >= filteredJobs.length}
									onclick={() => (page = page + 1)}
								>
									Next Page
								</Button>
							{/if}
							{#if jobsNextCursor}
								<Button
									variant="secondary"
									size="xs"
									busy={isLoadingMoreJobs}
									onclick={() => void onLoadMoreJobs?.()}
								>
									<span>{isLoadingMoreJobs ? 'Loading...' : 'Load Next Page'}</span>
									<ChevronRight size={13} />
								</Button>
							{/if}
						</div>
					</div>
				{/if}
			{/snippet}
		</AdminMasterDetail>
	{/if}

	<Dialog
		bind:open={enqueueDialogOpen}
		title="Enqueue Crawl Job"
		description="Dispatches POST /v1/operator/jobs. Target URL must match an active SourceAccessProfile."
	>
		<div class="flex flex-col gap-3">
			{#if enqueueError}
				<Notice variant="danger" title="Enqueue Failed">
					{enqueueError}
				</Notice>
			{/if}

			<Notice variant="warning" title="Source Access Profile Required">
				The job will stay in <code class="font-mono">pending</code> state until a matching
				<strong>SourceAccessProfile</strong> exists for the target URL in the Policies panel.
				Create one before the crawler node can claim this job.
			</Notice>

			<Field id="job-url" label="Target HTTPS URL" required={true}>
				<Input id="job-url" bind:value={jobUrl} />
			</Field>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Field label="Platform" required={true}>
					<DropdownSelect
						bind:value={jobPlatform}
						options={platformOptions}
						onValueChange={(v) => (jobPlatform = v as Platform)}
					/>
				</Field>
				<Field label="Purpose" required={true}>
					<DropdownSelect
						bind:value={jobPurpose}
						options={purposeOptions}
						onValueChange={(v) => (jobPurpose = v as 'discovery' | 'metadata')}
					/>
				</Field>
			</div>
			<Field id="job-delay" label="Min Delay (ms)" required={true}>
				<Input id="job-delay" type="number" min={0} bind:value={jobMinDelayMs} />
			</Field>
			<Field id="job-reason" label="Audit Reason (1-300 chars)" required={true}>
				<Input id="job-reason" bind:value={jobReason} />
			</Field>
		</div>
		{#snippet actions()}
			<Button
				variant="secondary"
				size="sm"
				disabled={isEnqueuing}
				onclick={() => (enqueueDialogOpen = false)}
			>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={isEnqueuing}
				ariaDisabled={!enqueueFormValid}
				onclick={handleEnqueueJob}
			>
				<Send size={13} />
				<span>{isEnqueuing ? 'Enqueuing...' : 'Enqueue Job'}</span>
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={approveDialogOpen}
		title="Approve Discovery Lead"
		description={selectedLead ? selectedLead.target_url : ''}
	>
		<div class="flex flex-col gap-3">
			{#if approveError}
				<Notice variant="danger" title="Approval Failed">
					{approveError}
				</Notice>
			{/if}

			<Field id="app-lead-delay" label="Minimum Origin Delay (ms)">
				<Input id="app-lead-delay" type="number" min={0} bind:value={approveMinDelayMs} />
			</Field>
			<Field id="app-lead-reason" label="Approval Reason (>=3 chars)" required={true}>
				<Textarea id="app-lead-reason" bind:value={approveReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button
				variant="secondary"
				size="sm"
				disabled={isTriaging}
				onclick={() => (approveDialogOpen = false)}
			>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={isTriaging}
				ariaDisabled={!approveReasonValid}
				onclick={handleApproveLead}
			>
				{isTriaging ? 'Approving...' : 'Approve & Queue'}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={rejectDialogOpen}
		alert={true}
		title="Reject Discovery Lead"
		description={selectedLead ? selectedLead.target_url : ''}
	>
		<div class="flex flex-col gap-3">
			{#if rejectError}
				<Notice variant="danger" title="Rejection Failed">
					{rejectError}
				</Notice>
			{/if}

			<Field id="rej-lead-reason" label="Rejection Reason (>=3 chars)" required={true}>
				<Textarea id="rej-lead-reason" bind:value={rejectReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button
				variant="secondary"
				size="sm"
				disabled={isTriaging}
				onclick={() => (rejectDialogOpen = false)}
			>
				Cancel
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isTriaging}
				ariaDisabled={!rejectReasonValid}
				onclick={handleRejectLead}
			>
				{isTriaging ? 'Rejecting...' : 'Reject Lead'}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={bulkApproveDialogOpen}
		title="Bulk Approve Discovery Leads"
		description={`Queue crawl jobs for ${selectedPendingLeads.length} selected pending lead(s).`}
	>
		<div class="flex flex-col gap-3">
			{#if bulkApproveError}
				<Notice variant="danger" title="Bulk Approval Failed">
					{bulkApproveError}
				</Notice>
			{/if}

			<Field id="bulk-app-lead-delay" label="Minimum Origin Delay (ms)">
				<Input id="bulk-app-lead-delay" type="number" min={0} bind:value={bulkApproveMinDelayMs} />
			</Field>
			<Field id="bulk-app-lead-reason" label="Approval Reason (>=3 chars)" required={true}>
				<Textarea id="bulk-app-lead-reason" bind:value={bulkApproveReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button
				variant="secondary"
				size="sm"
				disabled={isBulkTriaging}
				onclick={() => (bulkApproveDialogOpen = false)}
			>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={isBulkTriaging}
				ariaDisabled={!bulkApproveReasonValid || selectedPendingLeads.length === 0}
				onclick={handleBulkApprove}
			>
				{isBulkTriaging ? 'Approving...' : `Approve (${selectedPendingLeads.length})`}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={bulkRejectDialogOpen}
		alert={true}
		title="Bulk Reject Discovery Leads"
		description={`Reject ${selectedPendingLeads.length} selected pending lead(s).`}
	>
		<div class="flex flex-col gap-3">
			{#if bulkRejectError}
				<Notice variant="danger" title="Bulk Rejection Failed">
					{bulkRejectError}
				</Notice>
			{/if}

			<Field id="bulk-rej-lead-reason" label="Rejection Reason (>=3 chars)" required={true}>
				<Textarea id="bulk-rej-lead-reason" bind:value={bulkRejectReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button
				variant="secondary"
				size="sm"
				disabled={isBulkTriaging}
				onclick={() => (bulkRejectDialogOpen = false)}
			>
				Cancel
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isBulkTriaging}
				ariaDisabled={!bulkRejectReasonValid || selectedPendingLeads.length === 0}
				onclick={handleBulkReject}
			>
				{isBulkTriaging ? 'Rejecting...' : `Reject (${selectedPendingLeads.length})`}
			</Button>
		{/snippet}
	</Dialog>
</div>
