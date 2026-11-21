<script lang="ts">
	import type {
		Platform,
		NodeCredentialResponse,
		OperatorNodeRecord,
		OperatorNodeStatus
	} from '$lib/api/admin-client';
	import Card from '$lib/components/ui/display/Card.svelte';
	import Codeblock from '$lib/components/ui/display/Codeblock.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Input from '$lib/components/ui/forms/Input.svelte';
	import Switch from '$lib/components/ui/forms/Switch.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Skeleton from '$lib/components/ui/feedback/Skeleton.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import DataTable from '$lib/components/ui/telemetry/DataTable.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { Plus, KeyRound, ShieldAlert, X, ChevronRight } from '@lucide/svelte';

	const ALL_PLATFORMS: Platform[] = [
		'vpm',
		'github',
		'booth',
		'gumroad',
		'jinxxy',
		'itch',
		'curated',
		'shopify',
		'sellfy',
		'custom_domain'
	];

	const NODE_ID_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

	const statusFilterOptions = [
		{ value: 'all', label: 'All Statuses' },
		{ value: 'active', label: 'Active' },
		{ value: 'revoked', label: 'Revoked' }
	];

	let {
		nodes = $bindable<OperatorNodeRecord[]>([]),
		statusFilter = $bindable<'all' | OperatorNodeStatus>('all'),
		nextCursor = $bindable<string | null>(null),
		isLoading = false,
		isLoadingMore = false,
		onFilterChange,
		onLoadMore,
		onRefresh
	}: {
		nodes?: OperatorNodeRecord[];
		statusFilter?: 'all' | OperatorNodeStatus;
		nextCursor?: string | null;
		isLoading?: boolean;
		isLoadingMore?: boolean;
		onFilterChange?: (status: 'all' | OperatorNodeStatus) => Promise<void>;
		onLoadMore?: () => Promise<void>;
		onRefresh?: () => Promise<void>;
	} = $props();

	let selectedNodeId = $state('');
	let statusMessage = $state<string | null>(null);

	let issueDialogOpen = $state(false);
	let dialogMode = $state<'register' | 'rotate'>('register');
	let nodeIdInput = $state('');
	let autoAllocateTop3 = $state(true);
	let selectedCapabilities = $state<Record<Platform, boolean>>(createCapabilityMap(['vpm', 'github']));
	let issueReason = $state('');
	let issueAttempted = $state(false);
	let isIssuing = $state(false);
	let issueError = $state<string | null>(null);
	let issuedCredential = $state<NodeCredentialResponse | null>(null);

	let revokeDialogOpen = $state(false);
	let revokeTargetId = $state('');
	let revokeReason = $state('');
	let revokeAttempted = $state(false);
	let isRevoking = $state(false);
	let revokeError = $state<string | null>(null);

	let selectedNode = $derived(
		selectedNodeId ? (nodes.find((n) => n.nodeId === selectedNodeId) ?? null) : null
	);

	let trimmedNodeId = $derived(nodeIdInput.trim());
	let nodeIdValid = $derived(
		trimmedNodeId.length >= 1 && trimmedNodeId.length <= 100 && NODE_ID_PATTERN.test(trimmedNodeId)
	);
	let nodeIdError = $derived.by(() => {
		if (!issueAttempted && trimmedNodeId.length === 0) return undefined;
		if (!nodeIdValid) {
			return 'Use 1-100 letters, numbers, dots, underscores, or hyphens.';
		}
		return undefined;
	});

	let checkedCapabilities = $derived(ALL_PLATFORMS.filter((p) => selectedCapabilities[p]));
	let capabilitiesValid = $derived(autoAllocateTop3 || checkedCapabilities.length >= 1);
	let capabilitiesError = $derived(
		issueAttempted && !capabilitiesValid ? 'Select at least one platform capability.' : undefined
	);

	let trimmedIssueReason = $derived(issueReason.trim());
	let reasonValid = $derived(trimmedIssueReason.length >= 3 && trimmedIssueReason.length <= 300);
	let reasonError = $derived(
		issueAttempted && !reasonValid ? 'Enter 3-300 characters for the audit reason.' : undefined
	);

	let canSubmitIssue = $derived(nodeIdValid && capabilitiesValid && reasonValid);

	let trimmedRevokeReason = $derived(revokeReason.trim());
	let revokeReasonValid = $derived(trimmedRevokeReason.length >= 1 && trimmedRevokeReason.length <= 300);
	let revokeReasonError = $derived(
		revokeAttempted && !revokeReasonValid ? 'Enter 1-300 characters for the audit reason.' : undefined
	);

	let selectedInspectorProperties = $derived.by(() => {
		if (!selectedNode) return [];
		const items: { key: string; value: string | number; category: string }[] = [
			{ key: 'Node ID', value: selectedNode.nodeId, category: 'Identity' },
			{ key: 'Status', value: selectedNode.status, category: 'Identity' },
			{ key: 'Heartbeat', value: selectedNode.heartbeatState ?? 'offline', category: 'Heartbeat' },
			{ key: 'Last Seen', value: selectedNode.lastSeenAt ?? 'Never', category: 'Heartbeat' },
			{ key: 'Active Job', value: selectedNode.activeJobId ?? 'none', category: 'Heartbeat' },
			{
				key: `Platforms (${selectedNode.capabilities.length})`,
				value: selectedNode.capabilities.join(', '),
				category: 'Capabilities'
			}
		];
		if (selectedNode.revokedAt) {
			items.push({ key: 'Revoked At', value: selectedNode.revokedAt, category: 'Lifecycle' });
		}
		return items;
	});

	let issuedEnvSnippet = $derived.by(() => {
		if (!issuedCredential) return '';
		const coordinator = adminSession.coordinatorUrl;
		const caps = issuedCredential.capabilities.join(',');
		return [
			`COORDINATOR_URL=${coordinator}`,
			`NODE_ID=${issuedCredential.nodeId}`,
			`NODE_TOKEN=${issuedCredential.token}`,
			`NODE_CAPABILITIES=${caps}`,
			'',
			'# Start crawler node',
			`COORDINATOR_URL=${coordinator} NODE_ID=${issuedCredential.nodeId} NODE_TOKEN=${issuedCredential.token} ./vrcp-crawler`
		].join('\n');
	});

	const nodeColumns = [
		{ key: 'nodeId', label: 'Node ID' },
		{ key: 'status', label: 'Status' },
		{
			key: 'heartbeatState',
			label: 'Heartbeat',
			format: (val: unknown) => (typeof val === 'string' ? val : 'offline')
		},
		{
			key: 'lastSeenAt',
			label: 'Last Seen',
			format: (val: unknown) => formatTimestamp(val, 'Never')
		},
		{
			key: 'capabilities',
			label: 'Capabilities',
			format: (val: unknown) => {
				if (!Array.isArray(val) || val.length === 0) return '—';
				return val.length <= 3 ? val.join(', ') : `${val.slice(0, 2).join(', ')} (+${val.length - 2})`;
			}
		},
		{
			key: 'activeJobId',
			label: 'Active Job',
			format: (val: unknown) => {
				if (typeof val !== 'string' || val.length === 0) return '—';
				return val.length > 14 ? `${val.slice(0, 12)}...` : val;
			}
		}
	];

	function createCapabilityMap(enabled: Platform[]): Record<Platform, boolean> {
		const enabledSet = new Set(enabled);
		return ALL_PLATFORMS.reduce(
			(acc, platform) => {
				acc[platform] = enabledSet.has(platform);
				return acc;
			},
			{} as Record<Platform, boolean>
		);
	}

	function formatTimestamp(value: unknown, fallback = '—'): string {
		if (typeof value !== 'string' || value.length === 0) return fallback;
		return value.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
	}

	function openRegisterDialog() {
		dialogMode = 'register';
		nodeIdInput = '';
		autoAllocateTop3 = true;
		selectedCapabilities = createCapabilityMap(['vpm', 'github']);
		issueReason = 'Provision capability-scoped headless crawler node';
		issueAttempted = false;
		issueError = null;
		issuedCredential = null;
		issueDialogOpen = true;
	}

	function openRotateDialog(node: OperatorNodeRecord) {
		dialogMode = 'rotate';
		nodeIdInput = node.nodeId;
		autoAllocateTop3 = false;
		selectedCapabilities = createCapabilityMap(node.capabilities);
		issueReason = 'Rotate crawler node credential';
		issueAttempted = false;
		issueError = null;
		issuedCredential = null;
		issueDialogOpen = true;
	}

	function openRevokeDialog(node: OperatorNodeRecord) {
		revokeTargetId = node.nodeId;
		revokeReason = 'Operator node credential revocation';
		revokeAttempted = false;
		revokeError = null;
		revokeDialogOpen = true;
	}

	function closeIssueDialog() {
		issueDialogOpen = false;
		issuedCredential = null;
		issueError = null;
	}

	async function handleIssueCredential() {
		issueAttempted = true;
		issueError = null;
		if (!canSubmitIssue) return;

		isIssuing = true;
		try {
			const res = await adminSession.client.operator.nodes.issue({
				schemaVersion: 1,
				nodeId: trimmedNodeId,
				...(autoAllocateTop3 ? {} : { capabilities: checkedCapabilities }),
				reason: trimmedIssueReason
			});
			issuedCredential = res;
			selectedNodeId = res.nodeId;
			statusMessage =
				dialogMode === 'rotate'
					? `Rotated credential for ${res.nodeId}.`
					: `Registered node ${res.nodeId}.`;
			await onRefresh?.();
		} catch (err) {
			issueError = formatAdminError(err);
		} finally {
			isIssuing = false;
		}
	}

	async function handleRevokeCredential() {
		revokeAttempted = true;
		revokeError = null;
		if (!revokeReasonValid || !revokeTargetId) return;

		isRevoking = true;
		try {
			const res = await adminSession.client.operator.nodes.revoke(
				revokeTargetId,
				trimmedRevokeReason
			);
			revokeDialogOpen = false;
			statusMessage = `Revoked node ${res.nodeId}.`;
			await onRefresh?.();
		} catch (err) {
			revokeError = formatAdminError(err);
		} finally {
			isRevoking = false;
		}
	}
</script>

<div data-slot="nodes-panel" class="flex flex-col gap-6">
	{#if statusMessage}
		<Notice variant="success" title="Fleet Updated">
			{statusMessage}
		</Notice>
	{/if}

	<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
		<div class={selectedNode ? 'lg:col-span-8' : 'lg:col-span-12'}>
			<Card title="Registered Nodes">
				{#snippet headerRight()}
					<div class="flex flex-wrap items-center gap-2">
						<div class="w-36">
							<DropdownSelect
								size="xs"
								bind:value={statusFilter}
								options={statusFilterOptions}
								onValueChange={(val) =>
									void onFilterChange?.(val as 'all' | OperatorNodeStatus)}
							/>
						</div>
						<Button variant="primary" size="xs" onclick={openRegisterDialog}>
							<Plus size={12} />
							<span>Register Node</span>
						</Button>
					</div>
				{/snippet}

				{#if isLoading && nodes.length === 0}
					<div class="flex flex-col gap-2" aria-busy="true" aria-label="Loading registered nodes">
						<Skeleton class="h-10 w-full" />
						<Skeleton class="h-10 w-full" />
						<Skeleton class="h-10 w-full" />
					</div>
				{:else if nodes.length === 0}
					<EmptyState
						title="No registered nodes"
						description="Register a crawler node or adjust the status filter."
					>
						{#snippet action()}
							<Button variant="primary" size="sm" onclick={openRegisterDialog}>
								<Plus size={14} />
								<span>Register Node</span>
							</Button>
						{/snippet}
					</EmptyState>
				{:else}
					<DataTable
						columns={nodeColumns}
						data={nodes}
						keyField="nodeId"
						bind:selectedId={selectedNodeId}
					/>
				{/if}

				{#if nextCursor}
					<div class="mt-4 flex justify-end">
						<Button
							variant="secondary"
							size="sm"
							busy={isLoadingMore}
							onclick={() => void onLoadMore?.()}
						>
							<span>{isLoadingMore ? 'Loading...' : 'Load Next Page'}</span>
							<ChevronRight size={14} />
						</Button>
					</div>
				{/if}
			</Card>
		</div>

		{#if selectedNode}
			<div class="lg:col-span-4 flex flex-col gap-4">
				<PropertyInspector
					title="Selected Node"
					subtitle={selectedNode.nodeId}
					properties={selectedInspectorProperties}
				/>

				<Card variant="flat" class="p-4">
					<div class="flex items-center justify-between gap-2 flex-wrap">
						<div class="flex items-center gap-2 flex-wrap">
							<Button
								variant="secondary"
								size="sm"
								onclick={() => openRotateDialog(selectedNode)}
							>
								<KeyRound size={14} />
								<span>Rotate / Re-issue</span>
							</Button>
							{#if selectedNode.status === 'active'}
								<Button
									variant="destructive"
									size="sm"
									onclick={() => openRevokeDialog(selectedNode)}
								>
									<ShieldAlert size={14} />
									<span>Revoke</span>
								</Button>
							{/if}
						</div>

						<Button
							variant="ghost"
							size="xs"
							aria-label="Clear selection"
							title="Clear selection"
							onclick={() => (selectedNodeId = '')}
							class="min-w-7 px-1.5"
						>
							<X size={14} />
						</Button>
					</div>
				</Card>
			</div>
		{/if}
	</div>

	<Dialog
		bind:open={issueDialogOpen}
		title={dialogMode === 'rotate' ? 'Rotate / Re-issue Node Credential' : 'Register Crawler Node'}
		description={dialogMode === 'rotate'
			? `Re-issue token for ${nodeIdInput}.`
			: 'Issue a SHA-256 capability token for a crawler node.'}
	>
		<div class="flex flex-col gap-4">
			{#if issueError}
				<Notice variant="danger" title="Credential Issuance Failed">
					{issueError}
				</Notice>
			{/if}

			{#if issuedCredential}
				<Notice variant="warning" title="One-Time Secret Issued">
					Coordinator stores only a SHA-256 hash. Copy <code class="font-mono">NODE_TOKEN</code> before closing.
				</Notice>
				<Codeblock language="env" code={issuedEnvSnippet} />
			{:else}
				<Field id="issue-node-id" label="Node ID" required={true} error={nodeIdError}>
					<Input
						id="issue-node-id"
						bind:value={nodeIdInput}
						readonly={dialogMode === 'rotate'}
						placeholder="crawler-node-eu-01"
						error={Boolean(nodeIdError)}
						class={dialogMode === 'rotate' ? 'bg-muted/60 text-muted-foreground' : ''}
					/>
				</Field>

				<Switch
					id="auto-allocate-platforms"
					bind:checked={autoAllocateTop3}
					label="Auto-allocate top 3 platforms"
				/>

				{#if !autoAllocateTop3}
					<Field label="Platform Capabilities" required={true} error={capabilitiesError}>
						<div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-xl border border-border bg-background/70">
							{#each ALL_PLATFORMS as platform (platform)}
								<Checkbox
									id={`cap-${platform}`}
									bind:checked={selectedCapabilities[platform]}
									label={platform}
								/>
							{/each}
						</div>
					</Field>
				{/if}

				<Field id="issue-node-reason" label="Audit Reason (3-300 chars)" required={true} error={reasonError}>
					<Textarea
						id="issue-node-reason"
						bind:value={issueReason}
						rows={2}
						error={Boolean(reasonError)}
					/>
				</Field>
			{/if}
		</div>

		{#snippet actions()}
			{#if issuedCredential}
				<Button variant="primary" size="sm" onclick={closeIssueDialog}>
					Done
				</Button>
			{:else}
				<Button variant="secondary" size="sm" disabled={isIssuing} onclick={closeIssueDialog}>
					Cancel
				</Button>
				<Button
					variant="primary"
					size="sm"
					busy={isIssuing}
					ariaDisabled={!canSubmitIssue}
					onclick={handleIssueCredential}
				>
					<KeyRound size={13} />
					<span>
						{#if isIssuing}
							{dialogMode === 'rotate' ? 'Rotating...' : 'Registering...'}
						{:else}
							{dialogMode === 'rotate' ? 'Rotate Token' : 'Register Node'}
						{/if}
					</span>
				</Button>
			{/if}
		{/snippet}
	</Dialog>

	<Dialog
		bind:open={revokeDialogOpen}
		title="Revoke Node Credential"
		description={`Immediate lease cutoff for ${revokeTargetId}.`}
	>
		<div class="flex flex-col gap-4">
			{#if revokeError}
				<Notice variant="danger" title="Revocation Failed">
					{revokeError}
				</Notice>
			{/if}

			<Field id="revoke-node-id" label="Target Node ID">
				<Input
					id="revoke-node-id"
					value={revokeTargetId}
					readonly={true}
					class="bg-muted/60 text-muted-foreground"
				/>
			</Field>

			<Field
				id="revoke-node-reason"
				label="Revocation Audit Reason"
				required={true}
				error={revokeReasonError}
			>
				<Textarea
					id="revoke-node-reason"
					bind:value={revokeReason}
					rows={2}
					error={Boolean(revokeReasonError)}
				/>
			</Field>
		</div>

		{#snippet actions()}
			<Button
				variant="secondary"
				size="sm"
				disabled={isRevoking}
				onclick={() => (revokeDialogOpen = false)}
			>
				Keep Node
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isRevoking}
				ariaDisabled={!revokeReasonValid}
				onclick={handleRevokeCredential}
			>
				<ShieldAlert size={13} />
				<span>{isRevoking ? 'Revoking...' : 'Revoke Node'}</span>
			</Button>
		{/snippet}
	</Dialog>
</div>
