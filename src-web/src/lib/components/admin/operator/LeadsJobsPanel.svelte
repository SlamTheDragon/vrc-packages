<script lang="ts">
	import type { LeadRow, LeadStatus, Platform } from 'vrc-packages-api';
	import Card from '$lib/components/ui/display/Card.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Input from '$lib/components/ui/forms/Input.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import DataTable from '$lib/components/ui/telemetry/DataTable.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { Check, X, Send, RefreshCw } from '@lucide/svelte';

	let {
		leads = $bindable<LeadRow[]>([]),
		leadStatusFilter = $bindable<LeadStatus>('pending_review'),
		onFilterChange,
		onRefresh
	}: {
		leads?: LeadRow[];
		leadStatusFilter?: LeadStatus;
		onFilterChange?: (status: LeadStatus) => Promise<void>;
		onRefresh?: () => Promise<void>;
	} = $props();

	let selectedLeadKey = $state('');
	let approveDialogOpen = $state(false);
	let rejectDialogOpen = $state(false);
	let approveMinDelayMs = $state(2000);
	let approveReason = $state('Verified public metadata source under active profile');
	let rejectReason = $state('Out of scope or unapproved origin');
	let isTriaging = $state(false);

	let jobUrl = $state('https://vrchat-community.github.io/template-package/index.json');
	let jobPlatform = $state<Platform>('vpm');
	let jobPurpose = $state<'discovery' | 'metadata'>('discovery');
	let jobMinDelayMs = $state(2000);
	let jobReason = $state('Manual operator discovery queue dispatch');
	let isEnqueuing = $state(false);

	let statusMessage = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	let selectedLead = $derived(
		leads.find((l) => l.lead_key === selectedLeadKey) ?? leads[0] ?? null
	);

	const statusOptions = [
		{ value: 'pending_review', label: 'Pending Review (pending_review)' },
		{ value: 'approved', label: 'Approved (approved)' },
		{ value: 'rejected', label: 'Rejected (rejected)' }
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
		{ key: 'target_url', label: 'target_url' },
		{ key: 'claimed_package_id', label: 'claimed_package_id' },
		{ key: 'status', label: 'status' },
		{ key: 'first_seen_at', label: 'first_seen_at' }
	];

	async function handleApproveLead() {
		if (!selectedLead) return;
		errorMessage = null;
		statusMessage = null;
		isTriaging = true;
		try {
			const res = await adminSession.client.operator.leads.approve(selectedLead.lead_key, {
				minDelayMs: Number(approveMinDelayMs),
				reason: approveReason.trim()
			});
			statusMessage =
				res.status === 'approved'
					? `Approved lead ${res.leadKey.slice(0, 12)}... (enqueued jobId: ${res.jobId}).`
					: `Updated lead ${res.leadKey}.`;
			approveDialogOpen = false;
			await onRefresh?.();
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isTriaging = false;
		}
	}

	async function handleRejectLead() {
		if (!selectedLead) return;
		errorMessage = null;
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
			errorMessage = formatAdminError(err);
		} finally {
			isTriaging = false;
		}
	}

	async function handleEnqueueJob() {
		errorMessage = null;
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
			statusMessage = `Enqueued crawl job ${res.jobId} for ${jobUrl.trim()}.`;
			await onRefresh?.();
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isEnqueuing = false;
		}
	}
</script>

<div class="flex flex-col gap-6">
	{#if statusMessage}
		<Notice variant="success" title="Lead / Job Action Completed">
			{statusMessage}
		</Notice>
	{/if}

	{#if errorMessage}
		<Notice variant="danger" title="Lead / Job Action Failed">
			{errorMessage}
		</Notice>
	{/if}

	<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
		<div class="lg:col-span-8 flex flex-col gap-4">
			<Card
				title="Discovery Leads Triage (GET /v1/operator/leads)"
				eyebrow="CONTROL PLANE 3A // STRICT SNAKE_CASE WIRE DTOS (VISION.MD T06)"
			>
				{#snippet headerRight()}
					<div class="flex flex-wrap items-center gap-2">
						<div class="w-52">
							<DropdownSelect
								size="xs"
								bind:value={leadStatusFilter}
								options={statusOptions}
								onValueChange={(v) => onFilterChange?.(v as LeadStatus)}
							/>
						</div>
						<Button
							variant="primary"
							size="xs"
							disabled={!selectedLead}
							onclick={() => (approveDialogOpen = true)}
						>
							<Check size={12} />
							<span>Approve</span>
						</Button>
						<Button
							variant="destructive"
							size="xs"
							disabled={!selectedLead}
							onclick={() => (rejectDialogOpen = true)}
						>
							<X size={12} />
							<span>Reject</span>
						</Button>
					</div>
				{/snippet}

				{#if leads.length === 0}
					<EmptyState
						title={`No Leads with status "${leadStatusFilter}"`}
						description="Switch the status filter or run a discovery job to populate new discovery leads."
					/>
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

		<div class="lg:col-span-4 flex flex-col gap-4">
			{#if selectedLead}
				<PropertyInspector
					title="Lead Wire DTO Inspector"
					subtitle="Preserves strict snake_case fields without convenience aliases"
					properties={[
						{ key: 'lead_key', value: `${selectedLead.lead_key.slice(0, 18)}...`, category: 'Snake_Case DTO' },
						{ key: 'kind', value: selectedLead.kind, category: 'Snake_Case DTO' },
						{ key: 'status', value: selectedLead.status, category: 'Snake_Case DTO' },
						{ key: 'target_url', value: selectedLead.target_url, category: 'Origin' },
						{
							key: 'claimed_package_id',
							value: selectedLead.claimed_package_id ?? 'null',
							category: 'Origin'
						},
						{ key: 'discovered_from_url', value: selectedLead.discovered_from_url, category: 'Provenance' },
						{
							key: 'discovered_from_item_key',
							value: selectedLead.discovered_from_item_key ?? 'null',
							category: 'Provenance'
						},
						{ key: 'first_seen_at', value: selectedLead.first_seen_at, category: 'Timestamps' },
						{ key: 'last_seen_at', value: selectedLead.last_seen_at, category: 'Timestamps' }
					]}
				/>
			{/if}
		</div>
	</div>

	<Card
		title="Manual Crawl Job Enqueue (POST /v1/operator/jobs)"
		eyebrow="CONTROL PLANE 3B // CANDIDATE JOB DISPATCH"
	>
		{#snippet headerRight()}
			<Badge variant="amber" size="xs">REQUIRES SOURCE PROFILE</Badge>
		{/snippet}

		<div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
			<div class="md:col-span-5">
				<Field id="job-url" label="Target HTTPS URL" required={true}>
					<Input id="job-url" bind:value={jobUrl} />
				</Field>
			</div>
			<div class="md:col-span-2">
				<Field label="Platform" required={true}>
					<DropdownSelect
						bind:value={jobPlatform}
						options={platformOptions}
						onValueChange={(v) => (jobPlatform = v as Platform)}
					/>
				</Field>
			</div>
			<div class="md:col-span-2">
				<Field label="Purpose" required={true}>
					<DropdownSelect
						bind:value={jobPurpose}
						options={purposeOptions}
						onValueChange={(v) => (jobPurpose = v as 'discovery' | 'metadata')}
					/>
				</Field>
			</div>
			<div class="md:col-span-3">
				<Field id="job-delay" label="Min Delay (ms)" required={true}>
					<Input id="job-delay" type="number" min={0} bind:value={jobMinDelayMs} />
				</Field>
			</div>
			<div class="md:col-span-9">
				<Field id="job-reason" label="Audit Reason (1-300 chars)" required={true}>
					<Input id="job-reason" bind:value={jobReason} />
				</Field>
			</div>
			<div class="md:col-span-3 flex justify-end">
				<Button variant="primary" size="md" disabled={isEnqueuing} onclick={handleEnqueueJob} class="w-full">
					<Send size={14} />
					<span>{isEnqueuing ? 'Enqueuing...' : 'Enqueue Crawl Job'}</span>
				</Button>
			</div>
		</div>
	</Card>

	<Dialog
		bind:open={approveDialogOpen}
		title="Approve Discovery Lead"
		description={selectedLead ? `target_url: ${selectedLead.target_url}` : ''}
	>
		<div class="flex flex-col gap-3">
			<Field id="app-lead-delay" label="Minimum Origin Delay (ms)">
				<Input id="app-lead-delay" type="number" min={0} bind:value={approveMinDelayMs} />
			</Field>
			<Field id="app-lead-reason" label="Explicit Approval Reason (>=3 chars)" required={true}>
				<Textarea id="app-lead-reason" bind:value={approveReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (approveDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" disabled={isTriaging} onclick={handleApproveLead}>
				Approve &amp; Queue
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={rejectDialogOpen}
		title="Reject Discovery Lead"
		description={selectedLead ? `target_url: ${selectedLead.target_url}` : ''}
	>
		<Field id="rej-lead-reason" label="Explicit Rejection Reason (>=3 chars)" required={true}>
			<Textarea id="rej-lead-reason" bind:value={rejectReason} rows={2} />
		</Field>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (rejectDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="destructive" size="sm" disabled={isTriaging} onclick={handleRejectLead}>
				Reject Lead
			</Button>
		{/snippet}
	</Dialog>
</div>
