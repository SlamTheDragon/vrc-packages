<script lang="ts">
	import type { Platform, NodeCredentialResponse } from 'vrc-packages-api';
	import Card from '$lib/components/ui/display/Card.svelte';
	import Codeblock from '$lib/components/ui/display/Codeblock.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Input from '$lib/components/ui/forms/Input.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import { adminSession, formatAdminError } from '$lib/stores/admin-session.svelte';
	import { KeyRound, ShieldAlert } from '@lucide/svelte';

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

	let nodeId = $state('crawler-node-eu-01');
	let issueReason = $state('Provision capability-scoped headless crawler node');
	let selectedCapabilities = $state<Record<Platform, boolean>>({
		vpm: true,
		github: true,
		booth: false,
		gumroad: false,
		jinxxy: false,
		itch: false,
		curated: false,
		shopify: false,
		sellfy: false,
		custom_domain: false
	});
	let isIssuing = $state(false);
	let issuedCredential = $state<NodeCredentialResponse | null>(null);

	let revokeNodeId = $state('');
	let revokeReason = $state('Node rotation or decommissioning');
	let isRevoking = $state(false);
	let revokeResult = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	async function handleIssueCredential() {
		errorMessage = null;
		issuedCredential = null;
		const capabilities = ALL_PLATFORMS.filter((p) => selectedCapabilities[p]);
		if (capabilities.length === 0) {
			errorMessage = 'Select at least one platform capability for the crawler node.';
			return;
		}
		isIssuing = true;
		try {
			issuedCredential = await adminSession.client.operator.nodes.issue({
				schemaVersion: 1,
				nodeId: nodeId.trim(),
				capabilities,
				reason: issueReason.trim()
			});
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isIssuing = false;
		}
	}

	async function handleRevokeCredential() {
		errorMessage = null;
		revokeResult = null;
		isRevoking = true;
		try {
			const res = await adminSession.client.operator.nodes.revoke(
				revokeNodeId.trim(),
				revokeReason.trim()
			);
			revokeResult = `Node ${res.nodeId} credential status: ${res.status}.`;
		} catch (err) {
			errorMessage = formatAdminError(err);
		} finally {
			isRevoking = false;
		}
	}
</script>

<div class="flex flex-col gap-6">
	{#if errorMessage}
		<Notice variant="danger" title="Node Credential Operation Failed">
			{errorMessage}
		</Notice>
	{/if}

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
		<Card
			title="Issue Crawler Node Credential (POST /v1/operator/nodes)"
			eyebrow="CONTROL PLANE 4A // SHA-256 CAPABILITY TOKEN ISSUANCE"
			accent="emerald"
		>
			{#snippet headerRight()}
				<Badge variant="emerald" size="xs">vrcp_&lt;64-hex&gt;&lt;4-hex&gt;</Badge>
			{/snippet}

			<div class="flex flex-col gap-4">
				<p class="text-xs text-slate-300 leading-relaxed">
					Issues a capability-encoded token (<code class="font-mono">vrcp_&lt;64-hex&gt;&lt;4-hex&gt;</code>) stored strictly as a SHA-256 hash in Coordinator D1. The raw secret is returned once.
				</p>

				<Field id="issue-node-id" label="Node Identifier (nodeId)" required={true}>
					<Input id="issue-node-id" bind:value={nodeId} placeholder="crawler-node-eu-01" />
				</Field>

				<Field label="Assigned Platform Capabilities (10-platform bitmask)" required={true}>
					<div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-xl border border-slate-800 bg-slate-950/70">
						{#each ALL_PLATFORMS as platform}
							<Checkbox
								id={`cap-${platform}`}
								bind:checked={selectedCapabilities[platform]}
								label={platform}
							/>
						{/each}
					</div>
				</Field>

				<Field id="issue-node-reason" label="Audit Reason (>=3 chars)" required={true}>
					<Textarea id="issue-node-reason" bind:value={issueReason} rows={2} />
				</Field>

				<Button variant="primary" size="md" disabled={isIssuing} onclick={handleIssueCredential}>
					<KeyRound size={15} />
					<span>{isIssuing ? 'Issuing Token...' : 'Issue Node Credential'}</span>
				</Button>

				{#if issuedCredential}
					<Notice variant="warning" title="One-Time Secret Issued — Copy Immediately">
						Coordinator D1 stores only the SHA-256 digest. Copy this <code class="font-mono">NODE_TOKEN</code> now for your <code class="font-mono">src-crawler</code> runtime environment:
					</Notice>
					<Codeblock
						language="env"
						code={`NODE_ID=${issuedCredential.nodeId}\nNODE_TOKEN=${issuedCredential.token}\nNODE_CAPABILITIES=${issuedCredential.capabilities.join(',')}`}
					/>
				{/if}
			</div>
		</Card>

		<Card
			title="Revoke Crawler Node Credential (POST /v1/operator/nodes/{id}/revoke)"
			eyebrow="CONTROL PLANE 4B // IMMEDIATE LEASE CUTOFF"
		>
			{#snippet headerRight()}
				<Badge variant="danger" size="xs">REVOCATION</Badge>
			{/snippet}

			<div class="flex flex-col gap-4">
				<p class="text-xs text-slate-300 leading-relaxed">
					Revokes a node credential immediately so future <code class="font-mono">/v1/node/jobs/claim</code> requests fail closed without prematurely releasing in-flight origin pacing reservations.
				</p>

				<Field id="revoke-node-id" label="Target Node Identifier (nodeId)" required={true}>
					<Input id="revoke-node-id" bind:value={revokeNodeId} placeholder="crawler-node-eu-01" />
				</Field>

				<Field id="revoke-node-reason" label="Revocation Audit Reason" required={true}>
					<Textarea id="revoke-node-reason" bind:value={revokeReason} rows={2} />
				</Field>

				<Button
					variant="destructive"
					size="md"
					disabled={isRevoking || !revokeNodeId.trim()}
					onclick={handleRevokeCredential}
				>
					<ShieldAlert size={15} />
					<span>{isRevoking ? 'Revoking...' : 'Revoke Node Credential'}</span>
				</Button>

				{#if revokeResult}
					<Notice variant="success" title="Node Credential Revoked">
						{revokeResult}
					</Notice>
				{/if}
			</div>
		</Card>
	</div>
</div>
