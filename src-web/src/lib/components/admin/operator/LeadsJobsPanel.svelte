<script lang="ts">
	import type {
		LeadRow,
		LeadStatus,
		OperatorJobRecord,
		OperatorJobState,
		Platform,
		PriorityLane
	} from 'vrc-packages-api';
	import {
		PLATFORM_OPTIONS,
		PRIORITY_LANE_OPTIONS,
		ROW_MENU_TRIGGER_CLASS,
		formatTimestamp,
		toPriorityLane,
		truncateText
	} from '$lib/components/admin/admin-constants';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
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
	import {
		Ban,
		Check,
		Pencil,
		Play,
		Send,
		Trash2,
		X,
		MoreHorizontal
	} from '@lucide/svelte';

	let {
		leads = $bindable<LeadRow[]>([]),
		leadStatusFilter = $bindable<LeadStatus>('pending_review'),
		jobs = $bindable<OperatorJobRecord[]>([]),
		jobsNextCursor = $bindable<string | null>(null),
		jobsStateFilter = $bindable<'all' | OperatorJobState>('all'),
		jobsPlatformFilter = $bindable<'all' | Platform>('all'),
		jobsPriorityFilter = $bindable<'all' | PriorityLane>('all'),
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
		jobsPriorityFilter?: 'all' | PriorityLane;
		isLoading?: boolean;
		isLoadingMoreJobs?: boolean;
		onFilterChange?: (status: LeadStatus) => Promise<void>;
		onJobsFilterChange?: (
			state: 'all' | OperatorJobState,
			platform: 'all' | Platform,
			priorityLane: 'all' | PriorityLane
		) => Promise<void>;
		onLoadMoreJobs?: () => Promise<void>;
		onRefresh?: () => Promise<void>;
	} = $props();

	let activeQueue = $state<'leads' | 'jobs'>('leads');
	let searchQuery = $state('');
	let leadKindFilter = $state('ALL');
	let page = $state(0);

	let selectedLeadKey = $state('');
	let selectedLeadKeys = $state<string[]>([]);
	let selectedPendingLeads = $derived(
		leads.filter((l) => selectedLeadKeys.includes(l.lead_key) && l.status === 'pending_review')
	);

	let selectedJobId = $state('');
	let selectedJobIds = $state<string[]>([]);
	let selectedUnleasedJobs = $derived(
		jobs.filter((j) => selectedJobIds.includes(j.jobId) && j.state !== 'leased')
	);

	let approveDialogOpen = $state(false);
	let rejectDialogOpen = $state(false);
	let suppressDomainDialogOpen = $state(false);
	let bulkApproveDialogOpen = $state(false);
	let bulkRejectDialogOpen = $state(false);
	let enqueueDialogOpen = $state(false);

	let approveMinDelayMs = $state(2000);
	let approveReason = $state('Verified public metadata source under active profile');
	let approveError = $state<string | null>(null);
	let rejectReason = $state('Out of scope or unapproved origin');
	let rejectError = $state<string | null>(null);

	let suppressHostTarget = $state('');
	let suppressHostReason = $state('Suppress out-of-scope or noisy domain host');
	let suppressHostError = $state<string | null>(null);
	let isTriaging = $state(false);

	let bulkApproveMinDelayMs = $state(2000);
	let bulkApproveLane = $state<string>('2');
	let bulkApproveReason = $state('Bulk approved verified public discovery leads');
	let bulkApproveError = $state<string | null>(null);
	let bulkRejectReason = $state('Out of scope or unapproved origin');
	let bulkRejectError = $state<string | null>(null);
	let isBulkTriaging = $state(false);

	let jobUrl = $state('https://vrchat-community.github.io/template-package/index.json');
	let jobPlatform = $state<Platform>('vpm');
	let jobPurpose = $state<'discovery' | 'metadata'>('discovery');
	let jobMinDelayMs = $state(2000);
	let jobPriorityLane = $state<string>('2');
	let jobReason = $state('Manual operator discovery queue dispatch');
	let enqueueError = $state<string | null>(null);
	let isEnqueuing = $state(false);

	let editJobDialogOpen = $state(false);
	let editJobLane = $state<string>('2');
	let editJobRecrawlMs = $state(21600000);
	let editJobNextFetchAt = $state('');
	let editJobReason = $state('Operator adjusted crawl priority and pacing');
	let editJobError = $state<string | null>(null);

	let requeueJobDialogOpen = $state(false);
	let requeueJobLane = $state<string>('1');
	let requeueJobReason = $state('Operator prioritized immediate re-dispatch');
	let requeueJobError = $state<string | null>(null);

	let deleteJobDialogOpen = $state(false);
	let deleteJobReason = $state('Operator removed unleased job');
	let deleteJobError = $state<string | null>(null);

	let bulkRequeueDialogOpen = $state(false);
	let bulkRequeueLane = $state<string>('1');
	let bulkRequeueReason = $state('Bulk requeue unleased crawl jobs');
	let bulkRequeueError = $state<string | null>(null);

	let bulkDeleteJobsDialogOpen = $state(false);
	let bulkDeleteJobsReason = $state('Bulk remove obsolete unleased crawl jobs');
	let bulkDeleteJobsError = $state<string | null>(null);

	let isMutatingJobs = $state(false);

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

	const jobPlatformFilterOptions = [
		{ value: 'all', label: 'All Platforms' },
		...PLATFORM_OPTIONS.map((o) => ({ value: o.value, label: o.value }))
	];

	const jobPriorityFilterOptions = [
		{ value: 'all', label: 'All Lanes' },
		...PRIORITY_LANE_OPTIONS
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
			label: 'Job State',
			value: jobsStateFilter,
			allValue: 'all',
			options: jobStateOptions,
			onChange: (val) => {
				page = 0;
				void onJobsFilterChange?.(val as 'all' | OperatorJobState, jobsPlatformFilter, jobsPriorityFilter);
			}
		},
		{
			id: 'jobPlatform',
			label: 'Platform',
			value: jobsPlatformFilter,
			allValue: 'all',
			options: jobPlatformFilterOptions,
			onChange: (val) => {
				page = 0;
				void onJobsFilterChange?.(jobsStateFilter, val as 'all' | Platform, jobsPriorityFilter);
			}
		},
		{
			id: 'jobPriority',
			label: 'Lane',
			value: jobsPriorityFilter === 'all' ? 'all' : String(jobsPriorityFilter),
			allValue: 'all',
			options: jobPriorityFilterOptions,
			onChange: (val) => {
				page = 0;
				const nextLane = val === 'all' ? 'all' : toPriorityLane(val);
				void onJobsFilterChange?.(jobsStateFilter, jobsPlatformFilter, nextLane);
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
				l.target_host.toLowerCase().includes(q) ||
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
				(j.steeringProfileId ?? '').toLowerCase().includes(q) ||
				j.claimabilityBlockers.some((b) => b.toLowerCase().includes(q))
			);
		});
	});

	let selectedLead = $derived(
		selectedLeadKey ? (leads.find((l) => l.lead_key === selectedLeadKey) ?? null) : null
	);
	let sameHostPendingCount = $derived(
		selectedLead
			? leads.filter((l) => l.status === 'pending_review' && l.target_host === selectedLead.target_host).length
			: 0
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

	const leadColumns = [
		{
			key: 'target_host',
			label: 'target_host',
			format: (v: unknown) => truncateText(v, 28)
		},
		{ key: 'kind', label: 'kind' },
		{
			key: 'target_url',
			label: 'target_url',
			format: (v: unknown) => truncateText(v, 40)
		},
		{ key: 'status', label: 'status' },
		{
			key: 'first_seen_at',
			label: 'first_seen_at',
			format: (v: unknown) => formatTimestamp(v)
		}
	];

	const jobColumns = [
		{ key: 'platform', label: 'Platform' },
		{
			key: 'priorityLane',
			label: 'Lane',
			format: (v: unknown) => `P${String(v ?? 3)}`
		},
		{ key: 'state', label: 'State' },
		{
			key: 'claimabilityBlockers',
			label: 'Blockers',
			align: 'right' as const,
			format: (v: unknown) => (Array.isArray(v) && v.length > 0 ? String(v.length) : '0')
		},
		{
			key: 'url',
			label: 'URL',
			format: (v: unknown) => truncateText(v, 40)
		},
		{
			key: 'nextFetchAt',
			label: 'Next Fetch',
			format: (v: unknown) => formatTimestamp(v)
		}
	];

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

	function openSuppressDomainDialog(targetHost: string) {
		suppressHostTarget = targetHost;
		suppressHostReason = `Suppress domain ${targetHost} and reject pending leads`;
		suppressHostError = null;
		suppressDomainDialogOpen = true;
	}

	function selectPendingByHost(targetHost: string) {
		const hostKeys = leads
			.filter((l) => l.status === 'pending_review' && l.target_host === targetHost)
			.map((l) => l.lead_key);
		selectedLeadKeys = Array.from(new Set([...selectedLeadKeys, ...hostKeys]));
		toastStore.info(`Selected ${hostKeys.length} pending lead(s) for ${targetHost}.`, 'Host Grouped');
	}

	function openEditJobDialog(job: OperatorJobRecord) {
		selectedJobId = job.jobId;
		editJobLane = String(job.priorityLane);
		editJobRecrawlMs = job.recrawlIntervalMs;
		editJobNextFetchAt = job.nextFetchAt;
		editJobReason = 'Operator adjusted crawl priority and pacing';
		editJobError = null;
		editJobDialogOpen = true;
	}

	function openRequeueJobDialog(job: OperatorJobRecord) {
		selectedJobId = job.jobId;
		requeueJobLane = '1';
		requeueJobReason = 'Operator prioritized immediate re-dispatch';
		requeueJobError = null;
		requeueJobDialogOpen = true;
	}

	function openDeleteJobDialog(job: OperatorJobRecord) {
		selectedJobId = job.jobId;
		deleteJobReason = 'Operator removed unleased job';
		deleteJobError = null;
		deleteJobDialogOpen = true;
	}

	async function handleApproveLead() {
		if (!selectedLead || approveReason.trim().length < 3) return;
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
		if (!selectedLead || rejectReason.trim().length < 3) return;
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

	async function handleSuppressHost() {
		if (!suppressHostTarget || suppressHostReason.trim().length < 3) return;
		suppressHostError = null;
		isTriaging = true;
		try {
			const res = await adminSession.client.operator.leads.suppressDomain({
				schemaVersion: 1,
				targetHost: suppressHostTarget,
				rejectPendingLeads: true,
				reason: suppressHostReason.trim()
			});
			suppressDomainDialogOpen = false;
			selectedLeadKeys = [];
			toastStore.success(
				`Suppressed domain ${res.targetHost} and rejected ${res.rejectedLeadCount} lead(s).`,
				'Domain Suppressed'
			);
			await onRefresh?.();
		} catch (err) {
			suppressHostError = formatAdminError(err);
		} finally {
			isTriaging = false;
		}
	}

	async function handleBulkApprove() {
		if (bulkApproveReason.trim().length < 3 || selectedPendingLeads.length === 0) return;
		bulkApproveError = null;
		isBulkTriaging = true;
		try {
			const res = await adminSession.client.operator.leads.bulkApprove({
				schemaVersion: 1,
				leadKeys: selectedPendingLeads.map((l) => l.lead_key),
				minDelayMs: Number(bulkApproveMinDelayMs),
				priorityLane: toPriorityLane(bulkApproveLane),
				reason: bulkApproveReason.trim()
			});
			bulkApproveDialogOpen = false;
			const approvedSet = new Set(res.approved.map((a) => a.leadKey));
			selectedLeadKeys = selectedLeadKeys.filter((k) => !approvedSet.has(k));
			toastStore.success(
				`Approved ${res.approved.length} lead(s)${res.skipped.length > 0 ? ` (${res.skipped.length} skipped)` : ''}.`,
				'Bulk Approval Complete'
			);
			await onRefresh?.();
		} catch (err) {
			bulkApproveError = formatAdminError(err);
		} finally {
			isBulkTriaging = false;
		}
	}

	async function handleBulkReject() {
		if (bulkRejectReason.trim().length < 3 || selectedPendingLeads.length === 0) return;
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
			} catch {
				failCount++;
			}
		}

		isBulkTriaging = false;
		bulkRejectDialogOpen = false;
		selectedLeadKeys = selectedLeadKeys.filter((k) => !rejectedKeys.includes(k));
		if (successCount > 0) toastStore.success(`Rejected ${successCount} lead(s).`, 'Bulk Rejection Complete');
		if (failCount > 0) toastStore.error(`Failed to reject ${failCount} lead(s).`, 'Bulk Partial Failure');
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
				priorityLane: toPriorityLane(jobPriorityLane),
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

	async function handleEditJob() {
		if (!selectedJob || editJobReason.trim().length < 3) return;
		editJobError = null;
		isMutatingJobs = true;
		try {
			const res = await adminSession.client.operator.jobs.update(selectedJob.jobId, {
				priorityLane: toPriorityLane(editJobLane),
				recrawlIntervalMs: Number(editJobRecrawlMs),
				nextFetchAt: editJobNextFetchAt.trim() || undefined,
				reason: editJobReason.trim()
			});
			editJobDialogOpen = false;
			toastStore.success(`Updated job ${res.job.jobId} (P${res.job.priorityLane}).`, 'Job Updated');
			await onRefresh?.();
		} catch (err) {
			editJobError = formatAdminError(err);
		} finally {
			isMutatingJobs = false;
		}
	}

	async function handleRequeueJob() {
		if (!selectedJob || requeueJobReason.trim().length < 3) return;
		requeueJobError = null;
		isMutatingJobs = true;
		try {
			const res = await adminSession.client.operator.jobs.requeue(selectedJob.jobId, {
				priorityLane: toPriorityLane(requeueJobLane),
				reason: requeueJobReason.trim()
			});
			requeueJobDialogOpen = false;
			toastStore.success(`Requeued job ${res.job.jobId} (P${res.job.priorityLane}).`, 'Job Requeued');
			await onRefresh?.();
		} catch (err) {
			requeueJobError = formatAdminError(err);
		} finally {
			isMutatingJobs = false;
		}
	}

	async function handleDeleteJob() {
		if (!selectedJob || deleteJobReason.trim().length < 3) return;
		deleteJobError = null;
		isMutatingJobs = true;
		try {
			const deletedId = selectedJob.jobId;
			await adminSession.client.operator.jobs.delete(deletedId, deleteJobReason.trim());
			deleteJobDialogOpen = false;
			if (selectedJobId === deletedId) selectedJobId = '';
			selectedJobIds = selectedJobIds.filter((id) => id !== deletedId);
			toastStore.success(`Deleted job ${deletedId}.`, 'Job Deleted');
			await onRefresh?.();
		} catch (err) {
			deleteJobError = formatAdminError(err);
		} finally {
			isMutatingJobs = false;
		}
	}

	async function handleBulkRequeueJobs() {
		if (selectedUnleasedJobs.length === 0 || bulkRequeueReason.trim().length < 3) return;
		bulkRequeueError = null;
		isMutatingJobs = true;
		let ok = 0;
		let fail = 0;
		for (const job of selectedUnleasedJobs) {
			try {
				await adminSession.client.operator.jobs.requeue(job.jobId, {
					priorityLane: toPriorityLane(bulkRequeueLane),
					reason: bulkRequeueReason.trim()
				});
				ok++;
			} catch {
				fail++;
			}
		}
		isMutatingJobs = false;
		bulkRequeueDialogOpen = false;
		selectedJobIds = [];
		if (ok > 0) toastStore.success(`Requeued ${ok} job(s).`, 'Bulk Requeue');
		if (fail > 0) toastStore.error(`Failed to requeue ${fail} job(s).`, 'Bulk Partial Failure');
		await onRefresh?.();
	}

	async function handleBulkDeleteJobs() {
		if (selectedUnleasedJobs.length === 0 || bulkDeleteJobsReason.trim().length < 3) return;
		bulkDeleteJobsError = null;
		isMutatingJobs = true;
		let ok = 0;
		let fail = 0;
		for (const job of selectedUnleasedJobs) {
			try {
				await adminSession.client.operator.jobs.delete(job.jobId, bulkDeleteJobsReason.trim());
				ok++;
			} catch {
				fail++;
			}
		}
		isMutatingJobs = false;
		bulkDeleteJobsDialogOpen = false;
		selectedJobIds = [];
		if (ok > 0) toastStore.success(`Deleted ${ok} job(s).`, 'Bulk Delete');
		if (fail > 0) toastStore.error(`Failed to delete ${fail} job(s).`, 'Bulk Partial Failure');
		await onRefresh?.();
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
			emptyDescription="Switch review status, clear search filters, or enqueue a manual crawl job."
			inspectorTitle={selectedLead?.target_host ?? 'Lead Inspector'}
			inspectorDescription={selectedLead?.lead_key}
		>
			{#snippet bulkActions()}
				<div class="flex items-center gap-2">
					{#if selectedPendingLeads.length > 0}
						<Button variant="primary" size="xs" onclick={() => { bulkApproveError = null; bulkApproveDialogOpen = true; }}>
							<Check size={13} />
							<span>Approve ({selectedPendingLeads.length})</span>
						</Button>
						<Button variant="destructive" size="xs" onclick={() => { bulkRejectError = null; bulkRejectDialogOpen = true; }}>
							<X size={13} />
							<span>Reject ({selectedPendingLeads.length})</span>
						</Button>
					{/if}
				</div>
			{/snippet}
			{#snippet toolbar()}
				<AdminFilterBar
					bind:searchQuery
					searchPlaceholder="Filter leads by key, host, URL, package ID, or origin..."
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
						<Button variant="secondary" size="sm" onclick={() => { enqueueError = null; enqueueDialogOpen = true; }}>
							<Send size={14} />
							<span>Enqueue Job</span>
						</Button>
					{/snippet}
				</AdminFilterBar>
			{/snippet}

			{#snippet rowActions(lead: LeadRow)}
				<div class="inline-flex items-center justify-end gap-1">
					<Button variant="ghost" size="xs" onclick={() => (selectedLeadKey = lead.lead_key)}>
						Inspect
					</Button>
					<DropdownMenu>
						{#snippet trigger()}
							<span aria-label={`Triage actions for ${lead.lead_key}`} class={ROW_MENU_TRIGGER_CLASS}>
								<MoreHorizontal size={14} />
							</span>
						{/snippet}
						<DropdownItem label="Inspect Lead" onclick={() => (selectedLeadKey = lead.lead_key)} />
						{#if lead.status === 'pending_review'}
							<DropdownItem label="Approve & Queue" onclick={() => openApproveDialog(lead)} />
							<DropdownItem label="Reject Lead" destructive={true} onclick={() => openRejectDialog(lead)} />
						{/if}
						<DropdownItem
							label={`Suppress Domain (${lead.target_host})`}
							destructive={true}
							onclick={() => openSuppressDomainDialog(lead.target_host)}
						/>
					</DropdownMenu>
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
							{ key: 'target_host', value: selectedLead.target_host, category: 'Origin' },
							{ key: 'target_url', value: selectedLead.target_url, category: 'Origin' },
							{ key: 'claimed_package_id', value: selectedLead.claimed_package_id ?? 'null', category: 'Origin' },
							{ key: 'discovered_from_url', value: selectedLead.discovered_from_url, category: 'Provenance' },
							{ key: 'discovered_from_item_key', value: selectedLead.discovered_from_item_key ?? 'null', category: 'Provenance' },
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
							<div class="w-full flex flex-col gap-2">
								{#if sameHostPendingCount > 1}
									<div class="flex items-center justify-between gap-2 text-xs">
										<Badge variant="sky" size="xs">{sameHostPendingCount} pending on {selectedLead.target_host}</Badge>
										<Button variant="ghost" size="xs" onclick={() => selectPendingByHost(selectedLead.target_host)}>
											Select all from host
										</Button>
									</div>
								{/if}
								<div class="w-full flex items-center justify-end gap-2 flex-wrap">
									<Button
										variant="destructive"
										size="sm"
										onclick={() => openSuppressDomainDialog(selectedLead.target_host)}
									>
										<Ban size={14} />
										<span>Suppress Domain</span>
									</Button>
									{#if selectedLead.status === 'pending_review'}
										<Button variant="destructive" size="sm" onclick={() => openRejectDialog()}>
											<X size={14} />
											<span>Reject</span>
										</Button>
										<Button variant="primary" size="sm" onclick={() => openApproveDialog()}>
											<Check size={14} />
											<span>Approve</span>
										</Button>
									{/if}
								</div>
							</div>
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
			selectable={true}
			bind:selectedIds={selectedJobIds}
			bind:page
			hasMore={Boolean(jobsNextCursor)}
			isLoadingMore={isLoadingMoreJobs}
			onLoadMore={onLoadMoreJobs}
			loading={isLoading}
			ariaLabel="Coordinator crawl jobs"
			emptyTitle="No crawl jobs"
			emptyDescription="Adjust state, platform, or lane facets, or enqueue a manual crawl job."
			inspectorTitle={selectedJob ? `${selectedJob.platform} (P${selectedJob.priorityLane}) · ${selectedJob.state}` : 'Crawl Job Details'}
			inspectorDescription={selectedJob?.jobId}
		>
			{#snippet bulkActions()}
				<div class="flex items-center gap-2">
					{#if selectedUnleasedJobs.length > 0}
						<Button variant="primary" size="xs" onclick={() => { bulkRequeueError = null; bulkRequeueDialogOpen = true; }}>
							<Play size={13} />
							<span>Requeue ({selectedUnleasedJobs.length})</span>
						</Button>
						<Button variant="destructive" size="xs" onclick={() => { bulkDeleteJobsError = null; bulkDeleteJobsDialogOpen = true; }}>
							<Trash2 size={13} />
							<span>Delete ({selectedUnleasedJobs.length})</span>
						</Button>
					{/if}
				</div>
			{/snippet}

			{#snippet toolbar()}
				<AdminFilterBar
					bind:searchQuery
					searchPlaceholder="Filter jobs by ID, origin, URL, steering ID, or blocker..."
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
						<Button variant="primary" size="sm" onclick={() => { enqueueError = null; enqueueDialogOpen = true; }}>
							<Send size={14} />
							<span>Enqueue Job</span>
						</Button>
					{/snippet}
				</AdminFilterBar>
			{/snippet}

			{#snippet rowActions(job: OperatorJobRecord)}
				<div class="inline-flex items-center justify-end gap-1">
					<Button variant="ghost" size="xs" onclick={() => (selectedJobId = job.jobId)}>
						Inspect
					</Button>
					{#if job.state !== 'leased'}
						<DropdownMenu>
							{#snippet trigger()}
								<span aria-label={`Actions for job ${job.jobId}`} class={ROW_MENU_TRIGGER_CLASS}>
									<MoreHorizontal size={14} />
								</span>
							{/snippet}
							<DropdownItem label="Inspect Job" onclick={() => (selectedJobId = job.jobId)} />
							<DropdownItem label="Run Now / Requeue" onclick={() => openRequeueJobDialog(job)} />
							<DropdownItem label="Edit Pacing / Lane" onclick={() => openEditJobDialog(job)} />
							<DropdownItem label="Delete Job" destructive={true} onclick={() => openDeleteJobDialog(job)} />
						</DropdownMenu>
					{/if}
				</div>
			{/snippet}

			{#snippet inspector()}
				{#if selectedJob}
					<PropertyInspector
						embedded={true}
						title="Crawl Job Details"
						subtitle={selectedJob.jobId}
						properties={[
							{ key: 'origin', value: selectedJob.origin, category: 'Job' },
							{ key: 'url', value: selectedJob.url, category: 'Job' },
							{ key: 'platform', value: selectedJob.platform, category: 'Job' },
							{ key: 'priorityLane', value: `P${selectedJob.priorityLane}`, category: 'Job' },
							{ key: 'state', value: selectedJob.state, category: 'Job' },
							{ key: 'purpose', value: selectedJob.purpose, category: 'Job' },
							{ key: 'recrawlIntervalMs', value: selectedJob.recrawlIntervalMs, category: 'Pacing' },
							{ key: 'paginationDepth', value: selectedJob.paginationDepth, category: 'Pacing' },
							{ key: 'claimedBy', value: selectedJob.claimedBy ?? 'unclaimed', category: 'Lease' },
							{ key: 'leaseExpiresAt', value: selectedJob.leaseExpiresAt ?? 'none', category: 'Lease' },
							{ key: 'nextFetchAt', value: selectedJob.nextFetchAt, category: 'Lease' },
							{ key: 'robotsDeferredUntil', value: selectedJob.robotsDeferredUntil ?? 'none', category: 'Lease' },
							{ key: 'steeringProfileId', value: selectedJob.steeringProfileId ?? 'none', category: 'Provenance' },
							{
								key: 'claimabilityBlockers',
								value: selectedJob.claimabilityBlockers.join(', ') || 'none',
								category: 'Diagnostics'
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

						{#snippet footerActions()}
							{#if selectedJob.state !== 'leased'}
								<div class="w-full flex items-center justify-end gap-2 flex-wrap">
									<Button variant="secondary" size="sm" onclick={() => openEditJobDialog(selectedJob)}>
										<Pencil size={14} />
										<span>Edit</span>
									</Button>
									<Button variant="primary" size="sm" onclick={() => openRequeueJobDialog(selectedJob)}>
										<Play size={14} />
										<span>Run Now</span>
									</Button>
									<Button variant="destructive" size="sm" onclick={() => openDeleteJobDialog(selectedJob)}>
										<Trash2 size={14} />
										<span>Delete</span>
									</Button>
								</div>
							{/if}
						{/snippet}
					</PropertyInspector>
				{/if}
			{/snippet}
		</AdminMasterDetail>
	{/if}

	<Dialog
		bind:open={enqueueDialogOpen}
		title="Enqueue Crawl Job"
		description="Dispatches POST /v1/operator/jobs."
	>
		<div class="flex flex-col gap-3">
			{#if enqueueError}
				<Notice variant="danger" title="Enqueue Failed">
					{enqueueError}
				</Notice>
			{/if}
			<Field id="job-url" label="Target HTTPS URL" required={true}>
				<Input id="job-url" bind:value={jobUrl} />
			</Field>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Field label="Platform" required={true}>
					<DropdownSelect
						bind:value={jobPlatform}
						options={PLATFORM_OPTIONS}
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
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Field id="job-delay" label="Min Delay (ms)" required={true}>
					<Input id="job-delay" type="number" min={0} bind:value={jobMinDelayMs} />
				</Field>
				<Field label="Priority Lane">
					<DropdownSelect
						bind:value={jobPriorityLane}
						options={PRIORITY_LANE_OPTIONS}
						onValueChange={(v) => (jobPriorityLane = v)}
					/>
				</Field>
			</div>
			<Field id="job-reason" label="Audit Reason (1-300 chars)" required={true}>
				<Input id="job-reason" bind:value={jobReason} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" disabled={isEnqueuing} onclick={() => (enqueueDialogOpen = false)}>
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
			<Button variant="secondary" size="sm" disabled={isTriaging} onclick={() => (approveDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={isTriaging}
				ariaDisabled={approveReason.trim().length < 3}
				onclick={handleApproveLead}
			>
				Approve & Queue
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
			<Button variant="secondary" size="sm" disabled={isTriaging} onclick={() => (rejectDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isTriaging}
				ariaDisabled={rejectReason.trim().length < 3}
				onclick={handleRejectLead}
			>
				Reject Lead
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={suppressDomainDialogOpen}
		alert={true}
		title="Suppress Lead Domain"
		description={`Block ${suppressHostTarget} in suppressed_targets and reject matching pending leads.`}
	>
		<div class="flex flex-col gap-3">
			{#if suppressHostError}
				<Notice variant="danger" title="Domain Suppression Failed">
					{suppressHostError}
				</Notice>
			{/if}
			<Field id="sup-host-reason" label="Audit Reason (>=3 chars)" required={true}>
				<Textarea id="sup-host-reason" bind:value={suppressHostReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" disabled={isTriaging} onclick={() => (suppressDomainDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isTriaging}
				ariaDisabled={suppressHostReason.trim().length < 3}
				onclick={handleSuppressHost}
			>
				Suppress Domain
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={bulkApproveDialogOpen}
		title="Bulk Approve Discovery Leads"
		description={`Batch approve ${selectedPendingLeads.length} pending lead(s) via /v1/operator/leads/bulk-approve.`}
	>
		<div class="flex flex-col gap-3">
			{#if bulkApproveError}
				<Notice variant="danger" title="Bulk Approval Failed">
					{bulkApproveError}
				</Notice>
			{/if}
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Field id="bulk-app-lead-delay" label="Minimum Delay (ms)">
					<Input id="bulk-app-lead-delay" type="number" min={0} bind:value={bulkApproveMinDelayMs} />
				</Field>
				<Field label="Priority Lane">
					<DropdownSelect
						bind:value={bulkApproveLane}
						options={PRIORITY_LANE_OPTIONS}
						onValueChange={(v) => (bulkApproveLane = v)}
					/>
				</Field>
			</div>
			<Field id="bulk-app-lead-reason" label="Approval Reason (>=3 chars)" required={true}>
				<Textarea id="bulk-app-lead-reason" bind:value={bulkApproveReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" disabled={isBulkTriaging} onclick={() => (bulkApproveDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={isBulkTriaging}
				ariaDisabled={bulkApproveReason.trim().length < 3 || selectedPendingLeads.length === 0}
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
			<Button variant="secondary" size="sm" disabled={isBulkTriaging} onclick={() => (bulkRejectDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isBulkTriaging}
				ariaDisabled={bulkRejectReason.trim().length < 3 || selectedPendingLeads.length === 0}
				onclick={handleBulkReject}
			>
				{isBulkTriaging ? 'Rejecting...' : `Reject (${selectedPendingLeads.length})`}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={editJobDialogOpen}
		title="Edit Crawl Job"
		description={`Job ID: ${selectedJobId}`}
	>
		<div class="flex flex-col gap-3">
			{#if editJobError}
				<Notice variant="danger" title="Job Update Failed">
					{editJobError}
				</Notice>
			{/if}
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Field label="Priority Lane">
					<DropdownSelect
						bind:value={editJobLane}
						options={PRIORITY_LANE_OPTIONS}
						onValueChange={(v) => (editJobLane = v)}
					/>
				</Field>
				<Field id="edit-job-recrawl" label="Recrawl Interval (ms)">
					<Input id="edit-job-recrawl" type="number" min={60000} bind:value={editJobRecrawlMs} />
				</Field>
			</div>
			<Field id="edit-job-next" label="Next Fetch At (ISO-8601 UTC)">
				<Input id="edit-job-next" bind:value={editJobNextFetchAt} />
			</Field>
			<Field id="edit-job-reason" label="Audit Reason (>=3 chars)" required={true}>
				<Textarea id="edit-job-reason" bind:value={editJobReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" disabled={isMutatingJobs} onclick={() => (editJobDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={isMutatingJobs}
				ariaDisabled={editJobReason.trim().length < 3}
				onclick={handleEditJob}
			>
				Save Changes
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={requeueJobDialogOpen}
		title="Run Now / Requeue Job"
		description={`Reset backoff and schedule ${selectedJobId} immediately.`}
	>
		<div class="flex flex-col gap-3">
			{#if requeueJobError}
				<Notice variant="danger" title="Requeue Failed">
					{requeueJobError}
				</Notice>
			{/if}
			<Field label="Priority Lane">
				<DropdownSelect
					bind:value={requeueJobLane}
					options={PRIORITY_LANE_OPTIONS}
					onValueChange={(v) => (requeueJobLane = v)}
				/>
			</Field>
			<Field id="requeue-job-reason" label="Audit Reason (>=3 chars)" required={true}>
				<Textarea id="requeue-job-reason" bind:value={requeueJobReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" disabled={isMutatingJobs} onclick={() => (requeueJobDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={isMutatingJobs}
				ariaDisabled={requeueJobReason.trim().length < 3}
				onclick={handleRequeueJob}
			>
				Requeue Job
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={deleteJobDialogOpen}
		alert={true}
		title="Delete Crawl Job"
		description={`Delete unleased job ${selectedJobId}?`}
	>
		<div class="flex flex-col gap-3">
			{#if deleteJobError}
				<Notice variant="danger" title="Delete Failed">
					{deleteJobError}
				</Notice>
			{/if}
			<Field id="del-job-reason" label="Audit Reason (>=3 chars)" required={true}>
				<Textarea id="del-job-reason" bind:value={deleteJobReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" disabled={isMutatingJobs} onclick={() => (deleteJobDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isMutatingJobs}
				ariaDisabled={deleteJobReason.trim().length < 3}
				onclick={handleDeleteJob}
			>
				Delete Job
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={bulkRequeueDialogOpen}
		title="Bulk Requeue Crawl Jobs"
		description={`Requeue ${selectedUnleasedJobs.length} selected unleased job(s).`}
	>
		<div class="flex flex-col gap-3">
			{#if bulkRequeueError}
				<Notice variant="danger" title="Bulk Requeue Failed">
					{bulkRequeueError}
				</Notice>
			{/if}
			<Field label="Priority Lane">
				<DropdownSelect
					bind:value={bulkRequeueLane}
					options={PRIORITY_LANE_OPTIONS}
					onValueChange={(v) => (bulkRequeueLane = v)}
				/>
			</Field>
			<Field id="bulk-requeue-reason" label="Audit Reason (>=3 chars)" required={true}>
				<Textarea id="bulk-requeue-reason" bind:value={bulkRequeueReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" disabled={isMutatingJobs} onclick={() => (bulkRequeueDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={isMutatingJobs}
				ariaDisabled={bulkRequeueReason.trim().length < 3 || selectedUnleasedJobs.length === 0}
				onclick={handleBulkRequeueJobs}
			>
				{isMutatingJobs ? 'Requeuing...' : `Requeue (${selectedUnleasedJobs.length})`}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={bulkDeleteJobsDialogOpen}
		alert={true}
		title="Bulk Delete Crawl Jobs"
		description={`Delete ${selectedUnleasedJobs.length} selected unleased job(s).`}
	>
		<div class="flex flex-col gap-3">
			{#if bulkDeleteJobsError}
				<Notice variant="danger" title="Bulk Delete Failed">
					{bulkDeleteJobsError}
				</Notice>
			{/if}
			<Field id="bulk-del-jobs-reason" label="Audit Reason (>=3 chars)" required={true}>
				<Textarea id="bulk-del-jobs-reason" bind:value={bulkDeleteJobsReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" disabled={isMutatingJobs} onclick={() => (bulkDeleteJobsDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isMutatingJobs}
				ariaDisabled={bulkDeleteJobsReason.trim().length < 3 || selectedUnleasedJobs.length === 0}
				onclick={handleBulkDeleteJobs}
			>
				{isMutatingJobs ? 'Deleting...' : `Delete (${selectedUnleasedJobs.length})`}
			</Button>
		{/snippet}
	</Dialog>
</div>
