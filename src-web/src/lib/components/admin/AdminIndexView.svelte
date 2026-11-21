<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '$lib/components/ui/display/Card.svelte';
	import StatCard from '$lib/components/ui/display/StatCard.svelte';
	import VRCPEmblem from '$lib/components/ui/display/VRCPEmblem.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import EvidenceBadge from '$lib/components/ui/feedback/EvidenceBadge.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import { adminSession } from '$lib/stores/admin-session.svelte';
	import {
		ShieldCheck,
		Scale,
		KeyRound,
		Palette,
		ArrowRight,
		Activity,
		Server,
		Package
	} from '@lucide/svelte';

	let autoRedirectEnabled = $state(false);

	onMount(() => {
		adminSession.hydrateFromSessionStorage();
		const params = new URLSearchParams(window.location.search);
		if (params.get('redirect') === 'auto') {
			autoRedirectEnabled = true;
			if (adminSession.authenticated) {
				window.location.href = adminSession.role === 'operator' ? '/operator' : '/moderator';
			} else {
				window.location.href = '/login';
			}
		}
	});
</script>

<div data-slot="admin-index-view" class="flex flex-col gap-6">
	<div class="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-border">
		<div class="flex items-center gap-3.5">
			<div class="p-2.5 rounded-2xl bg-primary/15 border border-sidebar-primary/40">
				<VRCPEmblem size={30} color="var(--sidebar-primary)" />
			</div>
			<div>
				<span class="text-xs font-semibold uppercase tracking-wider text-sidebar-primary">
					SECTOR 3 TIER 5 // DOWNSTREAM WEB CONSOLE
				</span>
				<h1 class="text-2xl font-bold tracking-tight text-foreground text-balance">
					VRC Packages Governance &amp; Moderation Hub
				</h1>
				<p class="text-xs text-muted-foreground mt-0.5 text-pretty">
					Cross-pipeline Operator and Moderator administration console consuming the preview SDK (<code class="font-mono text-sidebar-primary">vrc-packages-api-preview</code>).
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2.5">
			<EvidenceBadge state={adminSession.evidenceState} size="md" />
			{#if adminSession.authenticated}
				<Button
					variant="primary"
					size="sm"
					href={adminSession.role === 'operator' ? '/operator' : '/moderator'}
				>
					<span>Open Active {adminSession.role === 'operator' ? 'Operator' : 'Moderator'} Console</span>
					<ArrowRight size={14} />
				</Button>
			{:else}
				<Button variant="primary" size="sm" href="/login">
					<KeyRound size={14} />
					<span>Authenticate Session</span>
				</Button>
			{/if}
		</div>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
		<StatCard
			label="Session Role"
			value={adminSession.authenticated ? adminSession.role.toUpperCase() : 'UNAUTHENTICATED'}
			subtext={adminSession.authenticated ? 'Verified runtime bearer token' : 'Sign in on /login to unlock writes'}
			trend={adminSession.authenticated ? 'ACTIVE' : 'GUEST'}
			trendDirection={adminSession.authenticated ? 'up' : 'neutral'}
			icon={KeyRound}
		/>
		<StatCard
			label="Coordinator Target"
			value={adminSession.coordinatorHostname}
			subtext={adminSession.coordinatorUrl}
			trend="HTTP v1"
			trendDirection="neutral"
			icon={Server}
		/>
		<StatCard
			label="SDK Channel"
			value={adminSession.pipelineInfo.sdkPackage}
			subtext="Prepared via bun run prepare:dev preview web"
			trend={adminSession.pipelineInfo.sdkChannel.toUpperCase()}
			trendDirection="up"
			icon={Package}
		/>
		<StatCard
			label="Protocol Bridge"
			value={adminSession.pipelineInfo.previewBridgeActive ? 'HYBRID' : 'NATIVE'}
			subtext="Native vrc-packages-api-preview SDK (no HTTP bridge)"
			trend="TIER 3B -> 5"
			trendDirection="up"
			icon={Activity}
		/>
	</div>

	{#if autoRedirectEnabled}
		<Notice variant="info" title="Redirecting Session">
			Routing your browser to the active destination route...
		</Notice>
	{/if}

	<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
		<Card
			title="Admin Login & Coordinator Probe"
			eyebrow="ROUTE // /login"
			accent="emerald"
		>
			{#snippet headerRight()}
				<Badge variant="emerald" size="xs">AUTH GATE</Badge>
			{/snippet}

			<p class="text-sm text-muted-foreground leading-relaxed mb-4 text-pretty">
				Configure the target Cloudflare Worker Coordinator URL, run an unauthenticated public catalog &amp; CORS connectivity probe (<code class="font-mono text-xs text-foreground">GET /v1/app/index?limit=1</code>), and verify your runtime <code class="font-mono text-xs text-foreground">64-hex</code> operator or <code class="font-mono text-xs text-foreground">vrcp_usr_</code> moderator token.
			</p>

			{#snippet footer()}
				<div class="flex items-center justify-between">
					<span class="font-mono text-[11px] text-muted-foreground">Zero static bundle secrets</span>
					<Button variant="primary" size="sm" href="/login">
						<KeyRound size={14} />
						<span>Go to Admin Login</span>
					</Button>
				</div>
			{/snippet}
		</Card>

		<Card
			title="Operator Governance Dashboard"
			eyebrow="ROUTE // /operator"
			accent="none"
		>
			{#snippet headerRight()}
				<Badge variant="amber" size="xs">64-HEX TOKEN</Badge>
			{/snippet}

			<p class="text-sm text-muted-foreground leading-relaxed mb-4 text-pretty">
				Manage D1 schema initialization (<code class="font-mono text-xs text-foreground">/v1/operator/init</code>), canonical package catalog inspection, source access profiles, auto-queue rules, discovery lead triage, manual crawl job enqueueing, crawler node credentials, takedowns, creator claims, and app delegation.
			</p>

			{#snippet footer()}
				<div class="flex items-center justify-between">
					<span class="font-mono text-[11px] text-muted-foreground">5 governance planes</span>
					<Button variant="secondary" size="sm" href="/operator">
						<ShieldCheck size={14} />
						<span>Open Operator Console</span>
					</Button>
				</div>
			{/snippet}
		</Card>

		<Card
			title="Moderator Review Dashboard"
			eyebrow="ROUTE // /moderator"
			accent="none"
		>
			{#snippet headerRight()}
				<Badge variant="sky" size="xs">vrcp_usr_ TOKEN</Badge>
			{/snippet}

			<p class="text-sm text-muted-foreground leading-relaxed mb-4 text-pretty">
				Triage package content rating reports (<code class="font-mono text-xs text-foreground">/v1/moderator/ratings</code>) across <code class="font-mono text-xs text-foreground">general</code>, <code class="font-mono text-xs text-foreground">mature</code>, <code class="font-mono text-xs text-foreground">sexual_suggestive</code>, <code class="font-mono text-xs text-foreground">adult_restricted</code>, <code class="font-mono text-xs text-foreground">unknown_restricted</code>, and <code class="font-mono text-xs text-foreground">prohibited</code>, and review downstream application candidates.
			</p>

			{#snippet footer()}
				<div class="flex items-center justify-between">
					<span class="font-mono text-[11px] text-muted-foreground">Requires age-verified moderator</span>
					<Button variant="secondary" size="sm" href="/moderator">
						<Scale size={14} />
						<span>Open Moderator Queue</span>
					</Button>
				</div>
			{/snippet}
		</Card>

		<Card
			title="6-Domain UI Design System Showcase"
			eyebrow="ROUTE // /design"
			accent="none"
		>
			{#snippet headerRight()}
				<Badge variant="neutral" size="xs">RULE 09</Badge>
			{/snippet}

			<p class="text-sm text-muted-foreground leading-relaxed mb-4 text-pretty">
				Inspect all 39 Tier 1 UI primitives across <code class="font-mono text-xs text-foreground">forms/</code>, <code class="font-mono text-xs text-foreground">navigation/</code>, <code class="font-mono text-xs text-foreground">overlays/</code>, <code class="font-mono text-xs text-foreground">feedback/</code>, <code class="font-mono text-xs text-foreground">display/</code>, <code class="font-mono text-xs text-foreground">telemetry/</code>, and <code class="font-mono text-xs text-foreground">workbench/</code>, bound to <code class="font-mono text-xs text-foreground">tokens.ts</code> and <code class="font-mono text-xs text-foreground">CONTROL_HEIGHTS</code>.
			</p>

			{#snippet footer()}
				<div class="flex items-center justify-between">
					<span class="font-mono text-[11px] text-muted-foreground">Mist + Teal OKLCH profile</span>
					<Button variant="secondary" size="sm" href="/design">
						<Palette size={14} />
						<span>Explore Design System</span>
					</Button>
				</div>
			{/snippet}
		</Card>
	</div>

	<PropertyInspector
		title="Cross-Pipeline Integration Contract (VISION.md T05 & Rule 09)"
		subtitle="Verified Sector 3 Tier 5 runtime and dependency isolation telemetry"
		properties={[
			{
				key: 'Consumer Package',
				value: 'vrcp-web (src-web/)',
				category: 'Pipeline Identity'
			},
			{
				key: 'Declared SDK Dependency',
				value: 'vrc-packages-api-preview (preview channel)',
				category: 'Pipeline Identity'
			},
			{
				key: 'Preparation Command',
				value: 'bun run prepare:dev preview web',
				category: 'Pipeline Identity'
			},
			{
				key: 'Native Moderator Namespace',
				value: adminSession.pipelineInfo.nativeModeratorSupport
					? 'native (vrc-packages-api-preview)'
					: 'unavailable',
				category: 'Protocol Compatibility'
			},
			{
				key: 'Credential Storage Scope',
				value: 'Runtime memory + window.sessionStorage only',
				category: 'Security Boundary'
			}
		]}
	/>
</div>
