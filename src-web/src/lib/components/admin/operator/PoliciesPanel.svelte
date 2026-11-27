<script lang="ts">
	import type {
		EvidenceClass,
		HostMatchMode,
		Platform,
		QueryMode,
		SteeringProfile,
		SuppressedTarget,
		SuppressedTargetScope
	} from 'vrc-packages-api';
	import {
		PLATFORM_OPTIONS,
		ROW_MENU_TRIGGER_CLASS,
		formatTimestamp
	} from '$lib/components/admin/admin-constants';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Input from '$lib/components/ui/forms/Input.svelte';
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
	import { Plus, Ban, CheckCircle2, Trash2, X, MoreHorizontal } from '@lucide/svelte';

	let {
		profiles = $bindable<SteeringProfile[]>([]),
		suppressedTargets = $bindable<SuppressedTarget[]>([]),
		isLoading = false,
		onRefresh
	}: {
		profiles?: SteeringProfile[];
		suppressedTargets?: SuppressedTarget[];
		isLoading?: boolean;
		onRefresh?: () => Promise<void>;
	} = $props();

	let activeSection = $state<'profiles' | 'suppressed'>('profiles');
	let searchQuery = $state('');
	let statusFilter = $state<'ALL' | 'active' | 'disabled'>('ALL');
	let platformFilter = $state<'ALL' | Platform>('ALL');
	let scopeFilter = $state<'ALL' | SuppressedTargetScope>('ALL');
	let page = $state(0);

	const sectionOptions = $derived([
		{ value: 'profiles', label: `Steering Profiles (${profiles.length})` },
		{ value: 'suppressed', label: `Suppressed Targets (${suppressedTargets.length})` }
	]);

	const hostMatchOptions = $derived.by(() => {
		const base = [
			{ value: 'exact', label: 'Exact Host (exact)' },
			{ value: 'wildcard_subdomain', label: 'Wildcard Subdomain (*.domain)' }
		];
		if (profilePlatform === 'vpm') {
			base.push({ value: 'any_vpm_https', label: 'Any Public VPM HTTPS (*)' });
		}
		return base;
	});

	const queryModeOptions = [
		{ value: 'none', label: 'None (Strip query)' },
		{ value: 'exact', label: 'Exact query pair' },
		{ value: 'pagination', label: 'Pagination keys' }
	];

	const purposeOptions = [
		{ value: 'discovery', label: 'Discovery (discovery)' },
		{ value: 'metadata', label: 'Metadata (metadata)' }
	];

	const suppressedScopeOptions = [
		{ value: 'domain', label: 'Domain (domain)' },
		{ value: 'origin', label: 'Origin (origin)' },
		{ value: 'url', label: 'Exact URL (url)' }
	];

	let selectedProfileId = $state('');
	let createProfileOpen = $state(false);
	let profilePlatform = $state<Platform>('vpm');
	let profileHostMatchMode = $state<HostMatchMode>('exact');
	let profileHostPattern = $state('');
	let profilePathScope = $state('/');
	let profileQueryMode = $state<QueryMode>('none');
	let profileQueryScope = $state('');
	let profilePurpose = $state<'discovery' | 'metadata'>('discovery');
	let profileAutoPromote = $state(true);
	let profileMinDelayMs = $state(2000);
	let profileRecrawlIntervalMs = $state(21600000);
	let profileMaxPaginationDepth = $state(5);
	let profileExpiresAt = $state('2027-12-31T23:59:59.000Z');
	let profileReviewRef = $state('LEGAL.md Section 5 / COV-1');
	let profileReason = $state('Approved V0 steering profile');
	let retainProse = $state(true);
	let publishFacts = $state(true);
	let isSubmittingProfile = $state(false);
	let createProfileError = $state<string | null>(null);

	let toggleProfileDialogOpen = $state(false);
	let toggleProfileAction = $state<'enable' | 'disable'>('disable');
	let toggleProfileTargetId = $state('');
	let toggleProfileReason = $state('Operator steering kill-switch update');
	let toggleProfileError = $state<string | null>(null);

	let deleteProfileDialogOpen = $state(false);
	let deleteProfileTargetId = $state('');
	let deleteProfileReason = $state('Remove obsolete steering profile');
	let deleteProfileError = $state<string | null>(null);

	let selectedTargetKey = $state('');
	let createTargetOpen = $state(false);
	let targetScope = $state<SuppressedTargetScope>('domain');
	let targetValue = $state('');
	let targetReason = $state('Blocked non-compliant or noisy origin');
	let isSubmittingTarget = $state(false);
	let createTargetError = $state<string | null>(null);

	let deleteTargetDialogOpen = $state(false);
	let deleteTargetValue = $state('');
	let deleteTargetReason = $state('Lift operator target suppression');
	let deleteTargetError = $state<string | null>(null);

	$effect(() => {
		if (profilePlatform !== 'vpm' && profileHostMatchMode === 'any_vpm_https') {
			profileHostMatchMode = 'exact';
			if (profileHostPattern === '*') {
				profileHostPattern = '';
			}
		}
		if (profileHostMatchMode === 'any_vpm_https' && profileHostPattern !== '*') {
			profileHostPattern = '*';
		}
	});

	const facets = $derived.by<FacetGroup[]>(() => {
		if (activeSection === 'profiles') {
			return [
				{
					id: 'status',
					label: 'Status',
					value: statusFilter,
					allValue: 'ALL',
					options: [
						{ value: 'ALL', label: 'All Statuses' },
						{ value: 'active', label: 'Active' },
						{ value: 'disabled', label: 'Disabled' }
					],
					onChange: (val) => {
						statusFilter = val as 'ALL' | 'active' | 'disabled';
						page = 0;
					}
				},
				{
					id: 'platform',
					label: 'Platform',
					value: platformFilter,
					allValue: 'ALL',
					options: [
						{ value: 'ALL', label: 'All Platforms' },
						...PLATFORM_OPTIONS.map((o) => ({ value: o.value, label: o.value }))
					],
					onChange: (val) => {
						platformFilter = val as 'ALL' | Platform;
						page = 0;
					}
				}
			];
		}
		return [
			{
				id: 'scope',
				label: 'Scope',
				value: scopeFilter,
				allValue: 'ALL',
				options: [
					{ value: 'ALL', label: 'All Scopes' },
					{ value: 'domain', label: 'domain' },
					{ value: 'origin', label: 'origin' },
					{ value: 'url', label: 'url' }
				],
				onChange: (val) => {
					scopeFilter = val as 'ALL' | SuppressedTargetScope;
					page = 0;
				}
			}
		];
	});

	let filteredProfiles = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return profiles.filter((p) => {
			if (statusFilter === 'active' && p.disabledAt) return false;
			if (statusFilter === 'disabled' && !p.disabledAt) return false;
			if (platformFilter !== 'ALL' && p.platform !== platformFilter) return false;
			if (!q) return true;
			return (
				p.profileId.toLowerCase().includes(q) ||
				p.platform.toLowerCase().includes(q) ||
				p.hostPattern.toLowerCase().includes(q) ||
				p.pathScope.toLowerCase().includes(q) ||
				p.reviewReference.toLowerCase().includes(q)
			);
		});
	});

	let filteredTargets = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return suppressedTargets.filter((t) => {
			if (scopeFilter !== 'ALL' && t.scope !== scopeFilter) return false;
			if (!q) return true;
			return (
				t.target.toLowerCase().includes(q) ||
				t.scope.toLowerCase().includes(q) ||
				t.reason.toLowerCase().includes(q)
			);
		});
	});

	let selectedProfile = $derived(
		selectedProfileId ? (profiles.find((p) => p.profileId === selectedProfileId) ?? null) : null
	);
	let selectedTarget = $derived(
		selectedTargetKey ? (suppressedTargets.find((t) => t.target === selectedTargetKey) ?? null) : null
	);

	const profileColumns = [
		{ key: 'platform', label: 'Platform' },
		{ key: 'hostMatchMode', label: 'Match' },
		{ key: 'hostPattern', label: 'Host Pattern' },
		{ key: 'pathScope', label: 'Path' },
		{
			key: 'autoPromote',
			label: 'Promote',
			format: (val: unknown) => (val ? 'Auto' : 'Review')
		},
		{ key: 'minDelayMs', label: 'Delay', align: 'right' as const },
		{
			key: 'disabledAt',
			label: 'Status',
			format: (val: unknown) => (val ? 'Disabled' : 'Active')
		}
	];

	const suppressedColumns = [
		{ key: 'scope', label: 'Scope' },
		{ key: 'target', label: 'Target' },
		{ key: 'reason', label: 'Reason' },
		{
			key: 'suppressedAt',
			label: 'Suppressed At',
			format: (val: unknown) => formatTimestamp(val)
		}
	];

	function openToggleProfileDialog(profile: SteeringProfile, action: 'enable' | 'disable') {
		toggleProfileTargetId = profile.profileId;
		toggleProfileAction = action;
		toggleProfileReason =
			action === 'disable'
				? 'Operator disabled steering profile'
				: 'Operator re-enabled steering profile';
		toggleProfileError = null;
		toggleProfileDialogOpen = true;
	}

	function openDeleteProfileDialog(profile: SteeringProfile) {
		deleteProfileTargetId = profile.profileId;
		deleteProfileReason = 'Remove obsolete steering profile';
		deleteProfileError = null;
		deleteProfileDialogOpen = true;
	}

	function openDeleteTargetDialog(target: SuppressedTarget) {
		deleteTargetValue = target.target;
		deleteTargetReason = 'Lift operator target suppression';
		deleteTargetError = null;
		deleteTargetDialogOpen = true;
	}

	async function handleCreateProfile() {
		createProfileError = null;
		isSubmittingProfile = true;
		try {
			const retainClasses: EvidenceClass[] = ['normalized_facts'];
			if (retainProse) retainClasses.push('creator_prose');
			const publishClasses: EvidenceClass[] = publishFacts ? ['normalized_facts'] : [];

			const res = await adminSession.client.operator.steeringProfiles.create({
				schemaVersion: 1,
				platform: profilePlatform,
				hostMatchMode: profileHostMatchMode,
				hostPattern: profileHostMatchMode === 'any_vpm_https' ? '*' : profileHostPattern.trim(),
				pathScope: profilePathScope.trim(),
				queryMode: profileQueryMode,
				...(profileQueryMode === 'none' ? {} : { queryScope: profileQueryScope.trim() }),
				method: 'GET',
				purpose: profilePurpose,
				autoPromote: profileAutoPromote,
				recrawlIntervalMs: Number(profileRecrawlIntervalMs),
				minDelayMs: Number(profileMinDelayMs),
				maxPaginationDepth: Number(profileMaxPaginationDepth),
				expiresAt: profileExpiresAt.trim(),
				reviewReference: profileReviewRef.trim(),
				reason: profileReason.trim(),
				retainClasses,
				publishClasses
			});
			selectedProfileId = res.profile.profileId;
			createProfileOpen = false;
			toastStore.success(
				`Created steering profile ${res.profile.hostPattern}${res.profile.pathScope}.`,
				'Steering Updated'
			);
			await onRefresh?.();
		} catch (err) {
			createProfileError = formatAdminError(err);
		} finally {
			isSubmittingProfile = false;
		}
	}

	async function handleToggleProfile() {
		if (!toggleProfileTargetId) return;
		toggleProfileError = null;
		isSubmittingProfile = true;
		try {
			const res =
				toggleProfileAction === 'disable'
					? await adminSession.client.operator.steeringProfiles.disable(
							toggleProfileTargetId,
							toggleProfileReason.trim()
						)
					: await adminSession.client.operator.steeringProfiles.enable(
							toggleProfileTargetId,
							toggleProfileReason.trim()
						);
			toggleProfileDialogOpen = false;
			toastStore.success(
				`Steering profile ${res.profile.profileId} ${toggleProfileAction}d.`,
				'Kill-Switch Updated'
			);
			await onRefresh?.();
		} catch (err) {
			toggleProfileError = formatAdminError(err);
		} finally {
			isSubmittingProfile = false;
		}
	}

	async function handleDeleteProfile() {
		if (!deleteProfileTargetId) return;
		deleteProfileError = null;
		isSubmittingProfile = true;
		try {
			await adminSession.client.operator.steeringProfiles.delete(
				deleteProfileTargetId,
				deleteProfileReason.trim()
			);
			if (selectedProfileId === deleteProfileTargetId) {
				selectedProfileId = '';
			}
			deleteProfileDialogOpen = false;
			toastStore.success(`Deleted steering profile ${deleteProfileTargetId}.`, 'Profile Deleted');
			await onRefresh?.();
		} catch (err) {
			deleteProfileError = formatAdminError(err);
		} finally {
			isSubmittingProfile = false;
		}
	}

	async function handleCreateSuppressedTarget() {
		createTargetError = null;
		isSubmittingTarget = true;
		try {
			const res = await adminSession.client.operator.suppressedTargets.create({
				schemaVersion: 1,
				scope: targetScope,
				target: targetValue.trim(),
				reason: targetReason.trim()
			});
			selectedTargetKey = res.suppressedTarget.target;
			createTargetOpen = false;
			toastStore.success(
				`Suppressed ${res.suppressedTarget.scope} target ${res.suppressedTarget.target}.`,
				'Suppression Active'
			);
			await onRefresh?.();
		} catch (err) {
			createTargetError = formatAdminError(err);
		} finally {
			isSubmittingTarget = false;
		}
	}

	async function handleDeleteSuppressedTarget() {
		if (!deleteTargetValue) return;
		deleteTargetError = null;
		isSubmittingTarget = true;
		try {
			await adminSession.client.operator.suppressedTargets.delete({
				schemaVersion: 1,
				target: deleteTargetValue,
				reason: deleteTargetReason.trim()
			});
			if (selectedTargetKey === deleteTargetValue) {
				selectedTargetKey = '';
			}
			deleteTargetDialogOpen = false;
			toastStore.success(`Removed suppression for ${deleteTargetValue}.`, 'Suppression Removed');
			await onRefresh?.();
		} catch (err) {
			deleteTargetError = formatAdminError(err);
		} finally {
			isSubmittingTarget = false;
		}
	}
</script>

<div data-slot="policies-panel" class="flex flex-col gap-3">
	{#if activeSection === 'profiles'}
		<AdminMasterDetail
			columns={profileColumns}
			data={filteredProfiles}
			keyField="profileId"
			bind:selectedId={selectedProfileId}
			bind:page
			loading={isLoading}
			ariaLabel="Steering profiles"
			emptyTitle="No steering profiles"
			emptyDescription="Create a steering profile to authorize discovery and metadata crawling."
			inspectorTitle={selectedProfile ? `${selectedProfile.platform} Steering Profile` : 'Steering Profile'}
			inspectorDescription={selectedProfile?.profileId}
		>
			{#snippet toolbar()}
				<AdminFilterBar
					bind:searchQuery
					searchPlaceholder="Filter profiles by host, path, platform, or reference..."
					{facets}
					resultCount={filteredProfiles.length}
					totalCount={profiles.length}
				>
					{#snippet extraControls()}
						<ToggleGroup
							bind:value={activeSection}
							options={sectionOptions}
							onValueChange={(v) => {
								if (v === 'profiles' || v === 'suppressed') {
									activeSection = v;
									page = 0;
								}
							}}
						/>
					{/snippet}
					{#snippet actions()}
						<Button
							variant="primary"
							size="sm"
							onclick={() => {
								createProfileError = null;
								createProfileOpen = true;
							}}
						>
							<Plus size={14} />
							<span>New Steering Profile</span>
						</Button>
					{/snippet}
				</AdminFilterBar>
			{/snippet}

			{#snippet rowActions(profile: SteeringProfile)}
				<div class="inline-flex items-center justify-end gap-1">
					<Button
						variant="ghost"
						size="xs"
						onclick={() => (selectedProfileId = profile.profileId)}
					>
						Inspect
					</Button>
					<DropdownMenu>
						{#snippet trigger()}
							<span aria-label={`Actions for profile ${profile.profileId}`} class={ROW_MENU_TRIGGER_CLASS}>
								<MoreHorizontal size={14} />
							</span>
						{/snippet}
						<DropdownItem label="Inspect Profile" onclick={() => (selectedProfileId = profile.profileId)} />
						{#if !profile.disabledAt}
							<DropdownItem
								label="Disable (Kill-Switch)"
								destructive={true}
								onclick={() => openToggleProfileDialog(profile, 'disable')}
							/>
						{:else}
							<DropdownItem
								label="Re-enable Profile"
								onclick={() => openToggleProfileDialog(profile, 'enable')}
							/>
						{/if}
						<DropdownItem
							label="Delete Profile"
							destructive={true}
							onclick={() => openDeleteProfileDialog(profile)}
						/>
					</DropdownMenu>
				</div>
			{/snippet}

			{#snippet inspector()}
				{#if selectedProfile}
					<PropertyInspector
						embedded={true}
						title="Steering Profile"
						subtitle={selectedProfile.profileId}
						properties={[
							{ key: 'Platform', value: selectedProfile.platform, category: 'Scope' },
							{ key: 'Host Match Mode', value: selectedProfile.hostMatchMode, category: 'Scope' },
							{ key: 'Host Pattern', value: selectedProfile.hostPattern, category: 'Scope' },
							{ key: 'Path Scope', value: selectedProfile.pathScope, category: 'Scope' },
							{ key: 'Query Mode', value: selectedProfile.queryMode, category: 'Scope' },
							{ key: 'Query Scope', value: selectedProfile.queryScope ?? 'none', category: 'Scope' },
							{ key: 'Purpose', value: selectedProfile.purpose, category: 'Dispatch' },
							{ key: 'Auto Promote', value: selectedProfile.autoPromote ? 'true' : 'false', category: 'Dispatch' },
							{ key: 'Min Delay (ms)', value: selectedProfile.minDelayMs, category: 'Pacing' },
							{ key: 'Recrawl Interval (ms)', value: selectedProfile.recrawlIntervalMs, category: 'Pacing' },
							{ key: 'Max Pagination Depth', value: selectedProfile.maxPaginationDepth, category: 'Pacing' },
							{ key: 'Retain Classes', value: selectedProfile.retainClasses.join(', '), category: 'Governance' },
							{ key: 'Publish Classes', value: selectedProfile.publishClasses.join(', ') || 'none', category: 'Governance' },
							{ key: 'Review Ref', value: selectedProfile.reviewReference, category: 'Governance' },
							{ key: 'Reason', value: selectedProfile.reason, category: 'Governance' },
							{ key: 'Expires At', value: selectedProfile.expiresAt, category: 'Timestamps' },
							{
								key: 'Status',
								value: selectedProfile.disabledAt ? `Disabled (${selectedProfile.disabledAt})` : 'Active',
								category: 'Lifecycle'
							}
						]}
					>
						{#snippet headerActions()}
							<Button
								variant="ghost"
								size="xs"
								aria-label="Close inspector"
								title="Close inspector"
								onclick={() => (selectedProfileId = '')}
								class="min-w-7 px-1.5"
							>
								<X size={14} />
							</Button>
						{/snippet}

						{#snippet footerActions()}
							<div class="w-full flex items-center justify-end gap-2">
								{#if !selectedProfile.disabledAt}
									<Button
										variant="secondary"
										size="sm"
										onclick={() => openToggleProfileDialog(selectedProfile, 'disable')}
									>
										<Ban size={14} />
										<span>Disable</span>
									</Button>
								{:else}
									<Button
										variant="primary"
										size="sm"
										onclick={() => openToggleProfileDialog(selectedProfile, 'enable')}
									>
										<CheckCircle2 size={14} />
										<span>Enable</span>
									</Button>
								{/if}
								<Button
									variant="destructive"
									size="sm"
									onclick={() => openDeleteProfileDialog(selectedProfile)}
								>
									<Trash2 size={14} />
									<span>Delete</span>
								</Button>
							</div>
						{/snippet}
					</PropertyInspector>
				{/if}
			{/snippet}
		</AdminMasterDetail>
	{:else}
		<AdminMasterDetail
			columns={suppressedColumns}
			data={filteredTargets}
			keyField="target"
			bind:selectedId={selectedTargetKey}
			bind:page
			loading={isLoading}
			ariaLabel="Suppressed targets"
			emptyTitle="No suppressed targets"
			emptyDescription="Blocked domains, origins, and URLs are rejected across leads and job claims."
			inspectorTitle={selectedTarget?.target ?? 'Suppressed Target'}
			inspectorDescription={selectedTarget?.scope}
		>
			{#snippet toolbar()}
				<AdminFilterBar
					bind:searchQuery
					searchPlaceholder="Filter suppressed targets by domain, origin, URL, or reason..."
					{facets}
					resultCount={filteredTargets.length}
					totalCount={suppressedTargets.length}
				>
					{#snippet extraControls()}
						<ToggleGroup
							bind:value={activeSection}
							options={sectionOptions}
							onValueChange={(v) => {
								if (v === 'profiles' || v === 'suppressed') {
									activeSection = v;
									page = 0;
								}
							}}
						/>
					{/snippet}
					{#snippet actions()}
						<Button
							variant="destructive"
							size="sm"
							onclick={() => {
								createTargetError = null;
								createTargetOpen = true;
							}}
						>
							<Plus size={14} />
							<span>Suppress Target</span>
						</Button>
					{/snippet}
				</AdminFilterBar>
			{/snippet}

			{#snippet rowActions(item: SuppressedTarget)}
				<div class="inline-flex items-center justify-end gap-1">
					<Button
						variant="ghost"
						size="xs"
						onclick={() => (selectedTargetKey = item.target)}
					>
						Inspect
					</Button>
					<DropdownMenu>
						{#snippet trigger()}
							<span aria-label={`Actions for target ${item.target}`} class={ROW_MENU_TRIGGER_CLASS}>
								<MoreHorizontal size={14} />
							</span>
						{/snippet}
						<DropdownItem label="Inspect Target" onclick={() => (selectedTargetKey = item.target)} />
						<DropdownItem
							label="Remove Suppression"
							destructive={true}
							onclick={() => openDeleteTargetDialog(item)}
						/>
					</DropdownMenu>
				</div>
			{/snippet}

			{#snippet inspector()}
				{#if selectedTarget}
					<PropertyInspector
						embedded={true}
						title="Suppressed Target"
						subtitle={selectedTarget.target}
						properties={[
							{ key: 'Scope', value: selectedTarget.scope, category: 'Block Rule' },
							{ key: 'Target', value: selectedTarget.target, category: 'Block Rule' },
							{ key: 'Reason', value: selectedTarget.reason, category: 'Governance' },
							{ key: 'Suppressed At', value: selectedTarget.suppressedAt, category: 'Timestamps' }
						]}
					>
						{#snippet headerActions()}
							<Button
								variant="ghost"
								size="xs"
								aria-label="Close inspector"
								title="Close inspector"
								onclick={() => (selectedTargetKey = '')}
								class="min-w-7 px-1.5"
							>
								<X size={14} />
							</Button>
						{/snippet}

						{#snippet footerActions()}
							<div class="w-full flex justify-end">
								<Button
									variant="destructive"
									size="sm"
									onclick={() => openDeleteTargetDialog(selectedTarget)}
								>
									<Trash2 size={14} />
									<span>Remove Suppression</span>
								</Button>
							</div>
						{/snippet}
					</PropertyInspector>
				{/if}
			{/snippet}
		</AdminMasterDetail>
	{/if}

	<Dialog
		bind:open={createProfileOpen}
		title="Create Steering Profile"
		description="Dispatches POST /v1/operator/steering-profiles."
	>
		<div class="flex flex-col gap-3 max-h-[65vh] overflow-y-auto pr-1">
			{#if createProfileError}
				<Notice variant="danger" title="Creation Failed">
					{createProfileError}
				</Notice>
			{/if}
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Field label="Platform" required={true}>
					<DropdownSelect
						bind:value={profilePlatform}
						options={PLATFORM_OPTIONS}
						onValueChange={(v) => (profilePlatform = v as Platform)}
					/>
				</Field>
				<Field label="Host Match Mode" required={true}>
					<DropdownSelect
						bind:value={profileHostMatchMode}
						options={hostMatchOptions}
						onValueChange={(v) => (profileHostMatchMode = v as HostMatchMode)}
					/>
				</Field>
			</div>
			{#if profileHostMatchMode !== 'any_vpm_https'}
				<Field
					id="prof-host-pattern"
					label={profileHostMatchMode === 'wildcard_subdomain' ? 'Wildcard Pattern (*.domain.tld)' : 'Hostname'}
					required={true}
				>
					<Input id="prof-host-pattern" bind:value={profileHostPattern} placeholder="github.com" />
				</Field>
			{/if}
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Field id="prof-path" label="Path Scope" required={true}>
					<Input id="prof-path" bind:value={profilePathScope} placeholder="/" />
				</Field>
				<Field label="Purpose" required={true}>
					<DropdownSelect
						bind:value={profilePurpose}
						options={purposeOptions}
						onValueChange={(v) => (profilePurpose = v as 'discovery' | 'metadata')}
					/>
				</Field>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Field label="Query Mode" required={true}>
					<DropdownSelect
						bind:value={profileQueryMode}
						options={queryModeOptions}
						onValueChange={(v) => (profileQueryMode = v as QueryMode)}
					/>
				</Field>
				{#if profileQueryMode !== 'none'}
					<Field id="prof-query-scope" label="Query Scope" required={true}>
						<Input id="prof-query-scope" bind:value={profileQueryScope} placeholder="page,cursor" />
					</Field>
				{/if}
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
				<Field id="prof-delay" label="Min Delay (ms)" required={true}>
					<Input id="prof-delay" type="number" min={1000} bind:value={profileMinDelayMs} />
				</Field>
				<Field id="prof-recrawl" label="Recrawl (ms)" required={true}>
					<Input id="prof-recrawl" type="number" min={60000} bind:value={profileRecrawlIntervalMs} />
				</Field>
				<Field id="prof-depth" label="Max Pages" required={true}>
					<Input id="prof-depth" type="number" min={0} max={50} bind:value={profileMaxPaginationDepth} />
				</Field>
			</div>
			<Switch
				id="prof-auto-promote"
				bind:checked={profileAutoPromote}
				label="Auto-promote matching discovery leads into crawl queue"
			/>
			<Field id="prof-expires" label="Expires At (ISO-8601 UTC)" required={true}>
				<Input id="prof-expires" bind:value={profileExpiresAt} />
			</Field>
			<Field id="prof-ref" label="Review Reference (8-500 chars)" required={true}>
				<Input id="prof-ref" bind:value={profileReviewRef} />
			</Field>
			<Field id="prof-reason" label="Audit Reason (3-300 chars)" required={true}>
				<Input id="prof-reason" bind:value={profileReason} />
			</Field>
			<div class="flex flex-col gap-2 pt-1">
				<Checkbox id="ret-facts" checked={true} disabled={true} label="Retain normalized_facts (required)" />
				<Checkbox id="ret-prose" bind:checked={retainProse} label="Retain creator_prose" />
				<Checkbox id="pub-facts" bind:checked={publishFacts} label="Publish normalized_facts" />
			</div>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (createProfileOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" busy={isSubmittingProfile} onclick={handleCreateProfile}>
				Create Profile
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={toggleProfileDialogOpen}
		alert={toggleProfileAction === 'disable'}
		title={toggleProfileAction === 'disable' ? 'Disable Steering Profile' : 'Re-enable Steering Profile'}
		description={`Profile ID: ${toggleProfileTargetId}`}
	>
		<div class="flex flex-col gap-3">
			{#if toggleProfileError}
				<Notice variant="danger" title="Action Failed">
					{toggleProfileError}
				</Notice>
			{/if}
			<Field id="toggle-prof-reason" label="Audit Reason (3-300 chars)" required={true}>
				<Textarea id="toggle-prof-reason" bind:value={toggleProfileReason} rows={3} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (toggleProfileDialogOpen = false)}>
				Cancel
			</Button>
			<Button
				variant={toggleProfileAction === 'disable' ? 'destructive' : 'primary'}
				size="sm"
				busy={isSubmittingProfile}
				onclick={handleToggleProfile}
			>
				{toggleProfileAction === 'disable' ? 'Disable Profile' : 'Enable Profile'}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={deleteProfileDialogOpen}
		alert={true}
		title="Delete Steering Profile"
		description={`Permanently delete profile ${deleteProfileTargetId}?`}
	>
		<div class="flex flex-col gap-3">
			{#if deleteProfileError}
				<Notice variant="danger" title="Delete Failed">
					{deleteProfileError}
				</Notice>
			{/if}
			<Field id="del-prof-reason" label="Audit Reason (3-300 chars)" required={true}>
				<Textarea id="del-prof-reason" bind:value={deleteProfileReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (deleteProfileDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="destructive" size="sm" busy={isSubmittingProfile} onclick={handleDeleteProfile}>
				Delete Profile
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={createTargetOpen}
		title="Suppress Target"
		description="Dispatches POST /v1/operator/suppressed-targets."
	>
		<div class="flex flex-col gap-3">
			{#if createTargetError}
				<Notice variant="danger" title="Suppression Failed">
					{createTargetError}
				</Notice>
			{/if}
			<Field label="Scope" required={true}>
				<DropdownSelect
					bind:value={targetScope}
					options={suppressedScopeOptions}
					onValueChange={(v) => (targetScope = v as SuppressedTargetScope)}
				/>
			</Field>
			<Field
				id="supp-target-val"
				label={targetScope === 'domain' ? 'Hostname (example.com)' : targetScope === 'origin' ? 'Origin (https://example.com)' : 'HTTPS URL'}
				required={true}
			>
				<Input id="supp-target-val" bind:value={targetValue} placeholder="spam.example.invalid" />
			</Field>
			<Field id="supp-target-reason" label="Reason (3-300 chars)" required={true}>
				<Textarea id="supp-target-reason" bind:value={targetReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (createTargetOpen = false)}>
				Cancel
			</Button>
			<Button variant="destructive" size="sm" busy={isSubmittingTarget} onclick={handleCreateSuppressedTarget}>
				Suppress Target
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={deleteTargetDialogOpen}
		alert={true}
		title="Remove Target Suppression"
		description={`Lift suppression rule for ${deleteTargetValue}?`}
	>
		<div class="flex flex-col gap-3">
			{#if deleteTargetError}
				<Notice variant="danger" title="Removal Failed">
					{deleteTargetError}
				</Notice>
			{/if}
			<Field id="del-supp-reason" label="Audit Reason (3-300 chars)" required={true}>
				<Textarea id="del-supp-reason" bind:value={deleteTargetReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (deleteTargetDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="destructive" size="sm" busy={isSubmittingTarget} onclick={handleDeleteSuppressedTarget}>
				Remove Suppression
			</Button>
		{/snippet}
	</Dialog>
</div>
