<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		ContentRating,
		ModeratorRatingRecord,
		AppCandidateRecord,
		CandidateStatus
	} from 'vrc-packages-api';
	import { ROW_MENU_TRIGGER_CLASS } from '$lib/components/admin/admin-constants';
	import { cn } from '$lib/utils';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Switch from '$lib/components/ui/forms/Switch.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Tabs from '$lib/components/ui/navigation/Tabs.svelte';
	import DropdownMenu from '$lib/components/ui/navigation/DropdownMenu.svelte';
	import DropdownItem from '$lib/components/ui/navigation/DropdownItem.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import AdminFilterBar, { type FacetGroup } from '$lib/components/admin/AdminFilterBar.svelte';
	import AdminMasterDetail from '$lib/components/admin/AdminMasterDetail.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { Scale, ShieldCheck, KeyRound, RefreshCw, X, MoreHorizontal } from '@lucide/svelte';

	let activeTab = $state('ratings');
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);

	let ratings = $state<ModeratorRatingRecord[]>([]);
	let ratingFilter = $state<string>('all');
	let ratingSearchQuery = $state('');
	let ratingPage = $state(0);
	let selectedCanonicalId = $state('');
	let selectedCanonicalIds = $state<string[]>([]);

	let adjustDialogOpen = $state(false);
	let bulkAdjustDialogOpen = $state(false);
	let targetRating = $state<ContentRating>('general');
	let bulkTargetRating = $state<ContentRating>('general');
	let adjustReason = $state('Verified storefront content classification against VRCP rating taxonomy');
	let bulkAdjustReason = $state('Bulk moderator classification update against VRCP rating taxonomy');
	let adjustError = $state<string | null>(null);
	let bulkAdjustError = $state<string | null>(null);
	let isSubmitting = $state(false);
	let isBulkRatingSubmitting = $state(false);

	let apps = $state<AppCandidateRecord[]>([]);
	let candidateFilter = $state<string>('all');
	let appSearchQuery = $state('');
	let appPage = $state(0);
	let selectedAppId = $state('');
	let selectedAppIds = $state<string[]>([]);

	let reviewAppDialogOpen = $state(false);
	let bulkReviewAppDialogOpen = $state(false);
	let appVerdict = $state<'none' | 'reviewed' | 'trusted'>('reviewed');
	let bulkAppVerdict = $state<'none' | 'reviewed' | 'trusted'>('reviewed');
	let appGrantDelegation = $state(false);
	let bulkAppGrantDelegation = $state(false);
	let appNotes = $state('Reviewed downstream application candidate under moderator review queue');
	let bulkAppNotes = $state('Bulk reviewed downstream application candidates under moderator review queue');
	let reviewAppError = $state<string | null>(null);
	let bulkReviewAppError = $state<string | null>(null);
	let isBulkAppSubmitting = $state(false);

	let selectedRatings = $derived(ratings.filter((r) => selectedCanonicalIds.includes(r.canonicalId)));
	let selectedApps = $derived(apps.filter((a) => selectedAppIds.includes(a.appId)));
	let bulkAdjustReasonValid = $derived(bulkAdjustReason.trim().length >= 3);

	let hasModeratorSession = $derived(
		adminSession.authenticated && adminSession.role === 'moderator' && adminSession.tokenValidation.valid
	);

	let filteredRatings = $derived.by(() => {
		const q = ratingSearchQuery.trim().toLowerCase();
		return ratings.filter((r) => {
			if (!q) return true;
			return (
				r.canonicalId.toLowerCase().includes(q) ||
				r.displayName.toLowerCase().includes(q) ||
				r.currentRating.toLowerCase().includes(q) ||
				r.umbrella.toLowerCase().includes(q) ||
				r.category.toLowerCase().includes(q)
			);
		});
	});

	let filteredApps = $derived.by(() => {
		const q = appSearchQuery.trim().toLowerCase();
		return apps.filter((a) => {
			if (!q) return true;
			return (
				a.appId.toLowerCase().includes(q) ||
				a.appName.toLowerCase().includes(q) ||
				a.candidateStatus.toLowerCase().includes(q)
			);
		});
	});

	let selectedRatingRow = $derived(
		selectedCanonicalId ? (ratings.find((r) => r.canonicalId === selectedCanonicalId) ?? null) : null
	);

	let selectedAppRow = $derived(
		selectedAppId ? (apps.find((a) => a.appId === selectedAppId) ?? null) : null
	);

	let reportedCount = $derived(ratings.filter((r) => r.reportCount > 0).length);
	let pendingAppCount = $derived(apps.filter((a) => a.candidateStatus !== 'trusted').length);

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

	const ratingFacets = $derived<FacetGroup[]>([
		{
			id: 'rating',
			label: 'Content Rating (Coordinator)',
			value: ratingFilter,
			allValue: 'all',
			options: ratingFilterOptions,
			onChange: (val) => {
				ratingFilter = val;
				ratingPage = 0;
				void refreshModeratorQueues();
			}
		}
	]);

	const appFacets = $derived<FacetGroup[]>([
		{
			id: 'candidateStatus',
			label: 'Candidate Status (Coordinator)',
			value: candidateFilter,
			allValue: 'all',
			options: candidateFilterOptions,
			onChange: (val) => {
				candidateFilter = val;
				appPage = 0;
				void refreshModeratorQueues();
			}
		}
	]);

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

	async function refreshModeratorQueues(notifyOnSuccess = false) {
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
			if (notifyOnSuccess) {
				toastStore.success('Synchronized moderator queues.', 'Queue Synced');
			}
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isLoading = false;
		}
	}

	function openAdjustDialog(row: ModeratorRatingRecord) {
		selectedCanonicalId = row.canonicalId;
		targetRating = row.currentRating;
		adjustError = null;
		adjustDialogOpen = true;
	}

	function openBulkAdjustDialog() {
		bulkAdjustReason = 'Bulk moderator classification update against VRCP rating taxonomy';
		bulkAdjustError = null;
		bulkAdjustDialogOpen = true;
	}

	function openReviewAppDialog(app: AppCandidateRecord) {
		selectedAppId = app.appId;
		reviewAppError = null;
		reviewAppDialogOpen = true;
	}

	function openBulkReviewAppDialog() {
		bulkAppNotes = 'Bulk reviewed downstream application candidates under moderator review queue';
		bulkReviewAppError = null;
		bulkReviewAppDialogOpen = true;
	}

	async function handleAdjustRating() {
		if (!selectedRatingRow) return;
		adjustError = null;
		isSubmitting = true;
		try {
			const res = await adminSession.client.moderator.ratings.adjust(
				selectedRatingRow.canonicalId,
				{
					newRating: targetRating,
					reason: adjustReason.trim()
				}
			);
			adjustDialogOpen = false;
			toastStore.success(
				`Updated ${res.canonicalId} from "${res.previousRating}" to "${res.newRating}".`,
				'Rating Adjusted'
			);
			await refreshModeratorQueues();
		} catch (err) {
			adjustError = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleBulkAdjustRating() {
		if (!bulkAdjustReasonValid || selectedRatings.length === 0) return;
		bulkAdjustError = null;
		isBulkRatingSubmitting = true;
		let successCount = 0;
		let failCount = 0;
		const targets = [...selectedRatings];
		const adjustedIds: string[] = [];

		for (const item of targets) {
			try {
				await adminSession.client.moderator.ratings.adjust(item.canonicalId, {
					newRating: bulkTargetRating,
					reason: bulkAdjustReason.trim()
				});
				successCount++;
				adjustedIds.push(item.canonicalId);
			} catch (_) {
				failCount++;
			}
		}

		isBulkRatingSubmitting = false;
		bulkAdjustDialogOpen = false;
		selectedCanonicalIds = selectedCanonicalIds.filter((id) => !adjustedIds.includes(id));

		if (successCount > 0) {
			toastStore.success(
				`Adjusted ratings for ${successCount} package(s) to "${bulkTargetRating}".`,
				'Bulk Ratings Updated'
			);
		}
		if (failCount > 0) {
			toastStore.error(`Failed to adjust ${failCount} package(s).`, 'Bulk Partial Failure');
		}
		await refreshModeratorQueues();
	}

	async function handleReviewAppCandidate() {
		if (!selectedAppRow) return;
		reviewAppError = null;
		isSubmitting = true;
		try {
			const res = await adminSession.client.moderator.apps.reviewCandidate(selectedAppRow.appId, {
				candidateStatus: appVerdict,
				grantDelegation: appGrantDelegation,
				notes: appNotes.trim() || undefined
			});
			reviewAppDialogOpen = false;
			toastStore.success(
				`Reviewed ${res.appId}: status set to "${res.candidateStatus}".`,
				'Application Reviewed'
			);
			await refreshModeratorQueues();
		} catch (err) {
			reviewAppError = formatAdminError(err);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleBulkReviewApps() {
		if (selectedApps.length === 0) return;
		bulkReviewAppError = null;
		isBulkAppSubmitting = true;
		let successCount = 0;
		let failCount = 0;
		const targets = [...selectedApps];
		const reviewedIds: string[] = [];

		for (const app of targets) {
			try {
				await adminSession.client.moderator.apps.reviewCandidate(app.appId, {
					candidateStatus: bulkAppVerdict,
					grantDelegation: bulkAppGrantDelegation,
					notes: bulkAppNotes.trim() || undefined
				});
				successCount++;
				reviewedIds.push(app.appId);
			} catch (_) {
				failCount++;
			}
		}

		isBulkAppSubmitting = false;
		bulkReviewAppDialogOpen = false;
		selectedAppIds = selectedAppIds.filter((id) => !reviewedIds.includes(id));

		if (successCount > 0) {
			toastStore.success(
				`Reviewed ${successCount} application(s) as "${bulkAppVerdict}".`,
				'Bulk Apps Reviewed'
			);
		}
		if (failCount > 0) {
			toastStore.error(`Failed to review ${failCount} application(s).`, 'Bulk Partial Failure');
		}
		await refreshModeratorQueues();
	}
</script>

<div
	data-slot="moderator-dashboard"
	class={cn(
		'h-full flex flex-col gap-3 p-4 sm:p-6 md:pl-24 overflow-y-auto',
		!errorMessage && hasModeratorSession && 'md:overflow-hidden'
	)}
>
	<header class="flex items-center justify-between gap-3 flex-wrap shrink-0">
		<div class="flex items-center gap-2.5 min-w-0">
			<h1 class="text-lg font-semibold tracking-tight text-foreground text-balance">
				Moderator Queue
			</h1>
			<span class="hidden sm:inline-block text-xs font-mono text-muted-foreground truncate">
				{adminSession.coordinatorHostname}
			</span>
		</div>

		{#if hasModeratorSession}
			<Button
				variant="primary"
				size="sm"
				busy={isLoading}
				onclick={() => void refreshModeratorQueues(true)}
			>
				<RefreshCw size={14} />
				<span>{isLoading ? 'Syncing...' : 'Refresh'}</span>
			</Button>
		{:else}
			<Button variant="primary" size="sm" href="/login">
				<KeyRound size={14} />
				<span>Sign In</span>
			</Button>
		{/if}
	</header>

	<section
		aria-label="Moderator telemetry summary"
		class="grid grid-cols-2 lg:grid-cols-3 rounded-2xl border border-border bg-card divide-y sm:divide-y-0 sm:divide-x divide-border overflow-hidden shrink-0 shadow-xs"
	>
		<Button
			variant="ghost"
			size="sm"
			onclick={() => (activeTab = 'ratings')}
			class="h-auto w-full rounded-none px-4 py-2.5 flex-col items-start justify-start text-left gap-0.5 hover:bg-muted/40"
		>
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Rating Queue</span>
			<div class="flex items-center gap-2">
				<span
					class={cn(
						'size-2 rounded-full shrink-0',
						ratings.length > 0 ? 'bg-sidebar-primary' : 'bg-muted-foreground/50'
					)}
				></span>
				<span class="text-base font-semibold text-foreground tabular-nums">{ratings.length}</span>
				<span class="text-xs text-muted-foreground tabular-nums">/ {reportedCount} reported</span>
			</div>
		</Button>

		<Button
			variant="ghost"
			size="sm"
			onclick={() => (activeTab = 'apps')}
			class="h-auto w-full rounded-none px-4 py-2.5 flex-col items-start justify-start text-left gap-0.5 hover:bg-muted/40"
		>
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">App Candidates</span>
			<div class="flex items-center gap-2">
				<span
					class={cn(
						'size-2 rounded-full shrink-0',
						pendingAppCount > 0 ? 'bg-warning' : 'bg-sidebar-primary'
					)}
				></span>
				<span class="text-base font-semibold text-foreground tabular-nums">{apps.length}</span>
				<span class="text-xs text-muted-foreground tabular-nums">/ {pendingAppCount} untrusted</span>
			</div>
		</Button>

		<div class="px-4 py-2.5 flex flex-col justify-center gap-0.5 col-span-2 lg:col-span-1">
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Rating Filter</span>
			<span class="text-sm font-mono font-medium text-foreground truncate">
				{ratingFilter} / {candidateFilter}
			</span>
		</div>
	</section>

	{#if !hasModeratorSession}
		<Notice variant="warning" title="Moderator sign-in required">
			Sign in with an age-verified moderator token on <a href="/login" class="font-semibold underline">/login</a>.
		</Notice>
	{/if}

	{#if errorMessage}
		<Notice variant="danger" title="Request Failed">
			{errorMessage}
		</Notice>
	{/if}

	<Tabs bind:value={activeTab} items={moderatorTabs}>
		{#if activeTab === 'ratings'}
			<AdminMasterDetail
				columns={ratingColumns}
				data={filteredRatings}
				keyField="canonicalId"
				bind:selectedId={selectedCanonicalId}
				selectable={hasModeratorSession}
				bind:selectedIds={selectedCanonicalIds}
				bind:page={ratingPage}
				loading={isLoading}
				ariaLabel="Content rating review queue"
				emptyTitle="No packages in rating queue"
				emptyDescription={hasModeratorSession
					? 'No packages match the current rating filter.'
					: 'Sign in with a moderator token to inspect rating disputes.'}
				inspectorTitle={selectedRatingRow?.displayName ?? 'Rating Inspector'}
				inspectorDescription={selectedRatingRow?.canonicalId}
			>
				{#snippet bulkActions()}
					<div class="flex items-center gap-2">
						{#if selectedRatings.length > 0}
							<Button
								variant="primary"
								size="xs"
								onclick={openBulkAdjustDialog}
							>
								<Scale size={13} />
								<span>Adjust Ratings ({selectedRatings.length})</span>
							</Button>
						{/if}
					</div>
				{/snippet}
				{#snippet toolbar()}
					<AdminFilterBar
						bind:searchQuery={ratingSearchQuery}
						searchPlaceholder="Filter packages by ID, display name, or category..."
						facets={ratingFacets}
						resultCount={filteredRatings.length}
						totalCount={ratings.length}
					/>
				{/snippet}

				{#snippet emptyAction()}
					{#if !hasModeratorSession}
						<Button variant="primary" size="sm" href="/login">Sign In</Button>
					{:else}
						<Button variant="secondary" size="sm" onclick={() => void refreshModeratorQueues()}>
							Refresh
						</Button>
					{/if}
				{/snippet}

				{#snippet rowActions(row: ModeratorRatingRecord)}
					<div class="inline-flex items-center justify-end gap-1">
						<Button
							variant="ghost"
							size="xs"
							onclick={() => (selectedCanonicalId = row.canonicalId)}
						>
							Inspect
						</Button>
						<DropdownMenu>
							{#snippet trigger()}
								<span aria-label={`Actions for ${row.canonicalId}`} class={ROW_MENU_TRIGGER_CLASS}>
									<MoreHorizontal size={14} />
								</span>
							{/snippet}
							<DropdownItem label="Inspect Package" onclick={() => (selectedCanonicalId = row.canonicalId)} />
							<DropdownItem label="Adjust Rating" onclick={() => openAdjustDialog(row)} />
						</DropdownMenu>
					</div>
				{/snippet}

				{#snippet inspector()}
					{#if selectedRatingRow}
						<PropertyInspector
							embedded={true}
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
						>
							{#snippet headerActions()}
								<Button
									variant="ghost"
									size="xs"
									aria-label="Close inspector"
									title="Close inspector"
									onclick={() => (selectedCanonicalId = '')}
									class="min-w-7 px-1.5"
								>
									<X size={14} />
								</Button>
							{/snippet}

							{#snippet footerActions()}
								<div class="w-full flex justify-end">
									<Button
										variant="primary"
										size="sm"
										onclick={() => openAdjustDialog(selectedRatingRow)}
									>
										<Scale size={14} />
										<span>Adjust Rating</span>
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
				selectable={hasModeratorSession}
				bind:selectedIds={selectedAppIds}
				bind:page={appPage}
				loading={isLoading}
				ariaLabel="Application candidate review queue"
				emptyTitle="No candidate applications"
				emptyDescription={hasModeratorSession
					? 'No applications match the current status filter.'
					: 'Sign in with a moderator token to review application candidates.'}
				inspectorTitle={selectedAppRow?.appName ?? 'Application Inspector'}
				inspectorDescription={selectedAppRow?.appId}
			>
				{#snippet bulkActions()}
					<div class="flex items-center gap-2">
						{#if selectedApps.length > 0}
							<Button
								variant="primary"
								size="xs"
								onclick={openBulkReviewAppDialog}
							>
								<ShieldCheck size={13} />
								<span>Review Apps ({selectedApps.length})</span>
							</Button>
						{/if}
					</div>
				{/snippet}
				{#snippet toolbar()}
					<AdminFilterBar
						bind:searchQuery={appSearchQuery}
						searchPlaceholder="Filter apps by name, ID, or candidate status..."
						facets={appFacets}
						resultCount={filteredApps.length}
						totalCount={apps.length}
					/>
				{/snippet}

				{#snippet emptyAction()}
					{#if !hasModeratorSession}
						<Button variant="primary" size="sm" href="/login">Sign In</Button>
					{:else}
						<Button variant="secondary" size="sm" onclick={() => void refreshModeratorQueues()}>
							Refresh
						</Button>
					{/if}
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
								<span aria-label={`Actions for app ${app.appName}`} class={ROW_MENU_TRIGGER_CLASS}>
									<MoreHorizontal size={14} />
								</span>
							{/snippet}
							<DropdownItem label="Inspect Application" onclick={() => (selectedAppId = app.appId)} />
							<DropdownItem label="Review Candidate" onclick={() => openReviewAppDialog(app)} />
						</DropdownMenu>
					</div>
				{/snippet}

				{#snippet inspector()}
					{#if selectedAppRow}
						<PropertyInspector
							embedded={true}
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
								<div class="w-full flex justify-end">
									<Button
										variant="primary"
										size="sm"
										onclick={() => openReviewAppDialog(selectedAppRow)}
									>
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
	</Tabs>

	<Dialog
		bind:open={adjustDialogOpen}
		title="Adjust Content Rating"
		description={selectedRatingRow ? selectedRatingRow.canonicalId : ''}
	>
		<div class="flex flex-col gap-3">
			{#if adjustError}
				<Notice variant="danger" title="Adjustment Failed">
					{adjustError}
				</Notice>
			{/if}
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
			<Button variant="primary" size="sm" busy={isSubmitting} onclick={handleAdjustRating}>
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
			{#if reviewAppError}
				<Notice variant="danger" title="Review Failed">
					{reviewAppError}
				</Notice>
			{/if}
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
			<Button variant="primary" size="sm" busy={isSubmitting} onclick={handleReviewAppCandidate}>
				{isSubmitting ? 'Submitting...' : 'Submit Review'}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={bulkAdjustDialogOpen}
		title="Bulk Adjust Content Ratings"
		description={`Update classification for ${selectedRatings.length} selected package(s).`}
	>
		<div class="flex flex-col gap-3">
			{#if bulkAdjustError}
				<Notice variant="danger" title="Bulk Adjustment Failed">
					{bulkAdjustError}
				</Notice>
			{/if}

			<Field label="Target Content Rating" required={true}>
				<DropdownSelect
					bind:value={bulkTargetRating}
					options={ratingTargetOptions}
					onValueChange={(v) => (bulkTargetRating = v as ContentRating)}
				/>
			</Field>

			<Field id="bulk-adjust-reason" label="Audit Reason (>=3 chars)" required={true}>
				<Textarea id="bulk-adjust-reason" bind:value={bulkAdjustReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button
				variant="secondary"
				size="sm"
				disabled={isBulkRatingSubmitting}
				onclick={() => (bulkAdjustDialogOpen = false)}
			>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={isBulkRatingSubmitting}
				ariaDisabled={!bulkAdjustReasonValid || selectedRatings.length === 0}
				onclick={handleBulkAdjustRating}
			>
				{isBulkRatingSubmitting ? 'Updating...' : `Adjust (${selectedRatings.length})`}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={bulkReviewAppDialogOpen}
		title="Bulk Review App Candidates"
		description={`Review ${selectedApps.length} selected application candidate(s).`}
	>
		<div class="flex flex-col gap-3">
			{#if bulkReviewAppError}
				<Notice variant="danger" title="Bulk Review Failed">
					{bulkReviewAppError}
				</Notice>
			{/if}

			<Field label="Candidate Verdict" required={true}>
				<DropdownSelect
					bind:value={bulkAppVerdict}
					options={candidateVerdictOptions}
					onValueChange={(v) => (bulkAppVerdict = v as 'none' | 'reviewed' | 'trusted')}
				/>
			</Field>

			<Switch
				id="bulk-mod-grant-del"
				bind:checked={bulkAppGrantDelegation}
				label="Recommend creator claim delegation"
			/>

			<Field id="bulk-mod-app-notes" label="Notes (Optional)">
				<Textarea id="bulk-mod-app-notes" bind:value={bulkAppNotes} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button
				variant="secondary"
				size="sm"
				disabled={isBulkAppSubmitting}
				onclick={() => (bulkReviewAppDialogOpen = false)}
			>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				busy={isBulkAppSubmitting}
				ariaDisabled={selectedApps.length === 0}
				onclick={handleBulkReviewApps}
			>
				{isBulkAppSubmitting ? 'Submitting...' : `Review (${selectedApps.length})`}
			</Button>
		{/snippet}
	</Dialog>
</div>
