<script lang="ts">
	import type { LeadRow, LeadStatus } from 'vrc-packages-api';
	import type {
		OperatorJobRecord,
		OperatorJobState,
		Platform
	} from '$lib/api/admin-client';
	import Card from '$lib/components/ui/display/Card.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Input from '$lib/components/ui/forms/Input.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Skeleton from '$lib/components/ui/feedback/Skeleton.svelte';
	import ToggleGroup from '$lib/components/ui/navigation/ToggleGroup.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import DataTable from '$lib/components/ui/telemetry/DataTable.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { Check, X, Send, ChevronRight } from '@lucide/svelte';

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
	let selectedLeadKey = $state('');
	let selectedJobId = $state('');

	let approveDialogOpen = $state(false);
	let rejectDialogOpen = $state(false);
	let enqueueDialogOpen = $state(false);
	let approveMinDelayMs = $state(2000);
	let approveReason = $state('Verified public metadata source under active profile');
	let approveError = $state<string | null>(null);
	let rejectReason = $state('Out of scope or unapproved origin');
	let rejectError = $state<string | null>(null);
	let isTriaging = $state(false);

	let jobUrl = $state('https://vrchat-community.github.io/template-package/index.json');
	let jobPlatform = $state<Platform>('vpm');
	let jobPurpose = $state<'discovery' | 'metadata'>('discovery');
	let jobMinDelayMs = $state(2000);
	let jobReason = $state('Manual operator discovery queue dispatch');
	let enqueueError = $state<string | null>(null);
	let isEnqueuing = $state(false);

	let statusMessage = $state<string | null>(null);

	const queueOptions = $derived([
		{ value: 'leads', label: `Discovery Leads (${leads.length})` },
		{ value: 'jobs', label: `Crawl Jobs (${jobs.length})` }
	]);

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
		...platformOptions
	];

	const purposeOptions = [
		{ value: 'discovery', label: 'Discovery (discovery)' },
		{ value: 'metadata', label: 'Metadata (metadata)' }
	];

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

	function openApproveDialog() {
		approveError = null;
		approveDialogOpen = true;
	}

	function openRejectDialog() {
		rejectError = null;
		rejectDialogOpen = true;
	}

	async function handleApproveLead() {
		if (!selectedLead || !approveReasonValid) return;
		approveError = null;
		statusMessage = null;
		isTriaging = true;
		try {
			const res = await adminSession.client.operator.leads.approve(selectedLead.lead_key, {
				minDelayMs: Number(approveMinDelayMs),
				reason: approveReason.trim()
			});
			statusMessage =
				res.status === 'approved'
					? `Approved lead ${res.leadKey.slice(0, 12)}... (jobId: ${res.jobId}).`
					: `Updated lead ${res.leadKey}.`;
			approveDialogOpen = false;
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
		statusMessage = null;
		isTriaging = true;
		try {
			const res = await adminSession.client.operator.leads.reject(selectedLead.lead_key, {
				reason: rejectReason.trim()
			});
			statusMessage = `Rejected lead ${res.leadKey.slice(0, 12)}...`;
			rejectDialogOpen = false;
			await onRefresh?.();
		} catch (err) {
			rejectError = formatAdminError(err);
		} finally {
			isTriaging = false;
		}
	}

	async function handleEnqueueJob() {
		if (!enqueueFormValid) return;
		enqueueError = null;
		statusMessage = null;
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
			statusMessage = `Enqueued job ${res.jobId} for ${jobUrl.trim()}.`;
			enqueueDialogOpen = false;
			await onRefresh?.();
		} catch (err) {
			enqueueError = formatAdminError(err);
		} finally {
			isEnqueuing = false;
		}
	}
</script>

<div data-slot="leads-jobs-panel" class="flex flex-col gap-6">
	{#if statusMessage}
		<Notice variant="success" title="Updated">
			{statusMessage}
		</Notice>
	{/if}

	<div class="flex items-center justify-between gap-4 flex-wrap">
		<ToggleGroup
			bind:value={activeQueue}
			options={queueOptions}
			onValueChange={(v) => {
				if (v === 'leads' || v === 'jobs') activeQueue = v;
			}}
		/>
	</div>

	{#if activeQueue === 'leads'}
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
			<div class={selectedLead ? 'lg:col-span-8' : 'lg:col-span-12'}>
				<Card title="Discovery Leads">
					{#snippet headerRight()}
						<div class="flex flex-wrap items-center gap-2">
							<div class="w-40">
								<DropdownSelect
									size="xs"
									bind:value={leadStatusFilter}
									options={statusOptions}
									onValueChange={(v) => void onFilterChange?.(v as LeadStatus)}
								/>
							</div>
							<Button variant="secondary" size="xs" onclick={openEnqueueDialog}>
								<Send size={12} />
								<span>Enqueue Job</span>
							</Button>
						</div>
					{/snippet}

					{#if isLoading && leads.length === 0}
						<div class="flex flex-col gap-2" aria-busy="true" aria-label="Loading discovery leads">
							<Skeleton class="h-10 w-full" />
							<Skeleton class="h-10 w-full" />
							<Skeleton class="h-10 w-full" />
						</div>
					{:else if leads.length === 0}
						<EmptyState
							title={`No ${leadStatusFilter.replace('_', ' ')} leads`}
							description="Switch the status filter or enqueue a manual discovery job."
						>
							{#snippet action()}
								<Button variant="primary" size="sm" onclick={openEnqueueDialog}>
									<Send size={14} />
									<span>Enqueue Job</span>
								</Button>
							{/snippet}
						</EmptyState>
					{:else}
						<DataTable
							columns={leadColumns}
							data={leads}
							keyField="lead_key"
							bind:selectedId={selectedLeadKey}
						/>
					{/if}
				</Card>
			</div>

			{#if selectedLead}
				<div class="lg:col-span-4 flex flex-col gap-4">
					<PropertyInspector
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
					/>

					<Card variant="flat" class="p-4">
						<div class="flex items-center justify-between gap-2 flex-wrap">
							<div class="flex items-center gap-2 flex-wrap">
								{#if selectedLead.status === 'pending_review'}
									<Button variant="primary" size="sm" onclick={openApproveDialog}>
										<Check size={14} />
										<span>Approve</span>
									</Button>
									<Button variant="destructive" size="sm" onclick={openRejectDialog}>
										<X size={14} />
										<span>Reject</span>
									</Button>
								{/if}
							</div>

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
						</div>
					</Card>
				</div>
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
			<div class={selectedJob ? 'lg:col-span-8' : 'lg:col-span-12'}>
				<Card title="Crawl Jobs">
					{#snippet headerRight()}
						<div class="flex flex-wrap items-center gap-2">
							<div class="w-36">
								<DropdownSelect
									size="xs"
									bind:value={jobsStateFilter}
									options={jobStateOptions}
									onValueChange={(v) =>
										void onJobsFilterChange?.(v as 'all' | OperatorJobState, jobsPlatformFilter)}
								/>
							</div>
							<div class="w-44">
								<DropdownSelect
									size="xs"
									bind:value={jobsPlatformFilter}
									options={jobPlatformFilterOptions}
									onValueChange={(v) =>
										void onJobsFilterChange?.(jobsStateFilter, v as 'all' | Platform)}
								/>
							</div>
							<Button variant="primary" size="xs" onclick={openEnqueueDialog}>
								<Send size={12} />
								<span>Enqueue Job</span>
							</Button>
						</div>
					{/snippet}

					{#if isLoading && jobs.length === 0}
						<div class="flex flex-col gap-2" aria-busy="true" aria-label="Loading crawl jobs">
							<Skeleton class="h-10 w-full" />
							<Skeleton class="h-10 w-full" />
							<Skeleton class="h-10 w-full" />
						</div>
					{:else if jobs.length === 0}
						<EmptyState
							title="No crawl jobs"
							description="Adjust state or platform filters, or enqueue a manual crawl job."
						>
							{#snippet action()}
								<Button variant="primary" size="sm" onclick={openEnqueueDialog}>
									<Send size={14} />
									<span>Enqueue Job</span>
								</Button>
							{/snippet}
						</EmptyState>
					{:else}
						<DataTable
							columns={jobColumns}
							data={jobs}
							keyField="jobId"
							bind:selectedId={selectedJobId}
						/>
					{/if}

					{#if jobsNextCursor}
						<div class="mt-4 flex justify-end">
							<Button
								variant="secondary"
								size="sm"
								busy={isLoadingMoreJobs}
								onclick={() => void onLoadMoreJobs?.()}
							>
								<span>{isLoadingMoreJobs ? 'Loading...' : 'Load Next Page'}</span>
								<ChevronRight size={14} />
							</Button>
						</div>
					{/if}
				</Card>
			</div>

			{#if selectedJob}
				<div class="lg:col-span-4 flex flex-col gap-4">
					<PropertyInspector
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
					/>

					<div class="flex justify-end">
						<Button
							variant="ghost"
							size="xs"
							aria-label="Clear job selection"
							onclick={() => (selectedJobId = '')}
						>
							<X size={13} />
							<span>Clear Selection</span>
						</Button>
					</div>
				</div>
			{/if}
		</div>
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
</div>
