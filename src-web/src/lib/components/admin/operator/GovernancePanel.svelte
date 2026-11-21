<script lang="ts">
	import type { TakedownRecord } from 'vrc-packages-api';
	import type {
		DelegatedClaimRecord,
		AppCandidateRecord
	} from '$lib/api/admin-client';
	import Card from '$lib/components/ui/display/Card.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Switch from '$lib/components/ui/forms/Switch.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import ToggleGroup from '$lib/components/ui/navigation/ToggleGroup.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import DataTable from '$lib/components/ui/telemetry/DataTable.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { CheckCircle2, ShieldCheck, KeyRound } from '@lucide/svelte';

	let {
		takedowns = $bindable<TakedownRecord[]>([]),
		claims = $bindable<DelegatedClaimRecord[]>([]),
		apps = $bindable<AppCandidateRecord[]>([]),
		onRefresh
	}: {
		takedowns?: TakedownRecord[];
		claims?: DelegatedClaimRecord[];
		apps?: AppCandidateRecord[];
		onRefresh?: () => Promise<void>;
	} = $props();

	let activeQueue = $state<'takedowns' | 'claims' | 'apps'>('takedowns');

	const queueOptions = $derived([
		{ value: 'takedowns', label: `Takedowns (${takedowns.length})` },
		{ value: 'claims', label: `Creator Claims (${claims.length})` },
		{ value: 'apps', label: `Applications (${apps.length})` }
	]);

	let selectedTakedownId = $state('');
	let takedownDialogOpen = $state(false);
	let takedownVerdict = $state<'accepted' | 'rejected'>('accepted');
	let takedownNotes = $state('Verified creator storefront ownership and processed delisting');

	let selectedClaimId = $state('');
	let claimDialogOpen = $state(false);
	let claimVerdict = $state<'accepted' | 'rejected'>('accepted');
	let claimNotes = $state('Verified delegated creator ownership attestation');

	let selectedAppId = $state('');
	let appDialogOpen = $state(false);
	let appCandidateVerdict = $state<'none' | 'reviewed' | 'trusted'>('trusted');
	let appGrantDelegation = $state(false);
	let appReviewNotes = $state('Verified application compliance with LEGAL.md Section 10 covenants');

	let delegationDialogOpen = $state(false);
	let appDelegationAllowed = $state(true);
	let appDelegationReason = $state('Approved creator claim delegation authority');

	let isSubmitting = $state(false);
	let statusMessage = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	const verdictOptions = [
		{ value: 'accepted', label: 'Accept (accepted)' },
		{ value: 'rejected', label: 'Reject (rejected)' }
	];

	const candidateVerdictOptions = [
		{ value: 'trusted', label: 'Trusted (trusted)' },
		{ value: 'reviewed', label: 'Reviewed (reviewed)' },
		{ value: 'none', label: 'None / Reset (none)' }
	];

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

	async function handleVerifyTakedown() {
		if (!selectedTakedownId) return;
		errorMessage = null;
		statusMessage = null;
		isSubmitting = true;
		try {
			const res = await adminSession.client.operator.takedowns.verify(selectedTakedownId, {
				verdict: takedownVerdict,
				notes: takedownNotes.trim() || undefined
			});
			statusMessage = `Takedown ${res.takedownId} verified as "${res.status}".`;
			takedownDialogOpen = false;
			await onRefresh?.();
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleVerifyClaim() {
		if (!selectedClaimId) return;
		errorMessage = null;
		statusMessage = null;
		isSubmitting = true;
		try {
			const res = await adminSession.client.operator.claims.verify(selectedClaimId, {
				verdict: claimVerdict,
				notes: claimNotes.trim() || undefined
			});
			statusMessage = `Claim ${res.claimId} verified as "${res.status}".`;
			claimDialogOpen = false;
			await onRefresh?.();
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleReviewAppCandidate() {
		if (!selectedAppId) return;
		errorMessage = null;
		statusMessage = null;
		isSubmitting = true;
		try {
			const res = await adminSession.client.operator.apps.reviewCandidate(selectedAppId, {
				candidateStatus: appCandidateVerdict,
				grantDelegation: appGrantDelegation,
				notes: appReviewNotes.trim() || undefined
			});
			statusMessage = `App ${res.appId} set to "${res.candidateStatus}" (delegation=${String(res.delegationAllowed)}).`;
			appDialogOpen = false;
			await onRefresh?.();
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleSetAppDelegation() {
		if (!selectedAppId) return;
		errorMessage = null;
		statusMessage = null;
		isSubmitting = true;
		try {
			const res = await adminSession.client.operator.apps.setDelegation(selectedAppId, {
				delegationAllowed: appDelegationAllowed,
				reason: appDelegationReason.trim() || undefined
			});
			statusMessage = `App ${res.appId} delegation set to ${String(res.delegationAllowed)}.`;
			delegationDialogOpen = false;
			await onRefresh?.();
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div data-slot="governance-panel" class="flex flex-col gap-6">
	{#if statusMessage}
		<Notice variant="success" title="Verdict Recorded">
			{statusMessage}
		</Notice>
	{/if}

	{#if errorMessage}
		<Notice variant="danger" title="Action Failed">
			{errorMessage}
		</Notice>
	{/if}

	<div class="flex items-center justify-between gap-4 flex-wrap">
		<ToggleGroup
			bind:value={activeQueue}
			options={queueOptions}
			onValueChange={(v) => {
				if (v === 'takedowns' || v === 'claims' || v === 'apps') activeQueue = v;
			}}
		/>
	</div>

	{#if activeQueue === 'takedowns'}
		<Card title="Takedowns & Opt-Outs">
			{#snippet headerRight()}
				<Button
					variant="primary"
					size="xs"
					disabled={!selectedTakedownId}
					onclick={() => (takedownDialogOpen = true)}
				>
					<CheckCircle2 size={12} />
					<span>Verify Selected</span>
				</Button>
			{/snippet}

			{#if takedowns.length === 0}
				<EmptyState
					title="No takedown records"
					description="Creator opt-outs and delisting requests appear here for verification."
				/>
			{:else}
				<DataTable
					columns={takedownColumns}
					data={takedowns}
					keyField="takedownId"
					bind:selectedId={selectedTakedownId}
				/>
			{/if}
		</Card>
	{:else if activeQueue === 'claims'}
		<Card title="Delegated Creator Claims">
			{#snippet headerRight()}
				<Button
					variant="primary"
					size="xs"
					disabled={!selectedClaimId}
					onclick={() => (claimDialogOpen = true)}
				>
					<ShieldCheck size={12} />
					<span>Verify Selected</span>
				</Button>
			{/snippet}

			{#if claims.length === 0}
				<EmptyState
					title="No delegated creator claims"
					description="Signed creator ownership attestations appear here for review."
				/>
			{:else}
				<DataTable
					columns={claimColumns}
					data={claims}
					keyField="claimId"
					bind:selectedId={selectedClaimId}
				/>
			{/if}
		</Card>
	{:else}
		<Card title="Registered Applications">
			{#snippet headerRight()}
				<div class="flex items-center gap-2">
					<Button
						variant="secondary"
						size="xs"
						disabled={!selectedAppId}
						onclick={() => (delegationDialogOpen = true)}
					>
						<KeyRound size={12} />
						<span>Delegation</span>
					</Button>
					<Button
						variant="primary"
						size="xs"
						disabled={!selectedAppId}
						onclick={() => (appDialogOpen = true)}
					>
						<ShieldCheck size={12} />
						<span>Review</span>
					</Button>
				</div>
			{/snippet}

			{#if apps.length === 0}
				<EmptyState
					title="No registered applications"
					description="Applications registered via POST /v1/app/register appear here."
				/>
			{:else}
				<DataTable
					columns={appColumns}
					data={apps}
					keyField="appId"
					bind:selectedId={selectedAppId}
				/>
			{/if}
		</Card>
	{/if}

	<Dialog
		bind:open={takedownDialogOpen}
		title="Verify Takedown"
		description={`Takedown ID: ${selectedTakedownId}`}
	>
		<div class="flex flex-col gap-3">
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
			<Button variant="primary" size="sm" disabled={isSubmitting} onclick={handleVerifyTakedown}>
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
			<Button variant="primary" size="sm" disabled={isSubmitting} onclick={handleVerifyClaim}>
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
			<Button variant="primary" size="sm" disabled={isSubmitting} onclick={handleReviewAppCandidate}>
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
			<Button variant="primary" size="sm" disabled={isSubmitting} onclick={handleSetAppDelegation}>
				Update Delegation
			</Button>
		{/snippet}
	</Dialog>
</div>
