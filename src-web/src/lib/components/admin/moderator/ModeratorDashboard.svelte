<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		ContentRating,
		ModeratorRatingRecord,
		AppCandidateRecord,
		CandidateStatus
	} from '$lib/api/admin-client';
	import Card from '$lib/components/ui/display/Card.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Switch from '$lib/components/ui/forms/Switch.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Tabs from '$lib/components/ui/navigation/Tabs.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import DataTable from '$lib/components/ui/telemetry/DataTable.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { Scale, ShieldCheck, KeyRound, RefreshCw } from '@lucide/svelte';

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

	const ratingFilterOptions = [
		{ value: 'all', label: 'All Ratings' },
		{ value: 'general', label: 'General' },
		{ value: 'mature', label: 'Mature' },
		{ value: 'sexual_suggestive', label: 'Sexual Suggestive' },
		{ value: 'adult_restricted', label: 'Adult Restricted' },
		{ value: 'unknown_restricted', label: 'Unknown Restricted' },
		{ value: 'prohibited', label: 'Prohibited' }
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
		{ value: 'all', label: 'All Statuses' },
		{ value: 'review_pending', label: 'Review Pending' },
		{ value: 'reviewed', label: 'Reviewed' },
		{ value: 'trusted', label: 'Trusted' },
		{ value: 'none', label: 'None' }
	];

	const candidateVerdictOptions = [
		{ value: 'reviewed', label: 'Reviewed (reviewed)' },
		{ value: 'trusted', label: 'Trusted (trusted)' },
		{ value: 'none', label: 'None / Reset (none)' }
	];

	const ratingColumns = [
		{ key: 'canonicalId', label: 'Canonical ID' },
		{ key: 'displayName', label: 'Display Name' },
		{ key: 'currentRating', label: 'Rating' },
		{ key: 'category', label: 'Category' },
		{ key: 'reportCount', label: 'Reports', align: 'right' as const },
		{ key: 'updatedAt', label: 'Updated' }
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

	const moderatorTabs = $derived([
		{ id: 'ratings', label: 'Content Ratings', count: ratings.length },
		{ id: 'apps', label: 'App Candidates', count: apps.length }
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
			statusMessage = `Updated ${res.canonicalId} from "${res.previousRating}" to "${res.newRating}".`;
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
			statusMessage = `Reviewed ${res.appId}: status set to "${res.candidateStatus}".`;
			reviewAppDialogOpen = false;
			await refreshModeratorQueues();
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="flex flex-col gap-8">
	<div class="flex items-start justify-between gap-4 flex-wrap">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl font-semibold tracking-tight text-slate-100 text-balance">
				Moderator Queue
			</h1>
			<p class="text-sm text-slate-400 text-pretty">
				Review package content rating disputes and downstream application candidates.
			</p>
		</div>

		{#if hasModeratorSession}
			<Button
				variant="primary"
				size="sm"
				disabled={isLoading}
				onclick={() => void refreshModeratorQueues()}
			>
				<RefreshCw size={14} />
				<span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
			</Button>
		{:else}
			<Button variant="primary" size="sm" href="/login">
				<KeyRound size={14} />
				<span>Sign In</span>
			</Button>
		{/if}
	</div>

	{#if !hasModeratorSession}
		<Notice variant="warning" title="Moderator sign-in required">
			Sign in with an age-verified <code class="font-mono">vrcp_usr_</code> moderator token on <a href="/login" class="font-semibold underline">/login</a>.
		</Notice>
	{/if}

	{#if statusMessage}
		<Notice variant="success" title="Updated">
			{statusMessage}
		</Notice>
	{/if}

	{#if errorMessage}
		<Notice variant="danger" title="Request Failed">
			{errorMessage}
		</Notice>
	{/if}

	<Tabs bind:value={activeTab} items={moderatorTabs}>
		<div class="pt-2">
			{#if activeTab === 'ratings'}
				<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
					<div class={selectedRatingRow ? 'lg:col-span-8' : 'lg:col-span-12'}>
						<Card title="Content Rating Queue">
							{#snippet headerRight()}
								<div class="flex flex-wrap items-center gap-2">
									<div class="w-44">
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
									title="No packages in queue"
									description={hasModeratorSession
										? 'No packages match the current rating filter.'
										: 'Sign in with a moderator token to inspect rating disputes.'}
								>
									{#if !hasModeratorSession}
										<Button variant="primary" size="sm" href="/login">Sign In</Button>
									{:else}
										<Button variant="secondary" size="sm" onclick={() => void refreshModeratorQueues()}>
											Refresh
										</Button>
									{/if}
								</EmptyState>
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

					{#if selectedRatingRow}
						<div class="lg:col-span-4">
							<PropertyInspector
								title="Selected Package"
								subtitle={selectedRatingRow.canonicalId}
								properties={[
									{ key: 'Display Name', value: selectedRatingRow.displayName, category: 'Package' },
									{ key: 'Current Rating', value: selectedRatingRow.currentRating, category: 'Rating' },
									{ key: 'Reports', value: selectedRatingRow.reportCount, category: 'Rating' },
									{ key: 'Umbrella', value: selectedRatingRow.umbrella, category: 'Taxonomy' },
									{ key: 'Category', value: selectedRatingRow.category, category: 'Taxonomy' },
									{ key: 'Updated', value: selectedRatingRow.updatedAt, category: 'Metadata' }
								]}
							/>
						</div>
					{/if}
				</div>
			{:else}
				<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
					<div class={selectedAppRow ? 'lg:col-span-8' : 'lg:col-span-12'}>
						<Card title="Application Candidates">
							{#snippet headerRight()}
								<div class="flex flex-wrap items-center gap-2">
									<div class="w-44">
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
										<span>Review</span>
									</Button>
								</div>
							{/snippet}

							{#if apps.length === 0}
								<EmptyState
									title="No candidate applications"
									description={hasModeratorSession
										? 'No applications match the current status filter.'
										: 'Sign in with a moderator token to review application candidates.'}
								>
									{#if !hasModeratorSession}
										<Button variant="primary" size="sm" href="/login">Sign In</Button>
									{:else}
										<Button variant="secondary" size="sm" onclick={() => void refreshModeratorQueues()}>
											Refresh
										</Button>
									{/if}
								</EmptyState>
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

					{#if selectedAppRow}
						<div class="lg:col-span-4">
							<PropertyInspector
								title="Selected Application"
								subtitle={selectedAppRow.appId}
								properties={[
									{ key: 'Name', value: selectedAppRow.appName, category: 'Identity' },
									{ key: 'Status', value: selectedAppRow.candidateStatus, category: 'Trust' },
									{
										key: 'Delegation',
										value: selectedAppRow.delegationAllowed ? 'Allowed' : 'Disabled',
										category: 'Trust'
									},
									{
										key: 'Permissions',
										value: selectedAppRow.permissions.join(', ') || 'none',
										category: 'Trust'
									},
									{ key: 'Requests', value: selectedAppRow.requestCount, category: 'Usage' }
								]}
							/>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</Tabs>

	<Dialog
		bind:open={adjustDialogOpen}
		title="Adjust Content Rating"
		description={selectedRatingRow ? selectedRatingRow.canonicalId : ''}
	>
		<div class="flex flex-col gap-3">
			<Field label="Target Rating" required={true}>
				<DropdownSelect
					bind:value={targetRating}
					options={ratingTargetOptions}
					onValueChange={(v) => (targetRating = v as ContentRating)}
				/>
			</Field>
			<Field id="mod-adj-reason" label="Reason (3-300 chars)" required={true}>
				<Textarea id="mod-adj-reason" bind:value={adjustReason} rows={3} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (adjustDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" disabled={isSubmitting} onclick={handleAdjustRating}>
				{isSubmitting ? 'Saving...' : 'Save Rating'}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={reviewAppDialogOpen}
		title="Review Application Candidate"
		description={selectedAppRow ? `${selectedAppRow.appName} (${selectedAppRow.appId})` : ''}
	>
		<div class="flex flex-col gap-3">
			<Field label="Verdict" required={true}>
				<DropdownSelect
					bind:value={appVerdict}
					options={candidateVerdictOptions}
					onValueChange={(v) => (appVerdict = v as 'none' | 'reviewed' | 'trusted')}
				/>
			</Field>
			<Switch
				id="mod-grant-del"
				bind:checked={appGrantDelegation}
				label="Recommend creator claim delegation"
			/>
			<Field id="mod-app-notes" label="Notes">
				<Textarea id="mod-app-notes" bind:value={appNotes} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (reviewAppDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" disabled={isSubmitting} onclick={handleReviewAppCandidate}>
				{isSubmitting ? 'Submitting...' : 'Submit Review'}
			</Button>
		{/snippet}
	</Dialog>
</div>
