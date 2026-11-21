<script lang="ts">
	import type { TakedownRecord } from 'vrc-packages-api';
	import type {
		DelegatedClaimRecord,
		AppCandidateRecord
	} from '$lib/api/admin-client';
	import { cn } from '$lib/utils';
	import { CONTROL_HEIGHTS, COMPONENT_PRESETS } from '$lib/components/ui/tokens';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Switch from '$lib/components/ui/forms/Switch.svelte';
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
	import { CheckCircle2, ShieldCheck, KeyRound, X, MoreHorizontal } from '@lucide/svelte';

	let {
		takedowns = $bindable<TakedownRecord[]>([]),
		claims = $bindable<DelegatedClaimRecord[]>([]),
		apps = $bindable<AppCandidateRecord[]>([]),
		isLoading = false,
		onRefresh
	}: {
		takedowns?: TakedownRecord[];
		claims?: DelegatedClaimRecord[];
		apps?: AppCandidateRecord[];
		isLoading?: boolean;
		onRefresh?: () => Promise<void>;
	} = $props();

	let activeQueue = $state<'takedowns' | 'claims' | 'apps'>('takedowns');
	let searchQuery = $state('');
	let statusFilter = $state('ALL');
	let page = $state(0);

	const queueOptions = $derived([
		{ value: 'takedowns', label: `Takedowns (${takedowns.length})` },
		{ value: 'claims', label: `Creator Claims (${claims.length})` },
		{ value: 'apps', label: `Applications (${apps.length})` }
	]);

	let selectedTakedownId = $state('');
	let takedownDialogOpen = $state(false);
	let takedownVerdict = $state<'accepted' | 'rejected'>('accepted');
	let takedownNotes = $state('Verified creator storefront ownership and processed delisting');
	let takedownError = $state<string | null>(null);

	let selectedClaimId = $state('');
	let claimDialogOpen = $state(false);
	let claimVerdict = $state<'accepted' | 'rejected'>('accepted');
	let claimNotes = $state('Verified delegated creator ownership attestation');
	let claimError = $state<string | null>(null);

	let selectedAppId = $state('');
	let appDialogOpen = $state(false);
	let appCandidateVerdict = $state<'none' | 'reviewed' | 'trusted'>('trusted');
	let appGrantDelegation = $state(false);
	let appReviewNotes = $state('Verified application compliance with LEGAL.md Section 10 covenants');
	let appError = $state<string | null>(null);

	let delegationDialogOpen = $state(false);
	let appDelegationAllowed = $state(true);
	let appDelegationReason = $state('Approved creator claim delegation authority');
	let delegationError = $state<string | null>(null);

	let isSubmitting = $state(false);

	const verdictOptions = [
		{ value: 'accepted', label: 'Accept (accepted)' },
		{ value: 'rejected', label: 'Reject (rejected)' }
	];

	const candidateVerdictOptions = [
		{ value: 'trusted', label: 'Trusted (trusted)' },
		{ value: 'reviewed', label: 'Reviewed (reviewed)' },
		{ value: 'none', label: 'None / Reset (none)' }
	];

	const statusFacets = $derived.by<FacetGroup[]>(() => {
		if (activeQueue === 'apps') {
			return [
				{
					id: 'candidateStatus',
					label: 'Candidate Status',
					value: statusFilter,
					allValue: 'ALL',
					options: [
						{ value: 'ALL', label: 'All Statuses' },
						{ value: 'none', label: 'none' },
						{ value: 'reviewed', label: 'reviewed' },
						{ value: 'trusted', label: 'trusted' }
					],
					onChange: (val) => {
						statusFilter = val;
						page = 0;
					}
				}
			];
		}
		return [
			{
				id: 'reviewStatus',
				label: 'Review Status',
				value: statusFilter,
				allValue: 'ALL',
				options: [
					{ value: 'ALL', label: 'All Statuses' },
					{ value: 'pending', label: 'pending' },
					{ value: 'accepted', label: 'accepted' },
					{ value: 'rejected', label: 'rejected' }
				],
				onChange: (val) => {
					statusFilter = val;
					page = 0;
				}
			}
		];
	});

	let filteredTakedowns = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return takedowns.filter((t) => {
			if (statusFilter !== 'ALL' && t.reviewStatus !== statusFilter) return false;
			if (!q) return true;
			return (
				t.takedownId.toLowerCase().includes(q) ||
				t.requesterType.toLowerCase().includes(q) ||
				(t.canonicalId ?? '').toLowerCase().includes(q) ||
				t.targetUrl.toLowerCase().includes(q) ||
				t.proofKind.toLowerCase().includes(q) ||
				t.reviewStatus.toLowerCase().includes(q)
			);
		});
	});

	let filteredClaims = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return claims.filter((c) => {
			if (statusFilter !== 'ALL' && c.reviewStatus !== statusFilter) return false;
			if (!q) return true;
			return (
				c.claimId.toLowerCase().includes(q) ||
				c.creatorId.toLowerCase().includes(q) ||
				c.frontUrl.toLowerCase().includes(q) ||
				c.appId.toLowerCase().includes(q) ||
				c.reviewStatus.toLowerCase().includes(q)
			);
		});
	});

	let filteredApps = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return apps.filter((a) => {
			if (statusFilter !== 'ALL' && a.candidateStatus !== statusFilter) return false;
			if (!q) return true;
			return (
				a.appId.toLowerCase().includes(q) ||
				a.appName.toLowerCase().includes(q) ||
				a.candidateStatus.toLowerCase().includes(q)
			);
		});
	});

	let selectedTakedown = $derived(
		selectedTakedownId ? (takedowns.find((t) => t.takedownId === selectedTakedownId) ?? null) : null
	);
	let selectedClaim = $derived(
		selectedClaimId ? (claims.find((c) => c.claimId === selectedClaimId) ?? null) : null
	);
	let selectedApp = $derived(
		selectedAppId ? (apps.find((a) => a.appId === selectedAppId) ?? null) : null
	);

	const takedownColumns = [
		{ key: 'requesterType', label: 'Requester' },
		{ key: 'canonicalId', label: 'Canonical ID' },
		{ key: 'targetUrl', label: 'Target URL' },
		{ key: 'proofKind', label: 'Proof' },
		{ key: 'reviewStatus', label: 'Status' },
		{ key: 'recordedAt', label: 'Recorded' }
	];

	const claimColumns = [
		{ key: 'creatorId', label: 'Creator ID' },
		{ key: 'frontUrl', label: 'Front URL' },
		{ key: 'appId', label: 'App ID' },
		{ key: 'reviewStatus', label: 'Status' },
		{ key: 'recordedAt', label: 'Recorded' }
	];

	const appColumns = [
		{ key: 'appName', label: 'App Name' },
		{ key: 'candidateStatus', label: 'Status' },
		{
			key: 'delegationAllowed',
			label: 'Delegation',
			format: (val: unknown) => (val ? 'Allowed' : 'No')
		},
		{ key: 'requestCount', label: 'Requests', align: 'right' as const },
		{ key: 'createdAt', label: 'Created' }
	];

	function switchQueue(next: string) {
		if (next === 'takedowns' || next === 'claims' || next === 'apps') {
			activeQueue = next;
			statusFilter = 'ALL';
			page = 0;
		}
	}

	function openVerifyTakedown(td: TakedownRecord) {
		selectedTakedownId = td.takedownId;
		takedownError = null;
		takedownDialogOpen = true;
	}

	function openVerifyClaim(claim: DelegatedClaimRecord) {
		selectedClaimId = claim.claimId;
		claimError = null;
		claimDialogOpen = true;
	}

	function openReviewApp(app: AppCandidateRecord) {
		selectedAppId = app.appId;
		appError = null;
		appDialogOpen = true;
	}

	function openDelegationDialog(app: AppCandidateRecord) {
		selectedAppId = app.appId;
		appDelegationAllowed = app.delegationAllowed;
		delegationError = null;
		delegationDialogOpen = true;
	}

	async function handleVerifyTakedown() {
		if (!selectedTakedownId) return;
		takedownError = null;
		isSubmitting = true;
		try {
			const res = await adminSession.client.operator.takedowns.verify(selectedTakedownId, {
				verdict: takedownVerdict,
				notes: takedownNotes.trim() || undefined
			});
			takedownDialogOpen = false;
			toastStore.success(`Takedown ${res.takedownId} verified as "${res.status}".`, 'Verdict Recorded');
			await onRefresh?.();
		} catch (err) {
			takedownError = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleVerifyClaim() {
		if (!selectedClaimId) return;
		claimError = null;
		isSubmitting = true;
		try {
			const res = await adminSession.client.operator.claims.verify(selectedClaimId, {
				verdict: claimVerdict,
				notes: claimNotes.trim() || undefined
			});
			claimDialogOpen = false;
			toastStore.success(`Claim ${res.claimId} verified as "${res.status}".`, 'Verdict Recorded');
			await onRefresh?.();
		} catch (err) {
			claimError = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleReviewAppCandidate() {
		if (!selectedAppId) return;
		appError = null;
		isSubmitting = true;
		try {
			const res = await adminSession.client.operator.apps.reviewCandidate(selectedAppId, {
				candidateStatus: appCandidateVerdict,
				grantDelegation: appGrantDelegation,
				notes: appReviewNotes.trim() || undefined
			});
			appDialogOpen = false;
			toastStore.success(
				`App ${res.appId} set to "${res.candidateStatus}" (delegation=${String(res.delegationAllowed)}).`,
				'Review Recorded'
			);
			await onRefresh?.();
		} catch (err) {
			appError = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleSetAppDelegation() {
		if (!selectedAppId) return;
		delegationError = null;
		isSubmitting = true;
		try {
			const res = await adminSession.client.operator.apps.setDelegation(selectedAppId, {
				delegationAllowed: appDelegationAllowed,
				reason: appDelegationReason.trim() || undefined
			});
			delegationDialogOpen = false;
			toastStore.success(
				`App ${res.appId} delegation set to ${String(res.delegationAllowed)}.`,
				'Delegation Updated'
			);
			await onRefresh?.();
		} catch (err) {
			delegationError = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div data-slot="governance-panel" class="flex flex-col gap-3">
	{#if activeQueue === 'takedowns'}
		<AdminMasterDetail
			columns={takedownColumns}
			data={filteredTakedowns}
			keyField="takedownId"
			bind:selectedId={selectedTakedownId}
			bind:page
			loading={isLoading}
			ariaLabel="Takedowns and opt-outs"
			emptyTitle="No takedown records"
			emptyDescription="Creator opt-outs and delisting requests appear here for verification."
			inspectorTitle={selectedTakedown?.canonicalId ?? 'Takedown Inspector'}
			inspectorDescription={selectedTakedown?.takedownId}
		>
			{#snippet toolbar()}
				<AdminFilterBar
					bind:searchQuery
					searchPlaceholder="Filter takedowns by ID, canonical ID, URL, or proof..."
					facets={statusFacets}
					resultCount={filteredTakedowns.length}
					totalCount={takedowns.length}
				>
					{#snippet extraControls()}
						<ToggleGroup
							bind:value={activeQueue}
							options={queueOptions}
							onValueChange={switchQueue}
						/>
					{/snippet}
				</AdminFilterBar>
			{/snippet}

			{#snippet rowActions(td: TakedownRecord)}
				<div class="inline-flex items-center justify-end gap-1">
					<Button
						variant="ghost"
						size="xs"
						onclick={() => (selectedTakedownId = td.takedownId)}
					>
						Inspect
					</Button>
					<DropdownMenu>
						{#snippet trigger()}
							<span
								aria-label={`Actions for takedown ${td.takedownId}`}
								class={cn(
									CONTROL_HEIGHTS.xs,
									COMPONENT_PRESETS.button.ghost,
									'inline-flex items-center justify-center px-1.5 rounded-lg'
								)}
							>
								<MoreHorizontal size={14} />
							</span>
						{/snippet}
						<DropdownItem label="Inspect Takedown" onclick={() => (selectedTakedownId = td.takedownId)} />
						<DropdownItem label="Verify Takedown" onclick={() => openVerifyTakedown(td)} />
					</DropdownMenu>
				</div>
			{/snippet}

			{#snippet inspector()}
				{#if selectedTakedown}
					<PropertyInspector
						embedded={true}
						title="Takedown Record"
						subtitle={selectedTakedown.takedownId}
						properties={[
							{ key: 'Requester Type', value: selectedTakedown.requesterType, category: 'Request' },
							{ key: 'Canonical ID', value: selectedTakedown.canonicalId ?? 'none', category: 'Request' },
							{ key: 'Target URL', value: selectedTakedown.targetUrl, category: 'Request' },
							{ key: 'Proof Kind', value: selectedTakedown.proofKind, category: 'Verification' },
							{ key: 'Review Status', value: selectedTakedown.reviewStatus, category: 'Verification' },
							{ key: 'Recorded At', value: selectedTakedown.recordedAt, category: 'Timestamps' }
						]}
					>
						{#snippet headerActions()}
							<Button
								variant="ghost"
								size="xs"
								aria-label="Close inspector"
								title="Close inspector"
								onclick={() => (selectedTakedownId = '')}
								class="min-w-7 px-1.5"
							>
								<X size={14} />
							</Button>
						{/snippet}

						{#snippet footerActions()}
							<div class="w-full flex justify-end">
								<Button variant="primary" size="sm" onclick={() => openVerifyTakedown(selectedTakedown)}>
									<CheckCircle2 size={14} />
									<span>Verify Takedown</span>
								</Button>
							</div>
						{/snippet}
					</PropertyInspector>
				{/if}
			{/snippet}
		</AdminMasterDetail>
	{:else if activeQueue === 'claims'}
		<AdminMasterDetail
			columns={claimColumns}
			data={filteredClaims}
			keyField="claimId"
			bind:selectedId={selectedClaimId}
			bind:page
			loading={isLoading}
			ariaLabel="Delegated creator claims"
			emptyTitle="No delegated creator claims"
			emptyDescription="Signed creator ownership attestations appear here for review."
			inspectorTitle={selectedClaim?.creatorId ?? 'Claim Inspector'}
			inspectorDescription={selectedClaim?.claimId}
		>
			{#snippet toolbar()}
				<AdminFilterBar
					bind:searchQuery
					searchPlaceholder="Filter claims by ID, creator, front URL, or app..."
					facets={statusFacets}
					resultCount={filteredClaims.length}
					totalCount={claims.length}
				>
					{#snippet extraControls()}
						<ToggleGroup
							bind:value={activeQueue}
							options={queueOptions}
							onValueChange={switchQueue}
						/>
					{/snippet}
				</AdminFilterBar>
			{/snippet}

			{#snippet rowActions(claim: DelegatedClaimRecord)}
				<div class="inline-flex items-center justify-end gap-1">
					<Button
						variant="ghost"
						size="xs"
						onclick={() => (selectedClaimId = claim.claimId)}
					>
						Inspect
					</Button>
					<DropdownMenu>
						{#snippet trigger()}
							<span
								aria-label={`Actions for claim ${claim.claimId}`}
								class={cn(
									CONTROL_HEIGHTS.xs,
									COMPONENT_PRESETS.button.ghost,
									'inline-flex items-center justify-center px-1.5 rounded-lg'
								)}
							>
								<MoreHorizontal size={14} />
							</span>
						{/snippet}
						<DropdownItem label="Inspect Claim" onclick={() => (selectedClaimId = claim.claimId)} />
						<DropdownItem label="Verify Claim" onclick={() => openVerifyClaim(claim)} />
					</DropdownMenu>
				</div>
			{/snippet}

			{#snippet inspector()}
				{#if selectedClaim}
					<PropertyInspector
						embedded={true}
						title="Delegated Creator Claim"
						subtitle={selectedClaim.claimId}
						properties={[
							{ key: 'Creator ID', value: selectedClaim.creatorId, category: 'Identity' },
							{ key: 'App ID', value: selectedClaim.appId, category: 'Identity' },
							{ key: 'Front URL', value: selectedClaim.frontUrl, category: 'Evidence' },
							{ key: 'Review Status', value: selectedClaim.reviewStatus, category: 'Verification' },
							{ key: 'Recorded At', value: selectedClaim.recordedAt, category: 'Timestamps' }
						]}
					>
						{#snippet headerActions()}
							<Button
								variant="ghost"
								size="xs"
								aria-label="Close inspector"
								title="Close inspector"
								onclick={() => (selectedClaimId = '')}
								class="min-w-7 px-1.5"
							>
								<X size={14} />
							</Button>
						{/snippet}

						{#snippet footerActions()}
							<div class="w-full flex justify-end">
								<Button variant="primary" size="sm" onclick={() => openVerifyClaim(selectedClaim)}>
									<ShieldCheck size={14} />
									<span>Verify Claim</span>
								</Button>
							</div>
						{/snippet}
					</PropertyInspector>
				{/if}
			{/snippet}
		</AdminMasterDetail>
	{:else}
		<AdminMasterDetail
			columns={appColumns}
			data={filteredApps}
			keyField="appId"
			bind:selectedId={selectedAppId}
			bind:page
			loading={isLoading}
			ariaLabel="Registered client applications"
			emptyTitle="No registered applications"
			emptyDescription="Applications registered via POST /v1/app/register appear here."
			inspectorTitle={selectedApp?.appName ?? 'Application Inspector'}
			inspectorDescription={selectedApp?.appId}
		>
			{#snippet toolbar()}
				<AdminFilterBar
					bind:searchQuery
					searchPlaceholder="Filter applications by name, ID, or candidate status..."
					facets={statusFacets}
					resultCount={filteredApps.length}
					totalCount={apps.length}
				>
					{#snippet extraControls()}
						<ToggleGroup
							bind:value={activeQueue}
							options={queueOptions}
							onValueChange={switchQueue}
						/>
					{/snippet}
				</AdminFilterBar>
			{/snippet}

			{#snippet rowActions(app: AppCandidateRecord)}
				<div class="inline-flex items-center justify-end gap-1">
					<Button
						variant="ghost"
						size="xs"
						onclick={() => (selectedAppId = app.appId)}
					>
						Inspect
					</Button>
					<DropdownMenu>
						{#snippet trigger()}
							<span
								aria-label={`Actions for app ${app.appName}`}
								class={cn(
									CONTROL_HEIGHTS.xs,
									COMPONENT_PRESETS.button.ghost,
									'inline-flex items-center justify-center px-1.5 rounded-lg'
								)}
							>
								<MoreHorizontal size={14} />
							</span>
						{/snippet}
						<DropdownItem label="Inspect Application" onclick={() => (selectedAppId = app.appId)} />
						<DropdownItem label="Review Candidate" onclick={() => openReviewApp(app)} />
						<DropdownItem label="Set Delegation" onclick={() => openDelegationDialog(app)} />
					</DropdownMenu>
				</div>
			{/snippet}

			{#snippet inspector()}
				{#if selectedApp}
					<PropertyInspector
						embedded={true}
						title="Registered Application"
						subtitle={selectedApp.appId}
						properties={[
							{ key: 'App Name', value: selectedApp.appName, category: 'Identity' },
							{ key: 'Candidate Status', value: selectedApp.candidateStatus, category: 'Trust' },
							{
								key: 'Delegation Allowed',
								value: selectedApp.delegationAllowed ? 'Yes' : 'No',
								category: 'Trust'
							},
							{ key: 'Request Count', value: selectedApp.requestCount, category: 'Telemetry' },
							{ key: 'Created At', value: selectedApp.createdAt, category: 'Timestamps' }
						]}
					>
						{#snippet headerActions()}
							<Button
								variant="ghost"
								size="xs"
								aria-label="Close inspector"
								title="Close inspector"
								onclick={() => (selectedAppId = '')}
								class="min-w-7 px-1.5"
							>
								<X size={14} />
							</Button>
						{/snippet}

						{#snippet footerActions()}
							<div class="w-full flex items-center justify-end gap-2 flex-wrap">
								<Button variant="secondary" size="sm" onclick={() => openDelegationDialog(selectedApp)}>
									<KeyRound size={14} />
									<span>Delegation</span>
								</Button>
								<Button variant="primary" size="sm" onclick={() => openReviewApp(selectedApp)}>
									<ShieldCheck size={14} />
									<span>Review Candidate</span>
								</Button>
							</div>
						{/snippet}
					</PropertyInspector>
				{/if}
			{/snippet}
		</AdminMasterDetail>
	{/if}

	<Dialog
		bind:open={takedownDialogOpen}
		title="Verify Takedown"
		description={`Takedown ID: ${selectedTakedownId}`}
	>
		<div class="flex flex-col gap-3">
			{#if takedownError}
				<Notice variant="danger" title="Action Failed">
					{takedownError}
				</Notice>
			{/if}
			<Field label="Verdict" required={true}>
				<DropdownSelect
					bind:value={takedownVerdict}
					options={verdictOptions}
					onValueChange={(v) => (takedownVerdict = v as 'accepted' | 'rejected')}
				/>
			</Field>
			<Field id="td-notes" label="Verification Notes">
				<Textarea id="td-notes" bind:value={takedownNotes} rows={3} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (takedownDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" busy={isSubmitting} onclick={handleVerifyTakedown}>
				Record Verdict
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={claimDialogOpen}
		title="Verify Creator Claim"
		description={`Claim ID: ${selectedClaimId}`}
	>
		<div class="flex flex-col gap-3">
			{#if claimError}
				<Notice variant="danger" title="Action Failed">
					{claimError}
				</Notice>
			{/if}
			<Field label="Verdict" required={true}>
				<DropdownSelect
					bind:value={claimVerdict}
					options={verdictOptions}
					onValueChange={(v) => (claimVerdict = v as 'accepted' | 'rejected')}
				/>
			</Field>
			<Field id="cl-notes" label="Verification Notes">
				<Textarea id="cl-notes" bind:value={claimNotes} rows={3} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (claimDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" busy={isSubmitting} onclick={handleVerifyClaim}>
				Record Verdict
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={appDialogOpen}
		title="Review Application Candidate"
		description={`App ID: ${selectedAppId}`}
	>
		<div class="flex flex-col gap-3">
			{#if appError}
				<Notice variant="danger" title="Action Failed">
					{appError}
				</Notice>
			{/if}
			<Field label="Candidate Trust Status" required={true}>
				<DropdownSelect
					bind:value={appCandidateVerdict}
					options={candidateVerdictOptions}
					onValueChange={(v) => (appCandidateVerdict = v as 'none' | 'reviewed' | 'trusted')}
				/>
			</Field>
			<Switch
				id="app-grant-del"
				bind:checked={appGrantDelegation}
				label="Grant delegated creator claim authority"
			/>
			<Field id="app-rev-notes" label="Review Notes">
				<Textarea id="app-rev-notes" bind:value={appReviewNotes} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (appDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" busy={isSubmitting} onclick={handleReviewAppCandidate}>
				Submit Review
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={delegationDialogOpen}
		title="Set Application Delegation"
		description={`App ID: ${selectedAppId}`}
	>
		<div class="flex flex-col gap-3">
			{#if delegationError}
				<Notice variant="danger" title="Action Failed">
					{delegationError}
				</Notice>
			{/if}
			<Switch
				id="set-del-switch"
				bind:checked={appDelegationAllowed}
				label="Allow delegated creator ownership claims"
			/>
			<Field id="set-del-reason" label="Audit Reason">
				<Textarea id="set-del-reason" bind:value={appDelegationReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (delegationDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" busy={isSubmitting} onclick={handleSetAppDelegation}>
				Update Delegation
			</Button>
		{/snippet}
	</Dialog>
</div>
