<script lang="ts">
	import type { TakedownRecord } from 'vrc-packages-api';
	import type {
		DelegatedClaimRecord,
		AppCandidateRecord,
		CandidateStatus
	} from '$lib/api/admin-client';
	import Card from '$lib/components/ui/display/Card.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Switch from '$lib/components/ui/forms/Switch.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
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
		{ key: 'takedownId', label: 'Takedown ID' },
		{ key: 'requesterType', label: 'Requester Type' },
		{ key: 'canonicalId', label: 'Canonical ID' },
		{ key: 'targetUrl', label: 'Target URL' },
		{ key: 'proofKind', label: 'Proof Kind' },
		{ key: 'reviewStatus', label: 'Review Status' },
		{ key: 'recordedAt', label: 'Recorded At' }
	];

	const claimColumns = [
		{ key: 'claimId', label: 'Claim ID' },
		{ key: 'appId', label: 'App ID' },
		{ key: 'creatorId', label: 'Creator ID' },
		{ key: 'frontUrl', label: 'Front URL' },
		{ key: 'reviewStatus', label: 'Review Status' },
		{ key: 'recordedAt', label: 'Recorded At' }
	];

	const appColumns = [
		{ key: 'appId', label: 'App ID' },
		{ key: 'appName', label: 'App Name' },
		{ key: 'candidateStatus', label: 'Candidate Status' },
		{
			key: 'delegationAllowed',
			label: 'Delegation',
			format: (val: unknown) => (val ? 'ALLOWED' : 'NO')
		},
		{ key: 'requestCount', label: 'Requests', align: 'right' as const },
		{ key: 'createdAt', label: 'Created At' }
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
			statusMessage = `Takedown ${res.takedownId} verified with status "${res.status}".`;
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
			statusMessage = `Delegated claim ${res.claimId} verified with status "${res.status}".`;
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
			statusMessage = `App ${res.appId} candidateStatus="${res.candidateStatus}" (delegationAllowed=${String(res.delegationAllowed)}).`;
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
			statusMessage = `App ${res.appId} delegationAllowed set to ${String(res.delegationAllowed)}.`;
			delegationDialogOpen = false;
			await onRefresh?.();
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="flex flex-col gap-6">
	{#if statusMessage}
		<Notice variant="success" title="Governance Verdict Recorded">
			{statusMessage}
		</Notice>
	{/if}

	{#if errorMessage}
		<Notice variant="danger" title="Governance Action Failed">
			{errorMessage}
		</Notice>
	{/if}

	<Card
		title="Takedowns & Creator Opt-Outs (/v1/operator/takedowns)"
		eyebrow="CONTROL PLANE 5A // DELISTING & TOMBSTONE AUDIT"
	>
		{#snippet headerRight()}
			<div class="flex items-center gap-2">
				<Badge variant="amber" size="xs">{takedowns.length} records</Badge>
				<Button
					variant="primary"
					size="xs"
					disabled={!selectedTakedownId}
					onclick={() => (takedownDialogOpen = true)}
				>
					<CheckCircle2 size={12} />
					<span>Verify Selected Takedown</span>
				</Button>
			</div>
		{/snippet}

		{#if takedowns.length === 0}
			<EmptyState
				title="No Takedown Records"
				description="Creator opt-outs and delisting requests submitted via /v1/app/report appear here for operator verification."
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

	<Card
		title="Delegated Creator Claims (/v1/operator/claims)"
		eyebrow="CONTROL PLANE 5B // SIGNED OWNERSHIP ATTESTATIONS"
	>
		{#snippet headerRight()}
			<div class="flex items-center gap-2">
				<Badge variant="sky" size="xs">{claims.length} claims</Badge>
				<Button
					variant="primary"
					size="xs"
					disabled={!selectedClaimId}
					onclick={() => (claimDialogOpen = true)}
				>
					<ShieldCheck size={12} />
					<span>Verify Selected Claim</span>
				</Button>
			</div>
		{/snippet}

		{#if claims.length === 0}
			<EmptyState
				title="No Delegated Creator Claims"
				description="Signed creator ownership attestations submitted via /v1/app/claims/intake appear here."
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

	<Card
		title="Registered Downstream Applications (/v1/operator/apps)"
		eyebrow="CONTROL PLANE 5C // APP CANDIDATE REVIEW & DELEGATION"
	>
		{#snippet headerRight()}
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="emerald" size="xs">{apps.length} apps</Badge>
				<Button
					variant="secondary"
					size="xs"
					disabled={!selectedAppId}
					onclick={() => (delegationDialogOpen = true)}
				>
					<KeyRound size={12} />
					<span>Set Delegation</span>
				</Button>
				<Button
					variant="primary"
					size="xs"
					disabled={!selectedAppId}
					onclick={() => (appDialogOpen = true)}
				>
					<ShieldCheck size={12} />
					<span>Review Candidate</span>
				</Button>
			</div>
		{/snippet}

		{#if apps.length === 0}
			<EmptyState
				title="No Registered Downstream Applications"
				description="Applications registered via POST /v1/app/register appear here for trust review and delegation control."
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

	<Dialog
		bind:open={takedownDialogOpen}
		title="Verify Takedown / Creator Opt-Out"
		description={`Takedown ID: ${selectedTakedownId}`}
	>
		<div class="flex flex-col gap-3">
			<Field label="Operator Verdict" required={true}>
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
				Record Takedown Verdict
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={claimDialogOpen}
		title="Verify Delegated Creator Claim"
		description={`Claim ID: ${selectedClaimId}`}
	>
		<div class="flex flex-col gap-3">
			<Field label="Operator Verdict" required={true}>
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
				Record Claim Verdict
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
				label="Grant delegated creator claim authority (grantDelegation)"
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
				Submit Candidate Review
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={delegationDialogOpen}
		title="Set Application Delegation Authority"
		description={`App ID: ${selectedAppId}`}
	>
		<div class="flex flex-col gap-3">
			<Switch
				id="set-del-switch"
				bind:checked={appDelegationAllowed}
				label="Allow application to submit delegated creator ownership claims"
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
