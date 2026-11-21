<script lang="ts">
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils';
	import VRCPEmblem from '$lib/components/ui/display/VRCPEmblem.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import EvidenceBadge from '$lib/components/ui/feedback/EvidenceBadge.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import Accordion from '$lib/components/ui/navigation/Accordion.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import AdminFilterBar, { type FacetGroup } from '$lib/components/admin/AdminFilterBar.svelte';
	import { adminSession } from '$lib/stores/admin-session.svelte';
	import {
		ShieldCheck,
		Scale,
		KeyRound,
		Palette,
		ArrowRight,
		Server,
		GitBranch,
		Database,
		SlidersHorizontal,
		Gavel
	} from '@lucide/svelte';

	type EntryCategory = 'ALL' | 'operator' | 'moderator' | 'system';

	interface RouteEntry {
		id: string;
		href: string;
		title: string;
		summary: string;
		category: Exclude<EntryCategory, 'ALL'>;
		badgeLabel: string;
		badgeVariant: 'emerald' | 'amber' | 'sky' | 'neutral';
		icon: any;
		keywords: string;
	}

	const ROUTE_ENTRIES: RouteEntry[] = [
		{
			id: 'operator-overview',
			href: '/operator',
			title: 'Operator Console',
			summary: 'Catalog initialization, source policies, fleet telemetry, and governance.',
			category: 'operator',
			badgeLabel: 'OPERATOR',
			badgeVariant: 'amber',
			icon: ShieldCheck,
			keywords: 'operator console catalog policies fleet governance dashboard'
		},
		{
			id: 'operator-nodes',
			href: '/operator?tab=nodes',
			title: 'Node Fleet Management',
			summary: 'Register crawler nodes, inspect lease status, rotate or revoke tokens.',
			category: 'operator',
			badgeLabel: 'NODES',
			badgeVariant: 'emerald',
			icon: Server,
			keywords: 'nodes crawler fleet heartbeat lease token rotate revoke'
		},
		{
			id: 'operator-leads',
			href: '/operator?tab=leads',
			title: 'Discovery Leads & Crawl Jobs',
			summary: 'Triage pending leads and inspect active coordinator crawl jobs.',
			category: 'operator',
			badgeLabel: 'LEADS & JOBS',
			badgeVariant: 'sky',
			icon: GitBranch,
			keywords: 'leads crawl jobs queue approve reject discovery'
		},
		{
			id: 'operator-policies',
			href: '/operator?tab=policies',
			title: 'Source Profiles & Auto-Queue',
			summary: 'Configure crawl authorization profiles and host auto-queue rules.',
			category: 'operator',
			badgeLabel: 'POLICIES',
			badgeVariant: 'neutral',
			icon: SlidersHorizontal,
			keywords: 'source access profiles auto queue rules rate limits'
		},
		{
			id: 'operator-governance',
			href: '/operator?tab=governance',
			title: 'Governance & Claims',
			summary: 'Resolve takedowns, delegated creator claims, and app candidates.',
			category: 'operator',
			badgeLabel: 'GOVERNANCE',
			badgeVariant: 'neutral',
			icon: Gavel,
			keywords: 'takedowns creator claims app candidates governance'
		},
		{
			id: 'moderator-queue',
			href: '/moderator',
			title: 'Moderator Review Queue',
			summary: 'Inspect content rating reports and downstream app trust reviews.',
			category: 'moderator',
			badgeLabel: 'MODERATOR',
			badgeVariant: 'sky',
			icon: Scale,
			keywords: 'moderator queue content rating safety review apps'
		},
		{
			id: 'auth-login',
			href: '/login',
			title: 'Admin Login & Coordinator Probe',
			summary: 'Select coordinator target, probe CORS reachability, and authenticate.',
			category: 'system',
			badgeLabel: 'AUTH GATE',
			badgeVariant: 'emerald',
			icon: KeyRound,
			keywords: 'login auth token coordinator probe cors bearer'
		},
		{
			id: 'design-showcase',
			href: '/design',
			title: 'UI Design System Showcase',
			summary: 'Tier 1 primitives and workbench layouts in Mist + Teal OKLCH.',
			category: 'system',
			badgeLabel: 'RULE 09',
			badgeVariant: 'neutral',
			icon: Palette,
			keywords: 'design system components mist teal oklch tokens ui'
		}
	];

	let autoRedirectEnabled = $state(false);
	let searchQuery = $state('');
	let categoryFilter = $state<EntryCategory>('ALL');

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

	let filteredEntries = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return ROUTE_ENTRIES.filter((entry) => {
			if (categoryFilter !== 'ALL' && entry.category !== categoryFilter) {
				return false;
			}
			if (!q) return true;
			return (
				entry.title.toLowerCase().includes(q) ||
				entry.summary.toLowerCase().includes(q) ||
				entry.href.toLowerCase().includes(q) ||
				entry.keywords.includes(q)
			);
		});
	});

	const filterFacets = $derived<FacetGroup[]>([
		{
			id: 'category',
			label: 'Workspace Plane',
			value: categoryFilter,
			allValue: 'ALL',
			options: [
				{ value: 'ALL', label: 'All Routes' },
				{ value: 'operator', label: 'Operator' },
				{ value: 'moderator', label: 'Moderator' },
				{ value: 'system', label: 'Auth & System' }
			],
			onChange: (val) => {
				categoryFilter = val as EntryCategory;
			}
		}
	]);
</script>

<div data-slot="admin-index-view" class="flex flex-col gap-5">
	<header class="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-border">
		<div class="flex items-center gap-3">
			<div class="p-2 rounded-2xl bg-primary/15 border border-sidebar-primary/40 shrink-0">
				<VRCPEmblem size={28} color="var(--sidebar-primary)" />
			</div>
			<div>
				<h1 class="text-xl font-bold tracking-tight text-foreground text-balance">
					VRC Packages Admin
				</h1>
				<p class="text-xs text-muted-foreground mt-0.5 text-pretty">
					Operator and Moderator hub (<code class="font-mono text-sidebar-primary">vrc-packages-api-preview</code>).
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
					<span>Open {adminSession.role === 'operator' ? 'Operator' : 'Moderator'}</span>
					<ArrowRight size={14} />
				</Button>
			{:else}
				<Button variant="primary" size="sm" href="/login">
					<KeyRound size={14} />
					<span>Sign In</span>
				</Button>
			{/if}
		</div>
	</header>

	<section
		aria-label="Runtime telemetry summary"
		class="grid grid-cols-2 lg:grid-cols-4 rounded-2xl border border-border bg-card divide-y sm:divide-y-0 sm:divide-x divide-border overflow-hidden shadow-xs"
	>
		<div class="px-4 py-3 flex flex-col gap-1">
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Session Role</span>
			<div class="flex items-center gap-2">
				<span
					class={cn(
						'size-2 rounded-full shrink-0',
						adminSession.authenticated ? 'bg-sidebar-primary' : 'bg-muted-foreground/50'
					)}
				></span>
				<span class="text-sm font-semibold text-foreground uppercase tabular-nums">
					{adminSession.authenticated ? adminSession.role : 'guest'}
				</span>
			</div>
		</div>

		<div class="px-4 py-3 flex flex-col gap-1">
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Coordinator</span>
			<span class="text-sm font-mono font-medium text-foreground truncate" title={adminSession.coordinatorUrl}>
				{adminSession.coordinatorHostname}
			</span>
		</div>

		<div class="px-4 py-3 flex flex-col gap-1">
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">SDK Channel</span>
			<span class="text-sm font-mono font-medium text-foreground truncate">
				{adminSession.pipelineInfo.sdkPackage}
			</span>
		</div>

		<div class="px-4 py-3 flex flex-col gap-1">
			<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Protocol Bridge</span>
			<span class="text-sm font-mono font-medium text-foreground">
				{adminSession.pipelineInfo.previewBridgeActive ? 'HYBRID' : 'NATIVE'}
			</span>
		</div>
	</section>

	{#if autoRedirectEnabled}
		<Notice variant="info" title="Redirecting Session">
			Routing your browser to the active destination route...
		</Notice>
	{/if}

	<section class="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
		<div class="px-4 py-3 border-b border-border bg-card/90">
			<AdminFilterBar
				bind:searchQuery
				searchPlaceholder="Jump to route, plane, or workflow..."
				facets={filterFacets}
				resultCount={filteredEntries.length}
				totalCount={ROUTE_ENTRIES.length}
			/>
		</div>

		{#if filteredEntries.length === 0}
			<EmptyState
				embedded={true}
				icon={Database}
				title="No matching workspace routes"
				description="Clear or adjust the route search filter."
			>
				<Button
					variant="secondary"
					size="xs"
					onclick={() => {
						searchQuery = '';
						categoryFilter = 'ALL';
					}}
				>
					Reset filters
				</Button>
			</EmptyState>
		{:else}
			<div class="divide-y divide-border">
				{#each filteredEntries as entry (entry.id)}
					{@const Icon = entry.icon}
					<div class="px-4 py-3 flex items-center justify-between gap-4 hover:bg-muted/35 transition-colors">
						<div class="flex items-start gap-3 min-w-0">
							<div class="p-2 rounded-xl bg-muted/60 border border-border text-sidebar-primary shrink-0 mt-0.5">
								<Icon size={16} />
							</div>
							<div class="min-w-0 flex flex-col gap-0.5">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="text-sm font-semibold text-foreground">{entry.title}</span>
									<Badge variant={entry.badgeVariant} size="xs">{entry.badgeLabel}</Badge>
									<span class="text-[11px] font-mono text-muted-foreground">{entry.href}</span>
								</div>
								<p class="text-xs text-muted-foreground text-pretty">{entry.summary}</p>
							</div>
						</div>

						<Button variant="secondary" size="xs" href={entry.href} class="shrink-0">
							<span>Open</span>
							<ArrowRight size={13} />
						</Button>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<Accordion
		items={[
			{
				id: 'runtime-contract',
				title: 'Cross-Pipeline Integration Contract (VISION.md T05 & Rule 09)'
			}
		]}
	>
		{#snippet itemSnippet()}
			<PropertyInspector
				embedded={true}
				title="Verified Sector 3 Tier 5 Runtime Contract"
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
		{/snippet}
	</Accordion>
</div>
