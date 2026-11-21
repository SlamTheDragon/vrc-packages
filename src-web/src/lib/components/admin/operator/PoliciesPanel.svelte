<script lang="ts">
	import type {
		SourceAccessProfile,
		AutoQueueRule,
		Platform,
		EvidenceClass
	} from 'vrc-packages-api';
	import Card from '$lib/components/ui/display/Card.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Input from '$lib/components/ui/forms/Input.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import DataTable from '$lib/components/ui/telemetry/DataTable.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { Plus, Ban, RefreshCw } from '@lucide/svelte';

	let {
		profiles = $bindable<SourceAccessProfile[]>([]),
		rules = $bindable<AutoQueueRule[]>([]),
		onRefresh
	}: {
		profiles?: SourceAccessProfile[];
		rules?: AutoQueueRule[];
		onRefresh?: () => Promise<void>;
	} = $props();

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

	let disableProfileOpen = $state(false);
	let selectedProfileId = $state('');
	let disableProfileReason = $state('Operator policy review suspension');

	let createRuleOpen = $state(false);
	let ruleOrigin = $state('https://vrchat-community.github.io');
	let rulePathScope = $state('/template-package/');
	let ruleMinDelayMs = $state(2000);
	let ruleExpiresAt = $state('2027-12-31T23:59:59.000Z');
	let ruleReviewRef = $state('LEGAL.md Section 5 / Auto-Queue VPM');
	let ruleReason = $state('Auto-queue VPM listings under approved origin');
	let isSubmittingRule = $state(false);

	let disableRuleOpen = $state(false);
	let selectedRuleId = $state('');
	let disableRuleReason = $state('Operator disabled auto-queue rule');

	let actionMessage = $state<string | null>(null);
	let actionError = $state<string | null>(null);

	const profileColumns = [
		{ key: 'profileId', label: 'Profile ID' },
		{ key: 'platform', label: 'Platform' },
		{ key: 'origin', label: 'Origin' },
		{ key: 'pathScope', label: 'Path Scope' },
		{ key: 'purpose', label: 'Purpose' },
		{ key: 'minDelayMs', label: 'Min Delay (ms)', align: 'right' as const },
		{
			key: 'disabledAt',
			label: 'Status',
			format: (val: unknown) => (val ? 'DISABLED' : 'ACTIVE')
		}
	];

	const ruleColumns = [
		{ key: 'ruleId', label: 'Rule ID' },
		{ key: 'leadKind', label: 'Lead Kind' },
		{ key: 'origin', label: 'Origin' },
		{ key: 'pathScope', label: 'Path Scope' },
		{ key: 'minDelayMs', label: 'Min Delay (ms)', align: 'right' as const },
		{
			key: 'disabledAt',
			label: 'Status',
			format: (val: unknown) => (val ? 'DISABLED' : 'ACTIVE')
		}
	];

	async function handleCreateProfile() {
		actionError = null;
		actionMessage = null;
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
			actionMessage = `Created SourceAccessProfile ${res.profile.profileId} for ${res.profile.origin}${res.profile.pathScope}.`;
			createProfileOpen = false;
			await onRefresh?.();
		} catch (err) {
			actionError = formatAdminError(err);
		} finally {
			isSubmittingProfile = false;
		}
	}

	async function handleDisableProfile() {
		if (!selectedProfileId) return;
		actionError = null;
		actionMessage = null;
		isSubmittingProfile = true;
		try {
			const res = await adminSession.client.operator.sourceProfiles.disable(
				selectedProfileId,
				disableProfileReason.trim()
			);
			actionMessage = `Disabled SourceAccessProfile ${res.profile.profileId}.`;
			disableProfileOpen = false;
			await onRefresh?.();
		} catch (err) {
			actionError = formatAdminError(err);
		} finally {
			isSubmittingProfile = false;
		}
	}

	async function handleCreateRule() {
		actionError = null;
		actionMessage = null;
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
			actionMessage = `Created AutoQueueRule ${res.rule.ruleId} for ${res.rule.origin}${res.rule.pathScope}.`;
			createRuleOpen = false;
			await onRefresh?.();
		} catch (err) {
			actionError = formatAdminError(err);
		} finally {
			isSubmittingRule = false;
		}
	}

	async function handleDisableRule() {
		if (!selectedRuleId) return;
		actionError = null;
		actionMessage = null;
		isSubmittingRule = true;
		try {
			const res = await adminSession.client.operator.autoQueueRules.disable(
				selectedRuleId,
				disableRuleReason.trim()
			);
			actionMessage = `Disabled AutoQueueRule ${res.rule.ruleId}.`;
			disableRuleOpen = false;
			await onRefresh?.();
		} catch (err) {
			actionError = formatAdminError(err);
		} finally {
			isSubmittingRule = false;
		}
	}
</script>

<div class="flex flex-col gap-6">
	{#if actionMessage}
		<Notice variant="success" title="Policy Updated">
			{actionMessage}
		</Notice>
	{/if}

	{#if actionError}
		<Notice variant="danger" title="Policy Action Failed">
			{actionError}
		</Notice>
	{/if}

	<Card
		title="Source Access Profiles (/v1/operator/source-profiles)"
		eyebrow="CONTROL PLANE 2A // SCOPED ORIGIN AUTHORIZATION"
	>
		{#snippet headerRight()}
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="emerald" size="xs">{profiles.length} profiles</Badge>
				<Button
					variant="outline"
					size="xs"
					disabled={!selectedProfileId}
					onclick={() => (disableProfileOpen = true)}
				>
					<Ban size={12} />
					<span>Disable Selected</span>
				</Button>
				<Button variant="primary" size="xs" onclick={() => (createProfileOpen = true)}>
					<Plus size={12} />
					<span>New Profile</span>
				</Button>
			</div>
		{/snippet}

		<p class="text-xs text-slate-300 mb-3">
			A queued URL does not authorize fetching. Every crawl requires an active scoped <code class="font-mono">SourceAccessProfile</code> and RFC 9309 <code class="font-mono">robots.txt</code> compliance.
		</p>

		{#if profiles.length === 0}
			<EmptyState
				title="No Source Access Profiles Configured"
				description="Create a scoped source access profile or run Coordinator schema init with autoSeed enabled."
			/>
		{:else}
			<DataTable
				columns={profileColumns}
				data={profiles}
				keyField="profileId"
				bind:selectedId={selectedProfileId}
			/>
		{/if}
	</Card>

	<Card
		title="Auto-Queue Rules (/v1/operator/autoqueue-rules)"
		eyebrow="CONTROL PLANE 2B // AUTOMATED VPM LEAD PROMOTION"
	>
		{#snippet headerRight()}
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="sky" size="xs">{rules.length} rules</Badge>
				<Button
					variant="outline"
					size="xs"
					disabled={!selectedRuleId}
					onclick={() => (disableRuleOpen = true)}
				>
					<Ban size={12} />
					<span>Disable Selected</span>
				</Button>
				<Button variant="primary" size="xs" onclick={() => (createRuleOpen = true)}>
					<Plus size={12} />
					<span>New Auto-Queue Rule</span>
				</Button>
			</div>
		{/snippet}

		{#if rules.length === 0}
			<EmptyState
				title="No Auto-Queue Rules Active"
				description="Create an auto-queue rule to automatically promote matching vpm_listing leads under an approved origin."
			/>
		{:else}
			<DataTable
				columns={ruleColumns}
				data={rules}
				keyField="ruleId"
				bind:selectedId={selectedRuleId}
			/>
		{/if}
	</Card>

	<Dialog
		bind:open={createProfileOpen}
		title="Create Source Access Profile"
		description="Grants scoped GET crawl authorization under an approved origin and path prefix."
	>
		<div class="flex flex-col gap-3">
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
			<Button variant="primary" size="sm" disabled={isSubmittingProfile} onclick={handleCreateProfile}>
				{isSubmittingProfile ? 'Creating...' : 'Create Profile'}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={disableProfileOpen}
		title="Disable Source Access Profile"
		description={`Profile ID: ${selectedProfileId}`}
	>
		<Field id="dis-prof-reason" label="Audit Reason" required={true}>
			<Textarea id="dis-prof-reason" bind:value={disableProfileReason} rows={2} />
		</Field>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (disableProfileOpen = false)}>
				Cancel
			</Button>
			<Button variant="destructive" size="sm" disabled={isSubmittingProfile} onclick={handleDisableProfile}>
				Disable Profile
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={createRuleOpen}
		title="Create Auto-Queue Rule"
		description="Automatically enqueues discovered vpm_listing leads under the matching HTTPS origin and path scope."
	>
		<div class="flex flex-col gap-3">
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
			<Button variant="primary" size="sm" disabled={isSubmittingRule} onclick={handleCreateRule}>
				{isSubmittingRule ? 'Creating...' : 'Create Rule'}
			</Button>
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={disableRuleOpen}
		title="Disable Auto-Queue Rule"
		description={`Rule ID: ${selectedRuleId}`}
	>
		<Field id="dis-rule-reason" label="Audit Reason" required={true}>
			<Textarea id="dis-rule-reason" bind:value={disableRuleReason} rows={2} />
		</Field>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => (disableRuleOpen = false)}>
				Cancel
			</Button>
			<Button variant="destructive" size="sm" disabled={isSubmittingRule} onclick={handleDisableRule}>
				Disable Rule
			</Button>
		{/snippet}
	</Dialog>
</div>
