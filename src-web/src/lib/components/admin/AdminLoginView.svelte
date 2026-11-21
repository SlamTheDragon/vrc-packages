<script lang="ts">
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils';
	import { compositorTransition } from '$lib/motion';
	import Card from '$lib/components/ui/display/Card.svelte';
	import Separator from '$lib/components/ui/display/Separator.svelte';
	import VRCPEmblem from '$lib/components/ui/display/VRCPEmblem.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';
	import Input from '$lib/components/ui/forms/Input.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import ToggleGroup from '$lib/components/ui/navigation/ToggleGroup.svelte';
	import {
		adminSession,
		COORDINATOR_PRESETS,
		isValidCoordinatorUrl,
		type AdminRole
	} from '$lib/stores/admin-session.svelte';
	import { KeyRound, Globe, LogOut, ArrowRight, CheckCircle2, ChevronDown } from '@lucide/svelte';

	let selectedPreset = $state<string>(COORDINATOR_PRESETS[0].value);
	let customUrlInput = $state<string>(COORDINATOR_PRESETS[0].value);
	let selectedRole = $state<AdminRole>('operator');
	let tokenInput = $state<string>('');
	let connectionCheckOpen = $state(false);

	const presetOptions = [
		...COORDINATOR_PRESETS.map((p) => ({
			value: p.value,
			label: p.label
		})),
		{
			value: 'custom',
			label: 'Custom Coordinator URL'
		}
	];

	const roleToggleOptions = [
		{ value: 'operator', label: 'Operator' },
		{ value: 'moderator', label: 'Moderator' }
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
		connectionCheckOpen = true;
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
			? 'Use https:// or local loopback http://127.0.0.1 / http://localhost.'
			: undefined
	);

	let tokenFormatError = $derived(
		tokenInput.trim().length > 0 && !adminSession.tokenValidation.valid
			? adminSession.tokenValidation.reason
			: undefined
	);
</script>

<div data-slot="admin-login-view" class="max-w-lg mx-auto py-4 sm:py-8 flex flex-col gap-6">
	<div class="flex flex-col items-center text-center gap-2">
		<VRCPEmblem size={32} color="var(--sidebar-primary)" />
		<h1 class="text-2xl font-semibold tracking-tight text-foreground text-balance">
			Admin Sign-In
		</h1>
		<p class="text-sm text-muted-foreground text-pretty">
			Connect to a Coordinator and verify your runtime bearer token.
		</p>
	</div>

	<Card>
		<div class="flex flex-col gap-5">
			<div class="flex items-center justify-between gap-4">
				<span class="text-sm font-medium text-foreground">Role</span>
				<ToggleGroup
					bind:value={selectedRole}
					options={roleToggleOptions}
					onValueChange={handleRoleChange}
				/>
			</div>

			<div class="flex flex-col gap-3">
				<Field id="coordinator-preset" label="Coordinator Target">
					<DropdownSelect
						bind:value={selectedPreset}
						options={presetOptions}
						onValueChange={handlePresetChange}
					/>
				</Field>

				<Field id="coordinator-url" label="Coordinator URL" required={true} error={urlError}>
					<Input
						id="coordinator-url"
						bind:value={customUrlInput}
						oninput={handleUrlInput}
						placeholder="https://vrc-package-crawler-preview.slamthedragon.workers.dev"
						error={Boolean(urlError)}
					/>
				</Field>
			</div>

			<Field
				id="admin-token"
				label={selectedRole === 'operator' ? 'Operator Token (64-hex)' : 'Moderator Token (vrcp_usr_)'}
				required={true}
				error={tokenFormatError}
			>
				<Input
					id="admin-token"
					type="password"
					bind:value={tokenInput}
					oninput={handleTokenInput}
					placeholder={selectedRole === 'operator'
						? '64-character hex operator secret'
						: 'vrcp_usr_ followed by 64 hex characters'}
					error={Boolean(tokenFormatError)}
				/>
			</Field>

			{#if adminSession.lastError}
				<Notice variant="danger" title="Request Failed">
					{adminSession.lastError}
				</Notice>
			{/if}

			<div class="flex items-center gap-3 pt-1">
				<Button
					variant="primary"
					size="md"
					disabled={adminSession.isProbing || Boolean(urlError) || !adminSession.tokenValidation.valid}
					onclick={handleSignIn}
					class="flex-1"
				>
					<KeyRound size={15} />
					<span>{adminSession.isProbing ? 'Verifying...' : 'Sign In'}</span>
				</Button>

				{#if adminSession.authenticated || tokenInput.length > 0}
					<Button variant="ghost" size="md" onclick={handleClearSession}>
						<LogOut size={15} />
						<span>Clear</span>
					</Button>
				{/if}
			</div>

			{#if adminSession.authenticated}
				<div class="flex items-center justify-between gap-3 pt-1 text-xs text-muted-foreground">
					<div class="flex items-center gap-2 min-w-0">
						<CheckCircle2 size={15} class="text-sidebar-primary shrink-0" />
						<span class="truncate">
							Signed in as <strong class="text-foreground">{adminSession.role}</strong>
						</span>
					</div>
					<Button
						variant="secondary"
						size="xs"
						href={adminSession.role === 'operator' ? '/operator' : '/moderator'}
					>
						<span>Open Console</span>
						<ArrowRight size={13} />
					</Button>
				</div>
			{/if}

			<Separator />

			<div class="flex flex-col gap-3">
				<div class="flex items-center justify-between gap-2">
					<Button
						variant="ghost"
						size="xs"
						aria-expanded={connectionCheckOpen}
						onclick={() => (connectionCheckOpen = !connectionCheckOpen)}
						class="px-1 text-muted-foreground hover:text-foreground"
					>
						<ChevronDown
							size={14}
							class={cn('transition-transform duration-150 ease-out', connectionCheckOpen && 'rotate-180')}
						/>
						<span>Connection Check</span>
					</Button>

					<Button
						variant="secondary"
						size="xs"
						disabled={adminSession.isProbing || Boolean(urlError)}
						onclick={handlePublicProbe}
					>
						<Globe size={13} />
						<span>{adminSession.isProbing ? 'Checking...' : 'Probe Catalog'}</span>
					</Button>
				</div>

				{#if connectionCheckOpen}
					<div
						in:compositorTransition={{ y: -4, duration: 150 }}
						out:compositorTransition={{ y: -4, duration: 110 }}
						class="text-xs text-muted-foreground flex flex-col gap-2 px-1"
					>
						<p class="text-pretty">
							Sends an unauthenticated <code class="font-mono text-foreground">GET /v1/app/index?limit=1</code> request to verify reachability and CORS headers.
						</p>
						{#if adminSession.lastProbeMessage && !adminSession.lastError}
							<Notice
								variant={adminSession.authenticated ? 'success' : 'info'}
								title={adminSession.authenticated ? 'Authenticated' : 'Reachable'}
							>
								{adminSession.lastProbeMessage}
							</Notice>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</Card>
</div>
