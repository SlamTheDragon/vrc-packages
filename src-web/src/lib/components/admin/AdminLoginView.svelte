<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '$lib/components/ui/display/Card.svelte';
	import Codeblock from '$lib/components/ui/display/Codeblock.svelte';
	import Separator from '$lib/components/ui/display/Separator.svelte';
	import VRCPEmblem from '$lib/components/ui/display/VRCPEmblem.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Input from '$lib/components/ui/forms/Input.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import EvidenceBadge from '$lib/components/ui/feedback/EvidenceBadge.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import {
		adminSession,
		COORDINATOR_PRESETS,
		isValidCoordinatorUrl,
		type AdminRole
	} from '$lib/stores/admin-session.svelte';
	import {
		KeyRound,
		ShieldCheck,
		Scale,
		Activity,
		CheckCircle2,
		LogOut,
		ArrowRight,
		Globe
	} from '@lucide/svelte';

	let selectedPreset = $state<string>(COORDINATOR_PRESETS[0].value);
	let customUrlInput = $state<string>(COORDINATOR_PRESETS[0].value);
	let selectedRole = $state<AdminRole>('operator');
	let tokenInput = $state<string>('');

	const presetOptions = [
		...COORDINATOR_PRESETS.map((p) => ({
			value: p.value,
			label: p.label,
			description: p.description
		})),
		{
			value: 'custom',
			label: 'Custom Coordinator Origin',
			description: 'Specify a custom HTTPS or local loopback URL'
		}
	];

	const roleOptions = [
		{
			value: 'operator',
			label: 'Operator (64-character hex secret)',
			description: 'Full access to /v1/operator/* governance, catalog, leads, nodes, and policies'
		},
		{
			value: 'moderator',
			label: 'Moderator (vrcp_usr_<64-hex> user token)',
			description: 'Access to /v1/moderator/ratings and /v1/moderator/apps queues'
		}
	];

	onMount(() => {
		adminSession.hydrateFromSessionStorage();
		customUrlInput = adminSession.coordinatorUrl;
		selectedRole = adminSession.role;
		tokenInput = adminSession.token;
		const matchingPreset = COORDINATOR_PRESETS.find((p) => p.value === adminSession.coordinatorUrl);
		selectedPreset = matchingPreset ? matchingPreset.value : 'custom';
	});

	function handlePresetChange(val: string) {
		selectedPreset = val;
		if (val !== 'custom') {
			customUrlInput = val;
			adminSession.setCoordinatorUrl(val);
		}
	}

	function handleUrlInput() {
		adminSession.setCoordinatorUrl(customUrlInput);
		const matchingPreset = COORDINATOR_PRESETS.find((p) => p.value === customUrlInput.trim());
		selectedPreset = matchingPreset ? matchingPreset.value : 'custom';
	}

	function handleRoleChange(val: string) {
		if (val === 'operator' || val === 'moderator') {
			selectedRole = val;
			tokenInput = '';
			adminSession.setRole(val);
		}
	}

	function handleTokenInput() {
		adminSession.setToken(tokenInput);
	}

	async function handlePublicProbe() {
		adminSession.setCoordinatorUrl(customUrlInput);
		await adminSession.probePublicCatalog();
	}

	async function handleSignIn() {
		adminSession.setCoordinatorUrl(customUrlInput);
		adminSession.setRole(selectedRole);
		adminSession.setToken(tokenInput);
		const ok = await adminSession.authenticateSession();
		if (ok && typeof window !== 'undefined') {
			window.location.href = selectedRole === 'operator' ? '/operator' : '/moderator';
		}
	}

	function handleClearSession() {
		tokenInput = '';
		adminSession.signOut();
	}

	let urlError = $derived(
		customUrlInput.trim().length > 0 && !isValidCoordinatorUrl(customUrlInput)
			? 'Coordinator URL must use https:// or local loopback http://127.0.0.1 / http://localhost.'
			: undefined
	);

	let tokenFormatError = $derived(
		tokenInput.trim().length > 0 && !adminSession.tokenValidation.valid
			? adminSession.tokenValidation.reason
			: undefined
	);
</script>

<div class="page-stack">
	<div class="page-heading">
		<div class="flex items-center gap-3">
			<div class="p-2.5 rounded-2xl bg-emerald-950/70 border border-emerald-700/60">
				<VRCPEmblem size={28} color="#10b981" />
			</div>
			<div>
				<span class="eyebrow">AUTHENTICATION GATE // /login</span>
				<h1 class="text-2xl font-bold tracking-tight text-slate-100">
					Operator &amp; Moderator Runtime Sign-In
				</h1>
				<p class="text-xs text-slate-400 mt-0.5">
					Credentials are validated in-browser with <code class="font-mono text-emerald-400">vrc-packages-api/auth</code> and kept strictly in runtime memory and <code class="font-mono">sessionStorage</code>.
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<EvidenceBadge state={adminSession.evidenceState} size="md" />
			<Badge variant="emerald" size="sm">Release SDK v0.0.8</Badge>
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
		<div class="lg:col-span-7 flex flex-col gap-6">
			<Card
				title="Coordinator Target & Runtime Credential"
				eyebrow="STEP 1 & 2 // CONFIGURE SESSION"
				accent="emerald"
			>
				{#snippet headerRight()}
					<Badge variant={adminSession.authenticated ? 'emerald' : 'amber'} size="xs">
						{adminSession.authenticated ? 'VERIFIED SESSION' : 'AWAITING VERIFICATION'}
					</Badge>
				{/snippet}

				<div class="flex flex-col gap-4">
					<Field
						id="coordinator-preset"
						label="Coordinator Target Preset"
						description="Choose the live Cloudflare Preview Worker or your local Wrangler dev server."
					>
						<DropdownSelect
							bind:value={selectedPreset}
							options={presetOptions}
							onValueChange={handlePresetChange}
						/>
					</Field>

					<Field
						id="coordinator-url"
						label="Coordinator Base URL"
						required={true}
						error={urlError}
						description="Versioned API requests are dispatched to /v1/operator/*, /v1/moderator/*, and /v1/app/* on this origin."
					>
						<Input
							id="coordinator-url"
							bind:value={customUrlInput}
							oninput={handleUrlInput}
							placeholder="https://vrc-package-crawler-preview.slamthedragon.workers.dev"
							error={Boolean(urlError)}
						/>
					</Field>

					<Separator />

					<Field
						id="admin-role"
						label="Governance Role"
						required={true}
						description="Operators use a 64-character hex secret. Moderators use an age-verified vrcp_usr_<64-hex> token."
					>
						<DropdownSelect
							bind:value={selectedRole}
							options={roleOptions}
							onValueChange={handleRoleChange}
						/>
					</Field>

					<Field
						id="admin-token"
						label={selectedRole === 'operator'
							? 'Operator Bearer Token (64-hex)'
							: 'Moderator User Token (vrcp_usr_<64-hex>)'}
						required={true}
						error={tokenFormatError}
						description={selectedRole === 'operator'
							? 'Validated via isOperatorToken() (/^[0-9a-fA-F]{64}$/). Never embedded in static bundles.'
							: 'Validated via isUserToken() (/^vrcp_usr_[a-f0-9]{64}$/). Requires is_moderator=1 and age_verified=1.'}
					>
						<Input
							id="admin-token"
							type="password"
							bind:value={tokenInput}
							oninput={handleTokenInput}
							placeholder={selectedRole === 'operator'
								? 'Enter 64-character hexadecimal operator secret...'
								: 'Enter vrcp_usr_ followed by 64 hexadecimal characters...'}
							error={Boolean(tokenFormatError)}
						/>
					</Field>

					{#if adminSession.lastError}
						<Notice variant="danger" title="Coordinator Request Failed">
							{adminSession.lastError}
						</Notice>
					{/if}

					{#if adminSession.lastProbeMessage && !adminSession.lastError}
						<Notice
							variant={adminSession.authenticated ? 'success' : 'info'}
							title={adminSession.authenticated ? 'Session Authenticated' : 'Coordinator Probe Result'}
						>
							{adminSession.lastProbeMessage}
						</Notice>
					{/if}

					<div class="flex flex-wrap items-center justify-between gap-3 pt-2">
						<div class="flex flex-wrap items-center gap-2">
							<Button
								variant="secondary"
								size="md"
								disabled={adminSession.isProbing || Boolean(urlError)}
								onclick={handlePublicProbe}
							>
								<Globe size={15} />
								<span>{adminSession.isProbing ? 'Probing...' : 'Probe Public Catalog & CORS'}</span>
							</Button>

							{#if adminSession.authenticated || tokenInput.length > 0}
								<Button variant="ghost" size="md" onclick={handleClearSession}>
									<LogOut size={15} />
									<span>Clear Session</span>
								</Button>
							{/if}
						</div>

						<Button
							variant="primary"
							size="md"
							disabled={adminSession.isProbing || Boolean(urlError) || !adminSession.tokenValidation.valid}
							onclick={handleSignIn}
						>
							<KeyRound size={15} />
							<span>
								{adminSession.isProbing
									? 'Verifying...'
									: `Verify & Open ${selectedRole === 'operator' ? 'Operator' : 'Moderator'} Console`}
							</span>
						</Button>
					</div>
				</div>
			</Card>

			{#if adminSession.authenticated}
				<Card
					title="Active Session Ready"
					eyebrow="NAVIGATION SHORTCUTS"
					accent="emerald"
				>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="flex items-center gap-2.5 text-sm text-slate-200">
							<CheckCircle2 size={18} class="text-emerald-400 shrink-0" />
							<span>
								Authenticated as <strong class="font-mono uppercase">{adminSession.role}</strong> against <strong class="font-mono">{adminSession.coordinatorHostname}</strong>.
							</span>
						</div>
						<div class="flex items-center gap-2">
							<Button variant="primary" size="sm" href="/operator">
								<ShieldCheck size={14} />
								<span>Operator Console</span>
								<ArrowRight size={13} />
							</Button>
							<Button variant="secondary" size="sm" href="/moderator">
								<Scale size={14} />
								<span>Moderator Queue</span>
							</Button>
						</div>
					</div>
				</Card>
			{/if}
		</div>

		<div class="lg:col-span-5 flex flex-col gap-6">
			<PropertyInspector
				title="Session & Pipeline Inspector"
				subtitle="Live state from admin-session.svelte.ts and admin-client.ts"
				properties={[
					{
						key: 'Coordinator Origin',
						value: adminSession.coordinatorHostname,
						category: 'Connection'
					},
					{
						key: 'Selected Role',
						value: selectedRole.toUpperCase(),
						category: 'Connection'
					},
					{
						key: 'Token Format Check',
						value: adminSession.tokenValidation.valid ? 'VALID' : 'INCOMPLETE',
						category: 'Connection'
					},
					{
						key: 'Authenticated Probe',
						value: adminSession.authenticated ? 'VERIFIED' : 'NOT VERIFIED',
						category: 'Connection'
					},
					{
						key: 'SDK Package',
						value: `${adminSession.pipelineInfo.sdkPackage} (${adminSession.pipelineInfo.sdkChannel})`,
						category: 'Cross-Pipeline Nuance'
					},
					{
						key: 'Preview-Ahead Bridge',
						value: adminSession.pipelineInfo.previewBridgeActive ? 'ACTIVE (Zod HTTP)' : 'INACTIVE',
						category: 'Cross-Pipeline Nuance'
					}
				]}
			/>

			<Notice variant="info" title="Cross-Pipeline Release SDK Contract (VISION.md T05)">
				<code class="font-mono">src-web/</code> consumes the <strong>release</strong> SDK channel (<code class="font-mono">vrc-packages-api@0.0.8</code>) prepared via <code class="font-mono">bun run prepare:dev preview web</code>. Preview-ahead endpoints (<code class="font-mono">/v1/operator/claims</code>, <code class="font-mono">/v1/operator/apps</code>, and <code class="font-mono">/v1/moderator/*</code>) automatically bridge via strict Zod schemas until <code class="font-mono">v0.0.9</code> promotes on <code class="font-mono">main</code>.
			</Notice>

			<Card title="Local Wrangler Dev Quickstart" eyebrow="LOCAL TESTING">
				<p class="text-xs text-slate-300 leading-relaxed mb-3">
					To test against a local Coordinator instance on <code class="font-mono">http://127.0.0.1:8787</code>, select the <strong>Local Dev Worker</strong> preset above and supply your local <code class="font-mono">OPERATOR_TOKEN</code> (64-hex):
				</p>
				<Codeblock
					language="powershell"
					code={`# Prepare release SDK tarball for src-web/
bun run prepare:dev preview web

# Build and verify src-web/
bun run --cwd src-web check
bun run --cwd src-web build`}
				/>
			</Card>
		</div>
	</div>
</div>
