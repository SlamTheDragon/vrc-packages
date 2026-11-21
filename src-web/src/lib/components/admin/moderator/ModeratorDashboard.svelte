<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		ContentRating,
		ModeratorRatingRecord,
		AppCandidateRecord,
		CandidateStatus
	} from '$lib/api/admin-client';
	import Card from '$lib/components/ui/display/Card.svelte';
	import StatCard from '$lib/components/ui/display/StatCard.svelte';
	import VRCPEmblem from '$lib/components/ui/display/VRCPEmblem.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Switch from '$lib/components/ui/forms/Switch.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import EvidenceBadge from '$lib/components/ui/feedback/EvidenceBadge.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Tabs from '$lib/components/ui/navigation/Tabs.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import DataTable from '$lib/components/ui/telemetry/DataTable.svelte';
	import ObserverToolbar from '$lib/components/ui/telemetry/ObserverToolbar.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { Scale, ShieldCheck, KeyRound, RefreshCw, AlertTriangle } from '@lucide/svelte';

	let activeTab = $state('ratings');
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);
	let statusMessage = $state<string | null>(null);

	let ratings = $state<ModeratorRatingRecord[]>([]);
	let ratingFilter = $state<string>('all');
	let selectedCanonicalId = $state('');

	let adjustDialogOpen = $state(false);
	let targetRating = $state<ContentRating>('general');
	let adjustReason = $state('Verified storefront content classification against VRCP rating taxonomy');
	let isSubmitting = $state(false);

	let apps = $state<AppCandidateRecord[]>([]);
	let candidateFilter = $state<string>('all');
	let selectedAppId = $state('');

	let reviewAppDialogOpen = $state(false);
	let appVerdict = $state<'none' | 'reviewed' | 'trusted'>('reviewed');
	let appGrantDelegation = $state(false);
	let appNotes = $state('Reviewed downstream application candidate under moderator review queue');

	let hasModeratorSession = $derived(
		adminSession.authenticated && adminSession.role === 'moderator' && adminSession.tokenValidation.valid
	);

	let selectedRatingRow = $derived(
		ratings.find((r) => r.canonicalId === selectedCanonicalId) ?? ratings[0] ?? null
	);

	let selectedAppRow = $derived(
		apps.find((a) => a.appId === selectedAppId) ?? apps[0] ?? null
	);

	let disputedCount = $derived(ratings.filter((r) => r.reportCount > 0).length);

	const ratingFilterOptions = [
		{ value: 'all', label: 'All Content Ratings' },
		{ value: 'general', label: 'General (general)' },
		{ value: 'mature', label: 'Mature (mature)' },
		{ value: 'sexual_suggestive', label: 'Sexual Suggestive (sexual_suggestive)' },
		{ value: 'adult_restricted', label: 'Adult Restricted (adult_restricted)' },
		{ value: 'unknown_restricted', label: 'Unknown Restricted (unknown_restricted)' },
		{ value: 'prohibited', label: 'Prohibited (prohibited)' }
	];

	const ratingTargetOptions = [
		{ value: 'general', label: 'General (general)' },
		{ value: 'mature', label: 'Mature (mature)' },
		{ value: 'sexual_suggestive', label: 'Sexual Suggestive (sexual_suggestive)' },
		{ value: 'adult_restricted', label: 'Adult Restricted (adult_restricted)' },
		{ value: 'unknown_restricted', label: 'Unknown Restricted (unknown_restricted)' },
		{ value: 'prohibited', label: 'Prohibited (prohibited)' }
	];

	const candidateFilterOptions = [
		{ value: 'all', label: 'All Candidate Statuses' },
		{ value: 'review_pending', label: 'Review Pending (review_pending)' },
		{ value: 'reviewed', label: 'Reviewed (reviewed)' },
		{ value: 'trusted', label: 'Trusted (trusted)' },
		{ value: 'none', label: 'None (none)' }
	];

	const candidateVerdictOptions = [
		{ value: 'reviewed', label: 'Reviewed (reviewed)' },
		{ value: 'trusted', label: 'Trusted (trusted)' },
		{ value: 'none', label: 'None / Reset (none)' }
	];

	const ratingColumns = [
		{ key: 'canonicalId', label: 'Canonical ID' },
		{ key: 'displayName', label: 'Display Name' },
		{ key: 'currentRating', label: 'Current Rating' },
		{ key: 'umbrella', label: 'Umbrella' },
		{ key: 'category', label: 'Category' },
		{ key: 'reportCount', label: 'Reports', align: 'right' as const },
		{ key: 'updatedAt', label: 'Updated At' }
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

	const moderatorTabs = $derived([
		{ id: 'ratings', label: '1. Content Rating Queue & Adjustments', count: ratings.length },
		{ id: 'apps', label: '2. Application Candidate Review', count: apps.length }
	]);

	onMount(() => {
		adminSession.hydrateFromSessionStorage();
		if (hasModeratorSession) {
			void refreshModeratorQueues();
		}
	});

	async function refreshModeratorQueues() {
		if (!hasModeratorSession) return;
		errorMessage = null;
		isLoading = true;
		try {
			const [ratingRes, appRes] = await Promise.all([
				adminSession.client.moderator.ratings.list({
					rating: ratingFilter === 'all' ? undefined : (ratingFilter as ContentRating),
					limit: 50
				}),
				adminSession.client.moderator.apps.list({
					candidateStatus:
						candidateFilter === 'all' ? undefined : (candidateFilter as CandidateStatus),
					limit: 50
				})
			]);
			ratings = ratingRes.ratings;
			apps = appRes.apps;
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isLoading = false;
		}
	}

	async function handleAdjustRating() {
		if (!selectedRatingRow) return;
		errorMessage = null;
		statusMessage = null;
		isSubmitting = true;
		try {
			const res = await adminSession.client.moderator.ratings.adjust(
				selectedRatingRow.canonicalId,
				{
					newRating: targetRating,
					reason: adjustReason.trim()
				}
			);
			statusMessage = `Updated ${res.canonicalId} rating from "${res.previousRating}" to "${res.newRating}" (by ${res.adjustedBy}).`;
			adjustDialogOpen = false;
			await refreshModeratorQueues();
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleReviewAppCandidate() {
		if (!selectedAppRow) return;
		errorMessage = null;
		statusMessage = null;
		isSubmitting = true;
		try {
			const res = await adminSession.client.moderator.apps.reviewCandidate(selectedAppRow.appId, {
				candidateStatus: appVerdict,
				grantDelegation: appGrantDelegation,
				notes: appNotes.trim() || undefined
			});
			statusMessage = `Reviewed app ${res.appId}: candidateStatus="${res.candidateStatus}".`;
			reviewAppDialogOpen = false;
			await refreshModeratorQueues();
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isSubmitting = false;
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
				<span class="eyebrow">MODERATOR REVIEW QUEUE // /moderator</span>
				<h1 class="text-2xl font-bold tracking-tight text-slate-100">
					Content Rating Disputes &amp; App Candidate Moderation
				</h1>
				<p class="text-xs text-slate-400 mt-0.5">
					Partitioned moderation queue (<code class="font-mono text-emerald-400">VISION.md T04</code>): <code class="font-mono">rating_dispute</code> reports route to <code class="font-mono">/v1/moderator/*</code> while <code class="font-mono">safety_quarantine</code> stays restricted to operators.
				</p>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2.5">
			<ObserverToolbar onReset={() => void refreshModeratorQueues()} />
			<EvidenceBadge state={adminSession.evidenceState} size="md" />
			{#if hasModeratorSession}
				<Button
					variant="secondary"
					size="sm"
					disabled={isLoading}
					onclick={() => void refreshModeratorQueues()}
				>
					<RefreshCw size={14} />
					<span>{isLoading ? 'Syncing...' : 'Refresh Queues'}</span>
				</Button>
			{:else}
				<Button variant="primary" size="sm" href="/login">
					<KeyRound size={14} />
					<span>Sign In as Moderator</span>
				</Button>
			{/if}
		</div>
	</div>

	{#if !hasModeratorSession}
		<Notice variant="warning" title="Age-Verified Moderator Token Required (vrcp_usr_<64-hex>)">
			Accessing <code class="font-mono">/v1/moderator/*</code> endpoints requires a <code class="font-mono">vrcp_usr_</code> bearer token belonging to a registered user with <code class="font-mono">is_moderator = 1</code> and <code class="font-mono">age_verified = 1</code>. Authenticate on <a href="/login" class="font-semibold underline">/login</a>.
		</Notice>
	{/if}

	{#if statusMessage}
		<Notice variant="success" title="Moderation Action Recorded">
			{statusMessage}
		</Notice>
	{/if}

	{#if errorMessage}
		<Notice variant="danger" title="Moderation Request Failed">
			{errorMessage}
		</Notice>
	{/if}

	<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
		<StatCard
			label="Rating Queue Items"
			value={ratings.length}
			subtext={`Filter: ${ratingFilter}`}
			trend="GET /v1/moderator/ratings"
			trendDirection="neutral"
			icon={Scale}
		/>
		<StatCard
			label="Reported Packages"
			value={disputedCount}
			subtext="Packages with reportCount > 0"
			trend={disputedCount > 0 ? 'NEEDS REVIEW' : 'CLEAR'}
			trendDirection={disputedCount > 0 ? 'down' : 'up'}
			icon={AlertTriangle}
		/>
		<StatCard
			label="App Candidates"
			value={apps.length}
			subtext={`Filter: ${candidateFilter}`}
			trend="GET /v1/moderator/apps"
			trendDirection="neutral"
			icon={ShieldCheck}
		/>
	</div>

	<Tabs bind:value={activeTab} items={moderatorTabs}>
		{#if activeTab === 'ratings'}
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
				<div class="lg:col-span-8 flex flex-col gap-4">
					<Card
						title="Package Content Rating Queue (GET /v1/moderator/ratings)"
						eyebrow="MODERATOR PLANE 1 // RATING_DISPUTE TRIAGE"
					>
						{#snippet headerRight()}
							<div class="flex flex-wrap items-center gap-2">
								<div class="w-56">
									<DropdownSelect
										size="xs"
										bind:value={ratingFilter}
										options={ratingFilterOptions}
										onValueChange={() => void refreshModeratorQueues()}
									/>
								</div>
								<Button
									variant="primary"
									size="xs"
									disabled={!selectedRatingRow}
									onclick={() => {
										if (selectedRatingRow) {
											targetRating = selectedRatingRow.currentRating;
											adjustDialogOpen = true;
										}
									}}
								>
									<Scale size={12} />
									<span>Adjust Rating</span>
								</Button>
							</div>
						{/snippet}

						{#if ratings.length === 0}
							<EmptyState
								title="No Packages in Rating Queue"
								description="Sign in with a moderator token or change the content rating filter to inspect indexed packages."
							/>
						{:else}
							<DataTable
								columns={ratingColumns}
								data={ratings}
								keyField="canonicalId"
								bind:selectedId={selectedCanonicalId}
							/>
						{/if}
					</Card>
				</div>

				<div class="lg:col-span-4 flex flex-col gap-4">
					{#if selectedRatingRow}
						<PropertyInspector
							title="Selected Package Rating Record"
							subtitle={selectedRatingRow.canonicalId}
							properties={[
								{ key: 'Canonical ID', value: selectedRatingRow.canonicalId, category: 'Package' },
								{ key: 'Display Name', value: selectedRatingRow.displayName, category: 'Package' },
								{ key: 'Current Rating', value: selectedRatingRow.currentRating, category: 'Rating' },
								{ key: 'Report Count', value: selectedRatingRow.reportCount, category: 'Rating' },
								{ key: 'Umbrella', value: selectedRatingRow.umbrella, category: 'Taxonomy' },
								{ key: 'Category', value: selectedRatingRow.category, category: 'Taxonomy' },
								{ key: 'Updated At', value: selectedRatingRow.updatedAt, category: 'Timestamps' }
							]}
						/>
					{:else}
						<PropertyInspector
							title="Rating Inspector"
							subtitle="Select a package row to inspect rating dispute details"
							properties={[{ key: 'Selection', value: 'None', category: 'Status' }]}
						/>
					{/if}
				</div>
			</div>
		{:else}
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
				<div class="lg:col-span-8 flex flex-col gap-4">
					<Card
						title="Downstream Application Candidates (GET /v1/moderator/apps)"
						eyebrow="MODERATOR PLANE 2 // APP TRUST VERIFICATION"
					>
						{#snippet headerRight()}
							<div class="flex flex-wrap items-center gap-2">
								<div class="w-56">
									<DropdownSelect
										size="xs"
										bind:value={candidateFilter}
										options={candidateFilterOptions}
										onValueChange={() => void refreshModeratorQueues()}
									/>
								</div>
								<Button
									variant="primary"
									size="xs"
									disabled={!selectedAppRow}
									onclick={() => (reviewAppDialogOpen = true)}
								>
									<ShieldCheck size={12} />
									<span>Review Candidate</span>
								</Button>
							</div>
						{/snippet}

						{#if apps.length === 0}
							<EmptyState
								title="No Candidate Applications Found"
								description="Downstream applications awaiting candidate trust review appear here."
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
				</div>

				<div class="lg:col-span-4 flex flex-col gap-4">
					{#if selectedAppRow}
						<PropertyInspector
							title="Application Candidate Inspector"
							subtitle={selectedAppRow.appId}
							properties={[
								{ key: 'App ID', value: selectedAppRow.appId, category: 'Identity' },
								{ key: 'App Name', value: selectedAppRow.appName, category: 'Identity' },
								{
									key: 'Candidate Status',
									value: selectedAppRow.candidateStatus,
									category: 'Trust'
								},
								{
									key: 'Delegation Allowed',
									value: String(selectedAppRow.delegationAllowed),
									category: 'Trust'
								},
								{
									key: 'Permissions',
									value: selectedAppRow.permissions.join(', ') || 'none',
									category: 'Trust'
								},
								{ key: 'Request Count', value: selectedAppRow.requestCount, category: 'Telemetry' }
							]}
						/>
					{/if}
				</div>
			</div>
		{/if}
	</Tabs>

	<Dialog
		bind:open={adjustDialogOpen}
		title="Adjust Package Content Rating"
		description={selectedRatingRow ? `Canonical ID: ${selectedRatingRow.canonicalId}` : ''}
	>
		<div class="flex flex-col gap-3">
			<Field label="Target Content Rating" required={true}>
				<DropdownSelect
					bind:value={targetRating}
					options={ratingTargetOptions}
					onValueChange={(v) => (targetRating = v as ContentRating)}
				/>
			</Field>
			<Field id="mod-adj-reason" label="Explicit Moderation Reason (3-300 chars)" required={true}>
				<Textarea id="mod-adj-reason" bind:value={adjustReason} rows={3} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (adjustDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" disabled={isSubmitting} onclick={handleAdjustRating}>
				{isSubmitting ? 'Saving...' : 'Confirm Rating Adjustment'}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={reviewAppDialogOpen}
		title="Review Application Candidate"
		description={selectedAppRow ? `App: ${selectedAppRow.appName} (${selectedAppRow.appId})` : ''}
	>
		<div class="flex flex-col gap-3">
			<Field label="Candidate Verdict" required={true}>
				<DropdownSelect
					bind:value={appVerdict}
					options={candidateVerdictOptions}
					onValueChange={(v) => (appVerdict = v as 'none' | 'reviewed' | 'trusted')}
				/>
			</Field>
			<Switch
				id="mod-grant-del"
				bind:checked={appGrantDelegation}
				label="Recommend creator claim delegation (grantDelegation)"
			/>
			<Field id="mod-app-notes" label="Moderation Review Notes">
				<Textarea id="mod-app-notes" bind:value={appNotes} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (reviewAppDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" disabled={isSubmitting} onclick={handleReviewAppCandidate}>
				{isSubmitting ? 'Submitting...' : 'Submit Candidate Verdict'}
			</Button>
		{/snippet}
	</Dialog>
</div>
