<script lang="ts">
	import type {
		SourceAccessProfile,
		AutoQueueRule,
		Platform,
		EvidenceClass
	} from 'vrc-packages-api';
	import { cn } from '$lib/utils';
	import { CONTROL_HEIGHTS, COMPONENT_PRESETS } from '$lib/components/ui/tokens';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';
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
	import { Plus, Ban, X, MoreHorizontal } from '@lucide/svelte';

	let {
		profiles = $bindable<SourceAccessProfile[]>([]),
		rules = $bindable<AutoQueueRule[]>([]),
		isLoading = false,
		onRefresh
	}: {
		profiles?: SourceAccessProfile[];
		rules?: AutoQueueRule[];
		isLoading?: boolean;
		onRefresh?: () => Promise<void>;
	} = $props();

	let activeSection = $state<'profiles' | 'rules'>('profiles');
	let searchQuery = $state('');
	let statusFilter = $state<'ALL' | 'active' | 'disabled'>('ALL');
	let platformFilter = $state<'ALL' | Platform>('ALL');
	let page = $state(0);

	const sectionOptions = $derived([
		{ value: 'profiles', label: `Source Profiles (${profiles.length})` },
		{ value: 'rules', label: `Auto-Queue Rules (${rules.length})` }
	]);

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

	let createProfileOpen = $state(false);
	let profilePlatform = $state<Platform>('vpm');
	let profileOrigin = $state('https://vrchat-community.github.io');
	let profilePathScope = $state('/template-package/');
	let profilePurpose = $state<'discovery' | 'metadata'>('discovery');
	let profileMinDelayMs = $state(2000);
	let profileExpiresAt = $state('2027-12-31T23:59:59.000Z');
	let profileReviewRef = $state('LEGAL.md Section 5 / COV-1');
	let profileReason = $state('Approved VPM registry discovery profile');
	let retainFacts = $state(true);
	let retainProse = $state(true);
	let publishFacts = $state(true);
	let isSubmittingProfile = $state(false);
	let createProfileError = $state<string | null>(null);

	let disableProfileOpen = $state(false);
	let selectedProfileId = $state('');
	let disableProfileTargetId = $state('');
	let disableProfileReason = $state('Operator policy review suspension');
	let disableProfileError = $state<string | null>(null);

	let createRuleOpen = $state(false);
	let ruleOrigin = $state('https://vrchat-community.github.io');
	let rulePathScope = $state('/template-package/');
	let ruleMinDelayMs = $state(2000);
	let ruleExpiresAt = $state('2027-12-31T23:59:59.000Z');
	let ruleReviewRef = $state('LEGAL.md Section 5 / Auto-Queue VPM');
	let ruleReason = $state('Auto-queue VPM listings under approved origin');
	let isSubmittingRule = $state(false);
	let createRuleError = $state<string | null>(null);

	let disableRuleOpen = $state(false);
	let selectedRuleId = $state('');
	let disableRuleTargetId = $state('');
	let disableRuleReason = $state('Operator disabled auto-queue rule');
	let disableRuleError = $state<string | null>(null);

	const facets = $derived.by<FacetGroup[]>(() => {
		const list: FacetGroup[] = [
			{
				id: 'status',
				label: 'Policy Status',
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
			}
		];
		if (activeSection === 'profiles') {
			list.push({
				id: 'platform',
				label: 'Platform',
				value: platformFilter,
				allValue: 'ALL',
				options: [
					{ value: 'ALL', label: 'All Platforms' },
					...platformOptions.map((o) => ({ value: o.value, label: o.value }))
				],
				onChange: (val) => {
					platformFilter = val as 'ALL' | Platform;
					page = 0;
				}
			});
		}
		return list;
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
				p.origin.toLowerCase().includes(q) ||
				p.pathScope.toLowerCase().includes(q) ||
				p.purpose.toLowerCase().includes(q) ||
				p.reviewReference.toLowerCase().includes(q)
			);
		});
	});

	let filteredRules = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return rules.filter((r) => {
			if (statusFilter === 'active' && r.disabledAt) return false;
			if (statusFilter === 'disabled' && !r.disabledAt) return false;
			if (!q) return true;
			return (
				r.ruleId.toLowerCase().includes(q) ||
				r.leadKind.toLowerCase().includes(q) ||
				r.origin.toLowerCase().includes(q) ||
				r.pathScope.toLowerCase().includes(q) ||
				r.reviewReference.toLowerCase().includes(q)
			);
		});
	});

	let selectedProfile = $derived(
		selectedProfileId ? (profiles.find((p) => p.profileId === selectedProfileId) ?? null) : null
	);

	let selectedRule = $derived(
		selectedRuleId ? (rules.find((r) => r.ruleId === selectedRuleId) ?? null) : null
	);

	const profileColumns = [
		{ key: 'platform', label: 'Platform' },
		{ key: 'origin', label: 'Origin' },
		{ key: 'pathScope', label: 'Path Scope' },
		{ key: 'purpose', label: 'Purpose' },
		{ key: 'minDelayMs', label: 'Delay (ms)', align: 'right' as const },
		{
			key: 'disabledAt',
			label: 'Status',
			format: (val: unknown) => (val ? 'Disabled' : 'Active')
		}
	];

	const ruleColumns = [
		{ key: 'leadKind', label: 'Lead Kind' },
		{ key: 'origin', label: 'Origin' },
		{ key: 'pathScope', label: 'Path Scope' },
		{ key: 'minDelayMs', label: 'Delay (ms)', align: 'right' as const },
		{
			key: 'disabledAt',
			label: 'Status',
			format: (val: unknown) => (val ? 'Disabled' : 'Active')
		}
	];

	function openDisableProfileDialog(profile: SourceAccessProfile) {
		disableProfileTargetId = profile.profileId;
		disableProfileReason = 'Operator policy review suspension';
		disableProfileError = null;
		disableProfileOpen = true;
	}

	function openDisableRuleDialog(rule: AutoQueueRule) {
		disableRuleTargetId = rule.ruleId;
		disableRuleReason = 'Operator disabled auto-queue rule';
		disableRuleError = null;
		disableRuleOpen = true;
	}

	async function handleCreateProfile() {
		createProfileError = null;
		isSubmittingProfile = true;
		try {
			const retainClasses: EvidenceClass[] = ['normalized_facts'];
			if (retainProse) retainClasses.push('creator_prose');
			const publishClasses: EvidenceClass[] = publishFacts ? ['normalized_facts'] : [];

			const res = await adminSession.client.operator.sourceProfiles.create({
				schemaVersion: 1,
				platform: profilePlatform,
				origin: profileOrigin.trim(),
				pathScope: profilePathScope.trim(),
				method: 'GET',
				purpose: profilePurpose,
				minDelayMs: Number(profileMinDelayMs),
				expiresAt: profileExpiresAt.trim(),
				reviewReference: profileReviewRef.trim(),
				reason: profileReason.trim(),
				retainClasses,
				publishClasses
			});
			selectedProfileId = res.profile.profileId;
			createProfileOpen = false;
			toastStore.success(
				`Created profile ${res.profile.profileId} for ${res.profile.origin}${res.profile.pathScope}.`,
				'Policy Updated'
			);
			await onRefresh?.();
		} catch (err) {
			createProfileError = formatAdminError(err);
		} finally {
			isSubmittingProfile = false;
		}
	}

	async function handleDisableProfile() {
		const targetId = disableProfileTargetId || selectedProfileId;
		if (!targetId || disableProfileReason.trim().length === 0) return;
		disableProfileError = null;
		isSubmittingProfile = true;
		try {
			const res = await adminSession.client.operator.sourceProfiles.disable(
				targetId,
				disableProfileReason.trim()
			);
			disableProfileOpen = false;
			toastStore.success(`Disabled profile ${res.profile.profileId}.`, 'Profile Disabled');
			await onRefresh?.();
		} catch (err) {
			disableProfileError = formatAdminError(err);
		} finally {
			isSubmittingProfile = false;
		}
	}

	async function handleCreateRule() {
		createRuleError = null;
		isSubmittingRule = true;
		try {
			const res = await adminSession.client.operator.autoQueueRules.create({
				schemaVersion: 1,
				leadKind: 'vpm_listing',
				origin: ruleOrigin.trim(),
				pathScope: rulePathScope.trim(),
				minDelayMs: Number(ruleMinDelayMs),
				expiresAt: ruleExpiresAt.trim(),
				reviewReference: ruleReviewRef.trim(),
				reason: ruleReason.trim()
			});
			selectedRuleId = res.rule.ruleId;
			createRuleOpen = false;
			toastStore.success(
				`Created rule ${res.rule.ruleId} for ${res.rule.origin}${res.rule.pathScope}.`,
				'Policy Updated'
			);
			await onRefresh?.();
		} catch (err) {
			createRuleError = formatAdminError(err);
		} finally {
			isSubmittingRule = false;
		}
	}

	async function handleDisableRule() {
		const targetId = disableRuleTargetId || selectedRuleId;
		if (!targetId || disableRuleReason.trim().length === 0) return;
		disableRuleError = null;
		isSubmittingRule = true;
		try {
			const res = await adminSession.client.operator.autoQueueRules.disable(
				targetId,
				disableRuleReason.trim()
			);
			disableRuleOpen = false;
			toastStore.success(`Disabled rule ${res.rule.ruleId}.`, 'Rule Disabled');
			await onRefresh?.();
		} catch (err) {
			disableRuleError = formatAdminError(err);
		} finally {
			isSubmittingRule = false;
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
			ariaLabel="Source access profiles"
			emptyTitle="No source access profiles"
			emptyDescription="Create a scoped profile to authorize fetching under an approved origin."
			inspectorTitle={selectedProfile?.origin ?? 'Profile Inspector'}
			inspectorDescription={selectedProfile?.profileId}
		>
			{#snippet toolbar()}
				<AdminFilterBar
					bind:searchQuery
					searchPlaceholder="Filter profiles by origin, path, platform, or review ref..."
					{facets}
					resultCount={filteredProfiles.length}
					totalCount={profiles.length}
				>
					{#snippet extraControls()}
						<ToggleGroup
							bind:value={activeSection}
							options={sectionOptions}
							onValueChange={(v) => {
								if (v === 'profiles' || v === 'rules') {
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
							<span>New Profile</span>
						</Button>
					{/snippet}
				</AdminFilterBar>
			{/snippet}

			{#snippet emptyAction()}
				<Button
					variant="primary"
					size="sm"
					onclick={() => {
						createProfileError = null;
						createProfileOpen = true;
					}}
				>
					<Plus size={14} />
					<span>New Profile</span>
				</Button>
			{/snippet}

			{#snippet rowActions(profile: SourceAccessProfile)}
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
							<span
								aria-label={`Actions for profile ${profile.profileId}`}
								class={cn(
									CONTROL_HEIGHTS.xs,
									COMPONENT_PRESETS.button.ghost,
									'inline-flex items-center justify-center px-1.5 rounded-lg'
								)}
							>
								<MoreHorizontal size={14} />
							</span>
						{/snippet}
						<DropdownItem label="Inspect Profile" onclick={() => (selectedProfileId = profile.profileId)} />
						{#if !profile.disabledAt}
							<DropdownItem
								label="Disable Profile"
								destructive={true}
								onclick={() => openDisableProfileDialog(profile)}
							/>
						{/if}
					</DropdownMenu>
				</div>
			{/snippet}

			{#snippet inspector()}
				{#if selectedProfile}
					<PropertyInspector
						embedded={true}
						title="Source Access Profile"
						subtitle={selectedProfile.profileId}
						properties={[
							{ key: 'Platform', value: selectedProfile.platform, category: 'Scope' },
							{ key: 'Origin', value: selectedProfile.origin, category: 'Scope' },
							{ key: 'Path Scope', value: selectedProfile.pathScope, category: 'Scope' },
							{ key: 'Purpose', value: selectedProfile.purpose, category: 'Scope' },
							{ key: 'Method', value: selectedProfile.method, category: 'Scope' },
							{ key: 'Min Delay (ms)', value: selectedProfile.minDelayMs, category: 'Pacing & Expiry' },
							{ key: 'Expires At', value: selectedProfile.expiresAt, category: 'Pacing & Expiry' },
							{
								key: 'Status',
								value: selectedProfile.disabledAt ? `Disabled (${selectedProfile.disabledAt})` : 'Active',
								category: 'Pacing & Expiry'
							},
							{ key: 'Review Ref', value: selectedProfile.reviewReference, category: 'Governance' },
							{ key: 'Retain Classes', value: selectedProfile.retainClasses.join(', '), category: 'Governance' },
							{
								key: 'Publish Classes',
								value: selectedProfile.publishClasses.join(', ') || 'none',
								category: 'Governance'
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
							{#if !selectedProfile.disabledAt}
								<div class="w-full flex justify-end">
									<Button
										variant="destructive"
										size="sm"
										onclick={() => openDisableProfileDialog(selectedProfile)}
									>
										<Ban size={14} />
										<span>Disable Profile</span>
									</Button>
								</div>
							{/if}
						{/snippet}
					</PropertyInspector>
				{/if}
			{/snippet}
		</AdminMasterDetail>
	{:else}
		<AdminMasterDetail
			columns={ruleColumns}
			data={filteredRules}
			keyField="ruleId"
			bind:selectedId={selectedRuleId}
			bind:page
			loading={isLoading}
			ariaLabel="Auto-queue rules"
			emptyTitle="No auto-queue rules"
			emptyDescription="Create a rule to automatically enqueue matching VPM leads under an approved origin."
			inspectorTitle={selectedRule?.origin ?? 'Rule Inspector'}
			inspectorDescription={selectedRule?.ruleId}
		>
			{#snippet toolbar()}
				<AdminFilterBar
					bind:searchQuery
					searchPlaceholder="Filter rules by origin, path, lead kind, or review ref..."
					{facets}
					resultCount={filteredRules.length}
					totalCount={rules.length}
				>
					{#snippet extraControls()}
						<ToggleGroup
							bind:value={activeSection}
							options={sectionOptions}
							onValueChange={(v) => {
								if (v === 'profiles' || v === 'rules') {
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
								createRuleError = null;
								createRuleOpen = true;
							}}
						>
							<Plus size={14} />
							<span>New Rule</span>
						</Button>
					{/snippet}
				</AdminFilterBar>
			{/snippet}

			{#snippet emptyAction()}
				<Button
					variant="primary"
					size="sm"
					onclick={() => {
						createRuleError = null;
						createRuleOpen = true;
					}}
				>
					<Plus size={14} />
					<span>New Rule</span>
				</Button>
			{/snippet}

			{#snippet rowActions(rule: AutoQueueRule)}
				<div class="inline-flex items-center justify-end gap-1">
					<Button
						variant="ghost"
						size="xs"
						onclick={() => (selectedRuleId = rule.ruleId)}
					>
						Inspect
					</Button>
					<DropdownMenu>
						{#snippet trigger()}
							<span
								aria-label={`Actions for rule ${rule.ruleId}`}
								class={cn(
									CONTROL_HEIGHTS.xs,
									COMPONENT_PRESETS.button.ghost,
									'inline-flex items-center justify-center px-1.5 rounded-lg'
								)}
							>
								<MoreHorizontal size={14} />
							</span>
						{/snippet}
						<DropdownItem label="Inspect Rule" onclick={() => (selectedRuleId = rule.ruleId)} />
						{#if !rule.disabledAt}
							<DropdownItem
								label="Disable Rule"
								destructive={true}
								onclick={() => openDisableRuleDialog(rule)}
							/>
						{/if}
					</DropdownMenu>
				</div>
			{/snippet}

			{#snippet inspector()}
				{#if selectedRule}
					<PropertyInspector
						embedded={true}
						title="Auto-Queue Rule"
						subtitle={selectedRule.ruleId}
						properties={[
							{ key: 'Lead Kind', value: selectedRule.leadKind, category: 'Match' },
							{ key: 'Origin', value: selectedRule.origin, category: 'Match' },
							{ key: 'Path Scope', value: selectedRule.pathScope, category: 'Match' },
							{ key: 'Min Delay (ms)', value: selectedRule.minDelayMs, category: 'Pacing & Expiry' },
							{ key: 'Expires At', value: selectedRule.expiresAt, category: 'Pacing & Expiry' },
							{
								key: 'Status',
								value: selectedRule.disabledAt ? `Disabled (${selectedRule.disabledAt})` : 'Active',
								category: 'Pacing & Expiry'
							},
							{ key: 'Review Ref', value: selectedRule.reviewReference, category: 'Governance' }
						]}
					>
						{#snippet headerActions()}
							<Button
								variant="ghost"
								size="xs"
								aria-label="Close inspector"
								title="Close inspector"
								onclick={() => (selectedRuleId = '')}
								class="min-w-7 px-1.5"
							>
								<X size={14} />
							</Button>
						{/snippet}

						{#snippet footerActions()}
							{#if !selectedRule.disabledAt}
								<div class="w-full flex justify-end">
									<Button
										variant="destructive"
										size="sm"
										onclick={() => openDisableRuleDialog(selectedRule)}
									>
										<Ban size={14} />
										<span>Disable Rule</span>
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
		bind:open={createProfileOpen}
		title="Create Source Access Profile"
		description="Grants scoped GET crawl authorization under an approved origin and path prefix."
	>
		<div class="flex flex-col gap-3">
			{#if createProfileError}
				<Notice variant="danger" title="Policy Action Failed">
					{createProfileError}
				</Notice>
			{/if}

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Field label="Platform" required={true}>
					<DropdownSelect
						bind:value={profilePlatform}
						options={platformOptions}
						onValueChange={(v) => (profilePlatform = v as Platform)}
					/>
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
				<Field id="prof-origin" label="Canonical HTTPS Origin" required={true}>
					<Input id="prof-origin" bind:value={profileOrigin} />
				</Field>
				<Field id="prof-path" label="Path Scope" required={true}>
					<Input id="prof-path" bind:value={profilePathScope} />
				</Field>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Field id="prof-delay" label="Min Delay (ms, >=1000)" required={true}>
					<Input id="prof-delay" type="number" min={1000} bind:value={profileMinDelayMs} />
				</Field>
				<Field id="prof-exp" label="Expires At (ISO-8601 UTC)" required={true}>
					<Input id="prof-exp" bind:value={profileExpiresAt} />
				</Field>
			</div>

			<Field id="prof-ref" label="Legal Review Reference (>=8 chars)" required={true}>
				<Input id="prof-ref" bind:value={profileReviewRef} />
			</Field>

			<Field id="prof-reason" label="Audit Reason (>=3 chars)" required={true}>
				<Textarea id="prof-reason" bind:value={profileReason} rows={2} />
			</Field>

			<div class="flex flex-wrap items-center gap-4 pt-1">
				<Checkbox id="ret-facts" bind:checked={retainFacts} disabled={true} label="Retain normalized_facts" />
				<Checkbox id="ret-prose" bind:checked={retainProse} label="Retain creator_prose" />
				<Checkbox id="pub-facts" bind:checked={publishFacts} label="Publish normalized_facts" />
			</div>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (createProfileOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" busy={isSubmittingProfile} onclick={handleCreateProfile}>
				{isSubmittingProfile ? 'Creating...' : 'Create Profile'}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={disableProfileOpen}
		alert={true}
		title="Disable Source Access Profile"
		description={`Profile ID: ${disableProfileTargetId || selectedProfileId}`}
	>
		<div class="flex flex-col gap-3">
			{#if disableProfileError}
				<Notice variant="danger" title="Policy Action Failed">
					{disableProfileError}
				</Notice>
			{/if}
			<Field id="dis-prof-reason" label="Audit Reason" required={true}>
				<Textarea id="dis-prof-reason" bind:value={disableProfileReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (disableProfileOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isSubmittingProfile}
				ariaDisabled={disableProfileReason.trim().length === 0}
				onclick={handleDisableProfile}
			>
				Disable Profile
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={createRuleOpen}
		title="Create Auto-Queue Rule"
		description="Automatically enqueues matching vpm_listing leads under the configured origin."
	>
		<div class="flex flex-col gap-3">
			{#if createRuleError}
				<Notice variant="danger" title="Policy Action Failed">
					{createRuleError}
				</Notice>
			{/if}

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Field id="rule-origin" label="Canonical HTTPS Origin" required={true}>
					<Input id="rule-origin" bind:value={ruleOrigin} />
				</Field>
				<Field id="rule-path" label="Path Scope" required={true}>
					<Input id="rule-path" bind:value={rulePathScope} />
				</Field>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<Field id="rule-delay" label="Min Delay (ms, >=1000)" required={true}>
					<Input id="rule-delay" type="number" min={1000} bind:value={ruleMinDelayMs} />
				</Field>
				<Field id="rule-exp" label="Expires At (ISO-8601 UTC)" required={true}>
					<Input id="rule-exp" bind:value={ruleExpiresAt} />
				</Field>
			</div>

			<Field id="rule-ref" label="Review Reference (>=8 chars)" required={true}>
				<Input id="rule-ref" bind:value={ruleReviewRef} />
			</Field>

			<Field id="rule-reason" label="Audit Reason (>=3 chars)" required={true}>
				<Textarea id="rule-reason" bind:value={ruleReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (createRuleOpen = false)}>
				Cancel
			</Button>
			<Button variant="primary" size="sm" busy={isSubmittingRule} onclick={handleCreateRule}>
				{isSubmittingRule ? 'Creating...' : 'Create Rule'}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={disableRuleOpen}
		alert={true}
		title="Disable Auto-Queue Rule"
		description={`Rule ID: ${disableRuleTargetId || selectedRuleId}`}
	>
		<div class="flex flex-col gap-3">
			{#if disableRuleError}
				<Notice variant="danger" title="Policy Action Failed">
					{disableRuleError}
				</Notice>
			{/if}
			<Field id="dis-rule-reason" label="Audit Reason" required={true}>
				<Textarea id="dis-rule-reason" bind:value={disableRuleReason} rows={2} />
			</Field>
		</div>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (disableRuleOpen = false)}>
				Cancel
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isSubmittingRule}
				ariaDisabled={disableRuleReason.trim().length === 0}
				onclick={handleDisableRule}
			>
				Disable Rule
			</Button>
		{/snippet}
	</Dialog>
</div>
