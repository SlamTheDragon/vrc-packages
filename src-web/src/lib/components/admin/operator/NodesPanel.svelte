<script lang="ts">
	import type {
		Platform,
		NodeCredentialResponse,
		OperatorNodeRecord,
		OperatorNodeStatus
	} from '$lib/api/admin-client';
	import { cn } from '$lib/utils';
	import { CONTROL_HEIGHTS, COMPONENT_PRESETS } from '$lib/components/ui/tokens';
	import Codeblock from '$lib/components/ui/display/Codeblock.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Input from '$lib/components/ui/forms/Input.svelte';
	import Switch from '$lib/components/ui/forms/Switch.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import DropdownMenu from '$lib/components/ui/navigation/DropdownMenu.svelte';
	import DropdownItem from '$lib/components/ui/navigation/DropdownItem.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import AdminFilterBar, { type FacetGroup } from '$lib/components/admin/AdminFilterBar.svelte';
	import AdminMasterDetail from '$lib/components/admin/AdminMasterDetail.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { Plus, KeyRound, ShieldAlert, Trash2, X, ChevronRight, MoreHorizontal } from '@lucide/svelte';

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
	let searchQuery = $state('');
	let capabilityFilter = $state<'ALL' | Platform>('ALL');
	let page = $state(0);

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

	let pruneDialogOpen = $state(false);
	let pruneTargetId = $state('');
	let pruneReason = $state('');
	let pruneAttempted = $state(false);
	let isPruning = $state(false);
	let pruneError = $state<string | null>(null);

	let selectedNodeIds = $state<string[]>([]);
	let bulkRevokeDialogOpen = $state(false);
	let bulkRevokeReason = $state('');
	let bulkRevokeAttempted = $state(false);
	let isBulkRevoking = $state(false);
	let bulkRevokeError = $state<string | null>(null);

	let bulkPruneDialogOpen = $state(false);
	let bulkPruneReason = $state('');
	let bulkPruneAttempted = $state(false);
	let isBulkPruning = $state(false);
	let bulkPruneError = $state<string | null>(null);

	const facets = $derived<FacetGroup[]>([
		{
			id: 'status',
			label: 'Node Status (Coordinator)',
			value: statusFilter,
			allValue: 'all',
			options: [
				{ value: 'all', label: 'All Statuses' },
				{ value: 'active', label: 'Active' },
				{ value: 'revoked', label: 'Revoked' }
			],
			onChange: (val) => {
				page = 0;
				void onFilterChange?.(val as 'all' | OperatorNodeStatus);
			}
		},
		{
			id: 'capability',
			label: 'Capability Platform',
			value: capabilityFilter,
			allValue: 'ALL',
			options: [
				{ value: 'ALL', label: 'All Platforms' },
				...ALL_PLATFORMS.map((p) => ({ value: p, label: p }))
			],
			onChange: (val) => {
				capabilityFilter = val as 'ALL' | Platform;
				page = 0;
			}
		}
	]);

	let filteredNodes = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return nodes.filter((node) => {
			if (capabilityFilter !== 'ALL' && !node.capabilities.includes(capabilityFilter)) {
				return false;
			}
			if (!q) return true;
			return (
				node.nodeId.toLowerCase().includes(q) ||
				node.status.toLowerCase().includes(q) ||
				(node.heartbeatState ?? '').toLowerCase().includes(q) ||
				(node.activeJobId ?? '').toLowerCase().includes(q) ||
				node.capabilities.some((c) => c.toLowerCase().includes(q))
			);
		});
	});

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

	let trimmedPruneReason = $derived(pruneReason.trim());
	let pruneReasonValid = $derived(trimmedPruneReason.length >= 1 && trimmedPruneReason.length <= 300);
	let pruneReasonError = $derived(
		pruneAttempted && !pruneReasonValid ? 'Enter 1-300 characters for the audit reason.' : undefined
	);

	let trimmedBulkRevokeReason = $derived(bulkRevokeReason.trim());
	let bulkRevokeReasonValid = $derived(trimmedBulkRevokeReason.length >= 1 && trimmedBulkRevokeReason.length <= 300);
	let bulkRevokeReasonError = $derived(
		bulkRevokeAttempted && !bulkRevokeReasonValid ? 'Enter 1-300 characters for the audit reason.' : undefined
	);

	let trimmedBulkPruneReason = $derived(bulkPruneReason.trim());
	let bulkPruneReasonValid = $derived(trimmedBulkPruneReason.length >= 1 && trimmedBulkPruneReason.length <= 300);
	let bulkPruneReasonError = $derived(
		bulkPruneAttempted && !bulkPruneReasonValid ? 'Enter 1-300 characters for the audit reason.' : undefined
	);

	let selectedActiveNodes = $derived(
		nodes.filter((n) => selectedNodeIds.includes(n.nodeId) && n.status === 'active')
	);
	let selectedRevokedNodes = $derived(
		nodes.filter((n) => selectedNodeIds.includes(n.nodeId) && n.status === 'revoked')
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
			toastStore.success(
				dialogMode === 'rotate'
					? `Rotated credential for ${res.nodeId}.`
					: `Registered node ${res.nodeId}.`,
				'Fleet Updated'
			);
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
			toastStore.success(`Revoked node ${res.nodeId}.`, 'Node Revoked');
			await onRefresh?.();
		} catch (err) {
			revokeError = formatAdminError(err);
		} finally {
			isRevoking = false;
		}
	}

	function openPruneDialog(node: OperatorNodeRecord) {
		pruneTargetId = node.nodeId;
		pruneReason = 'Permanently prune revoked crawler node';
		pruneAttempted = false;
		pruneError = null;
		pruneDialogOpen = true;
	}

	async function handlePruneNode() {
		pruneAttempted = true;
		pruneError = null;
		if (!pruneReasonValid || !pruneTargetId) return;

		isPruning = true;
		try {
			const res = await adminSession.client.operator.nodes.prune(
				pruneTargetId,
				trimmedPruneReason
			);
			pruneDialogOpen = false;
			if (selectedNodeId === pruneTargetId) {
				selectedNodeId = '';
			}
			selectedNodeIds = selectedNodeIds.filter((id) => id !== pruneTargetId);
			toastStore.success(`Permanently pruned node ${res.nodeId}.`, 'Node Pruned');
			await onRefresh?.();
		} catch (err) {
			pruneError = formatAdminError(err);
		} finally {
			isPruning = false;
		}
	}

	function openBulkRevokeDialog() {
		bulkRevokeReason = 'Operator bulk credential revocation';
		bulkRevokeAttempted = false;
		bulkRevokeError = null;
		bulkRevokeDialogOpen = true;
	}

	async function handleBulkRevoke() {
		bulkRevokeAttempted = true;
		bulkRevokeError = null;
		if (!bulkRevokeReasonValid || selectedActiveNodes.length === 0) return;

		isBulkRevoking = true;
		let successCount = 0;
		let failCount = 0;
		const targets = [...selectedActiveNodes];

		for (const node of targets) {
			try {
				await adminSession.client.operator.nodes.revoke(node.nodeId, trimmedBulkRevokeReason);
				successCount++;
			} catch (_) {
				failCount++;
			}
		}

		isBulkRevoking = false;
		bulkRevokeDialogOpen = false;

		if (successCount > 0) {
			toastStore.success(`Revoked ${successCount} node(s).`, 'Bulk Revocation Complete');
		}
		if (failCount > 0) {
			toastStore.error(`Failed to revoke ${failCount} node(s).`, 'Bulk Partial Failure');
		}
		await onRefresh?.();
	}

	function openBulkPruneDialog() {
		bulkPruneReason = 'Operator bulk node registry pruning';
		bulkPruneAttempted = false;
		bulkPruneError = null;
		bulkPruneDialogOpen = true;
	}

	async function handleBulkPrune() {
		bulkPruneAttempted = true;
		bulkPruneError = null;
		if (!bulkPruneReasonValid || selectedRevokedNodes.length === 0) return;

		isBulkPruning = true;
		let successCount = 0;
		let failCount = 0;
		const targets = [...selectedRevokedNodes];
		const prunedIds: string[] = [];

		for (const node of targets) {
			try {
				await adminSession.client.operator.nodes.prune(node.nodeId, trimmedBulkPruneReason);
				successCount++;
				prunedIds.push(node.nodeId);
			} catch (_) {
				failCount++;
			}
		}

		isBulkPruning = false;
		bulkPruneDialogOpen = false;

		const prunedSet = new Set(prunedIds);
		selectedNodeIds = selectedNodeIds.filter((id) => !prunedSet.has(id));
		if (prunedSet.has(selectedNodeId)) {
			selectedNodeId = '';
		}

		if (successCount > 0) {
			toastStore.success(`Permanently pruned ${successCount} node(s).`, 'Bulk Prune Complete');
		}
		if (failCount > 0) {
			toastStore.error(`Failed to prune ${failCount} node(s).`, 'Bulk Partial Failure');
		}
		await onRefresh?.();
	}
</script>

<div data-slot="nodes-panel" class="flex flex-col gap-3">
	<AdminMasterDetail
		columns={nodeColumns}
		data={filteredNodes}
		keyField="nodeId"
		bind:selectedId={selectedNodeId}
		selectable={true}
		bind:selectedIds={selectedNodeIds}
		bind:page
		loading={isLoading}
		ariaLabel="Registered crawler nodes"
		emptyTitle="No registered nodes"
		emptyDescription="Register a crawler node or adjust your search and status filters."
		inspectorTitle={selectedNode?.nodeId ?? 'Node Inspector'}
		inspectorDescription={selectedNode ? `${selectedNode.status} · ${selectedNode.heartbeatState ?? 'offline'}` : undefined}
	>
		{#snippet bulkActions()}
			<div class="flex items-center gap-2">
				{#if selectedActiveNodes.length > 0}
					<Button
						variant="destructive"
						size="xs"
						onclick={openBulkRevokeDialog}
					>
						<ShieldAlert size={13} />
						<span>Revoke ({selectedActiveNodes.length})</span>
					</Button>
				{/if}
				{#if selectedRevokedNodes.length > 0}
					<Button
						variant="destructive"
						size="xs"
						onclick={openBulkPruneDialog}
					>
						<Trash2 size={13} />
						<span>Prune ({selectedRevokedNodes.length})</span>
					</Button>
				{/if}
			</div>
		{/snippet}
		{#snippet toolbar()}
			<AdminFilterBar
				bind:searchQuery
				searchPlaceholder="Filter nodes by ID, job, heartbeat, or platform..."
				{facets}
				resultCount={filteredNodes.length}
				totalCount={nodes.length}
			>
				{#snippet actions()}
					<Button variant="primary" size="sm" onclick={openRegisterDialog}>
						<Plus size={14} />
						<span>Register Node</span>
					</Button>
				{/snippet}
			</AdminFilterBar>
		{/snippet}

		{#snippet emptyAction()}
			<Button variant="primary" size="sm" onclick={openRegisterDialog}>
				<Plus size={14} />
				<span>Register Node</span>
			</Button>
		{/snippet}

		{#snippet rowActions(node: OperatorNodeRecord)}
			<div class="inline-flex items-center justify-end gap-1">
				<Button
					variant="ghost"
					size="xs"
					onclick={() => (selectedNodeId = node.nodeId)}
				>
					Inspect
				</Button>
				<DropdownMenu>
					{#snippet trigger()}
						<span
							aria-label={`Actions for ${node.nodeId}`}
							class={cn(
								CONTROL_HEIGHTS.xs,
								COMPONENT_PRESETS.button.ghost,
								'inline-flex items-center justify-center px-1.5 rounded-lg'
							)}
						>
							<MoreHorizontal size={14} />
						</span>
					{/snippet}
					<DropdownItem label="Inspect Node" onclick={() => (selectedNodeId = node.nodeId)} />
					<DropdownItem label="Rotate / Re-issue Token" onclick={() => openRotateDialog(node)} />
					{#if node.status === 'active'}
						<DropdownItem label="Revoke Node" destructive={true} onclick={() => openRevokeDialog(node)} />
					{:else if node.status === 'revoked'}
						<DropdownItem label="Prune Node" destructive={true} onclick={() => openPruneDialog(node)} />
					{/if}
				</DropdownMenu>
			</div>
		{/snippet}

		{#snippet inspector()}
			{#if selectedNode}
				<PropertyInspector
					embedded={true}
					title="Selected Node"
					subtitle={selectedNode.nodeId}
					properties={selectedInspectorProperties}
				>
					{#snippet headerActions()}
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
					{/snippet}

					{#snippet footerActions()}
						<div class="w-full flex items-center justify-between gap-2 flex-wrap">
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
							{:else if selectedNode.status === 'revoked'}
								<Button
									variant="destructive"
									size="sm"
									onclick={() => openPruneDialog(selectedNode)}
								>
									<Trash2 size={14} />
									<span>Prune Node</span>
								</Button>
							{/if}
						</div>
					{/snippet}
				</PropertyInspector>
			{/if}
		{/snippet}

		{#snippet paginationFooter()}
			{#if nextCursor || filteredNodes.length > 50}
				<div class="flex items-center justify-between gap-3 flex-wrap">
					<span class="text-xs text-muted-foreground tabular-nums">
						{filteredNodes.length} matching node(s) loaded
					</span>
					<div class="flex items-center gap-2">
						{#if filteredNodes.length > 50}
							<Button
								variant="outline"
								size="xs"
								disabled={page <= 0}
								onclick={() => (page = Math.max(0, page - 1))}
							>
								Prev Page
							</Button>
							<Button
								variant="outline"
								size="xs"
								disabled={(page + 1) * 50 >= filteredNodes.length}
								onclick={() => (page = page + 1)}
							>
								Next Page
							</Button>
						{/if}
						{#if nextCursor}
							<Button
								variant="secondary"
								size="xs"
								busy={isLoadingMore}
								onclick={() => void onLoadMore?.()}
							>
								<span>{isLoadingMore ? 'Loading...' : 'Load Next Page'}</span>
								<ChevronRight size={13} />
							</Button>
						{/if}
					</div>
				</div>
			{/if}
		{/snippet}
	</AdminMasterDetail>

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
		alert={true}
		title="Revoke Node Credential"
		description={`Immediate lease cutoff for ${revokeTargetId}. This action cannot be undone.`}
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

	<!-- Single Prune Dialog -->
	<Dialog
		bind:open={pruneDialogOpen}
		alert={true}
		title="Permanently Prune Node"
		description={`Hard-delete all records for ${pruneTargetId} from the registry. This cannot be undone.`}
	>
		<div class="flex flex-col gap-4">
			{#if pruneError}
				<Notice variant="danger" title="Prune Failed">
					{pruneError}
				</Notice>
			{/if}

			<Field id="prune-node-id" label="Target Node ID">
				<Input
					id="prune-node-id"
					value={pruneTargetId}
					readonly={true}
					class="bg-muted/60 text-muted-foreground"
				/>
			</Field>

			<Field
				id="prune-node-reason"
				label="Prune Audit Reason"
				required={true}
				error={pruneReasonError}
			>
				<Textarea
					id="prune-node-reason"
					bind:value={pruneReason}
					rows={2}
					error={Boolean(pruneReasonError)}
				/>
			</Field>
		</div>

		{#snippet actions()}
			<Button
				variant="secondary"
				size="sm"
				disabled={isPruning}
				onclick={() => (pruneDialogOpen = false)}
			>
				Cancel
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isPruning}
				ariaDisabled={!pruneReasonValid}
				onclick={handlePruneNode}
			>
				<Trash2 size={13} />
				<span>{isPruning ? 'Pruning...' : 'Prune Node'}</span>
			</Button>
		{/snippet}
	</Dialog>

	<!-- Bulk Revoke Dialog -->
	<Dialog
		bind:open={bulkRevokeDialogOpen}
		alert={true}
		title="Bulk Revoke Nodes"
		description={`Immediately cut active leases for ${selectedActiveNodes.length} selected active node(s). This cannot be undone.`}
	>
		<div class="flex flex-col gap-4">
			{#if bulkRevokeError}
				<Notice variant="danger" title="Bulk Revocation Failed">
					{bulkRevokeError}
				</Notice>
			{/if}

			<Notice variant="warning" title="Bulk Revocation">
				This will revoke {selectedActiveNodes.length} active node(s) sequentially.
				Active leases will expire immediately.
			</Notice>

			<Field
				id="bulk-revoke-reason"
				label="Revocation Audit Reason"
				required={true}
				error={bulkRevokeReasonError}
			>
				<Textarea
					id="bulk-revoke-reason"
					bind:value={bulkRevokeReason}
					rows={2}
					error={Boolean(bulkRevokeReasonError)}
				/>
			</Field>
		</div>

		{#snippet actions()}
			<Button
				variant="secondary"
				size="sm"
				disabled={isBulkRevoking}
				onclick={() => (bulkRevokeDialogOpen = false)}
			>
				Cancel
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isBulkRevoking}
				ariaDisabled={!bulkRevokeReasonValid}
				onclick={handleBulkRevoke}
			>
				<ShieldAlert size={13} />
				<span>{isBulkRevoking ? 'Revoking...' : `Revoke ${selectedActiveNodes.length}`}</span>
			</Button>
		{/snippet}
	</Dialog>

	<!-- Bulk Prune Dialog -->
	<Dialog
		bind:open={bulkPruneDialogOpen}
		alert={true}
		title="Bulk Prune Nodes"
		description={`Hard-delete all registry records for ${selectedRevokedNodes.length} selected revoked node(s). This cannot be undone.`}
	>
		<div class="flex flex-col gap-4">
			{#if bulkPruneError}
				<Notice variant="danger" title="Bulk Prune Failed">
					{bulkPruneError}
				</Notice>
			{/if}

			<Notice variant="warning" title="Permanent Deletion">
				This will permanently delete {selectedRevokedNodes.length} revoked node(s) from the registry.
				All associated lease and job records will be removed.
			</Notice>

			<Field
				id="bulk-prune-reason"
				label="Prune Audit Reason"
				required={true}
				error={bulkPruneReasonError}
			>
				<Textarea
					id="bulk-prune-reason"
					bind:value={bulkPruneReason}
					rows={2}
					error={Boolean(bulkPruneReasonError)}
				/>
			</Field>
		</div>

		{#snippet actions()}
			<Button
				variant="secondary"
				size="sm"
				disabled={isBulkPruning}
				onclick={() => (bulkPruneDialogOpen = false)}
			>
				Cancel
			</Button>
			<Button
				variant="destructive"
				size="sm"
				busy={isBulkPruning}
				ariaDisabled={!bulkPruneReasonValid}
				onclick={handleBulkPrune}
			>
				<Trash2 size={13} />
				<span>{isBulkPruning ? 'Pruning...' : `Prune ${selectedRevokedNodes.length}`}</span>
			</Button>
		{/snippet}
	</Dialog>
</div>
