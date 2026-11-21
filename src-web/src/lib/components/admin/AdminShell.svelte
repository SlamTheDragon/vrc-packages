<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import VRCPEmblem from '$lib/components/ui/display/VRCPEmblem.svelte';
	import SidebarNav from '$lib/components/ui/navigation/SidebarNav.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import EvidenceBadge from '$lib/components/ui/feedback/EvidenceBadge.svelte';
	import { adminSession } from '$lib/stores/admin-session.svelte';
	import {
		ChevronLeft,
		ChevronRight,
		Menu,
		X,
		ShieldCheck,
		Scale,
		KeyRound,
		Palette,
		LogOut,
		LayoutGrid
	} from '@lucide/svelte';

	let {
		currentPath = '/',
		fullViewport = false,
		children
	}: {
		currentPath?: string;
		fullViewport?: boolean;
		children?: Snippet;
	} = $props();

	let sidebarCollapsed = $state(false);
	let mobileMenuOpen = $state(false);

	onMount(() => {
		adminSession.hydrateFromSessionStorage();
	});

	const governanceLinks = [
		{ id: '/operator', href: '/operator', label: 'Operator Console', icon: ShieldCheck, badge: 'OPS' },
		{ id: '/moderator', href: '/moderator', label: 'Moderator Queue', icon: Scale, badge: 'MOD' }
	];

	const sessionLinks = [
		{ id: '/', href: '/', label: 'Console Hub', icon: LayoutGrid, badge: 'HUB' },
		{ id: '/login', href: '/login', label: 'Admin Login', icon: KeyRound, badge: 'AUTH' }
	];

	const architectureLinks = [
		{ id: '/design', href: '/design', label: 'Design System', icon: Palette, badge: 'UI' }
	];

	let activeId = $derived.by(() => {
		const normalized = currentPath.replace(/\/+$/, '') || '/';
		const all = [...governanceLinks, ...sessionLinks, ...architectureLinks];
		return (
			all.find((item) => {
				if (item.href === '/') return normalized === '/';
				return normalized.startsWith(item.href);
			})?.id ?? '/'
		);
	});

	function toggleSidebar() {
		sidebarCollapsed = !sidebarCollapsed;
	}

	function handleSignOut() {
		adminSession.signOut();
		if (typeof window !== 'undefined') {
			window.location.href = '/login';
		}
	}
</script>

<div class="flex h-dvh w-screen overflow-hidden bg-slate-950 text-slate-100">
	<!-- Desktop Collapsible Left Sidebar (w-16 collapsed, w-64 expanded) -->
	<aside
		aria-label="Primary Sidebar Navigation"
		class="hidden md:flex flex-col shrink-0 h-full bg-slate-900 border-r border-slate-800 transition-[width] duration-200 ease-out z-30 select-none shadow-xs
			{sidebarCollapsed ? 'w-16' : 'w-64'}"
	>
		<!-- Brand Header + Collapse Toggle -->
		<div class="h-16 px-3.5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
			<a
				href="/"
				aria-label="VRC Packages Admin Console Home"
				class="flex items-center gap-2.5 min-w-0 text-slate-100 no-underline group"
			>
				<VRCPEmblem size={26} color="#10b981" />
				{#if !sidebarCollapsed}
					<div class="flex flex-col min-w-0">
						<span class="font-bold text-sm tracking-tight text-slate-100 truncate">
							VRC PACKAGES
						</span>
						<span class="text-[10px] font-mono text-emerald-400 tracking-wider uppercase truncate">
							ADMIN CONSOLE
						</span>
					</div>
				{/if}
			</a>

			<Button
				variant="ghost"
				size="xs"
				onclick={toggleSidebar}
				aria-label={sidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
				title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				class="p-1 text-slate-400 hover:text-slate-100 shrink-0"
			>
				{#if sidebarCollapsed}
					<ChevronRight size={16} />
				{:else}
					<ChevronLeft size={16} />
				{/if}
			</Button>
		</div>

		<!-- Grouped Sidebar Navigation -->
		<SidebarNav
			label="Main navigation"
			collapsed={sidebarCollapsed}
			{activeId}
			groups={[
				{ title: 'GOVERNANCE CONSOLE', items: governanceLinks, variant: 'primary' },
				{ title: 'SESSION & ACCESS', items: sessionLinks, variant: 'secondary' },
				{ title: 'SYSTEM ARCHITECTURE', items: architectureLinks, variant: 'secondary' }
			]}
		/>

		<!-- Sidebar Footer: Pipeline & Session Telemetry -->
		<div class="p-3 border-t border-slate-800 bg-slate-950/70 shrink-0 mt-auto flex flex-col gap-2">
			{#if sidebarCollapsed}
				<div class="flex flex-col items-center justify-center gap-1.5" title="Session status">
					<EvidenceBadge state={adminSession.evidenceState} size="sm" showLabel={false} />
				</div>
			{:else}
				<div class="flex items-center justify-between gap-2">
					<EvidenceBadge state={adminSession.evidenceState} size="sm" />
					<Badge variant={adminSession.authenticated ? 'emerald' : 'neutral'} size="xs">
						{adminSession.authenticated ? adminSession.role.toUpperCase() : 'GUEST'}
					</Badge>
				</div>

				<div class="flex flex-col gap-0.5 text-[11px] font-mono text-slate-400">
					<span class="truncate" title={adminSession.coordinatorUrl}>
						Host: {adminSession.coordinatorHostname}
					</span>
					<div class="flex items-center justify-between">
						<span>SDK: {adminSession.pipelineInfo.sdkChannel}</span>
						<span class="text-[10px] text-emerald-400 font-semibold">
							{adminSession.pipelineInfo.previewBridgeActive ? 'bridge+sdk' : 'native'}
						</span>
					</div>
				</div>

				{#if adminSession.authenticated}
					<Button
						variant="outline"
						size="xs"
						onclick={handleSignOut}
						class="w-full mt-1 text-red-400 border-red-800/70 hover:bg-red-950/50"
					>
						<LogOut size={13} />
						<span>Sign Out</span>
					</Button>
				{/if}
			{/if}
		</div>
	</aside>

	<!-- Main Content Column -->
	<div class="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
		<!-- Mobile Top Bar (< md) -->
		<header class="md:hidden h-14 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 z-30 shadow-xs">
			<a href="/" class="flex items-center gap-2.5 text-slate-100 no-underline">
				<VRCPEmblem size={24} color="#10b981" />
				<span class="font-bold text-sm tracking-tight">VRCP ADMIN</span>
			</a>
			<div class="flex items-center gap-2">
				<EvidenceBadge state={adminSession.evidenceState} size="sm" showLabel={false} />
				<Button
					variant="ghost"
					size="sm"
					onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
					aria-label="Toggle navigation menu"
				>
					{#if mobileMenuOpen}
						<X size={18} />
					{:else}
						<Menu size={18} />
					{/if}
				</Button>
			</div>
		</header>

		<!-- Mobile Slide-Out Drawer Overlay -->
		{#if mobileMenuOpen}
			<div class="md:hidden fixed inset-0 top-14 z-40 bg-slate-950/70 backdrop-blur-xs flex">
				<div class="w-64 h-full bg-slate-900 border-r border-slate-800 flex flex-col justify-between shadow-2xl">
					<SidebarNav
						label="Mobile navigation"
						{activeId}
						onselect={() => (mobileMenuOpen = false)}
						groups={[
							{ title: 'GOVERNANCE CONSOLE', items: governanceLinks, variant: 'primary' },
							{ title: 'SESSION & ACCESS', items: sessionLinks, variant: 'secondary' },
							{ title: 'SYSTEM ARCHITECTURE', items: architectureLinks, variant: 'secondary' }
						]}
					/>
					<div class="p-3 border-t border-slate-800 bg-slate-950 flex flex-col gap-2">
						<div class="flex items-center justify-between text-xs font-mono text-slate-300">
							<span>Role: {adminSession.authenticated ? adminSession.role : 'guest'}</span>
							<Badge variant="emerald" size="xs">release SDK</Badge>
						</div>
						{#if adminSession.authenticated}
							<Button variant="destructive" size="xs" onclick={handleSignOut} class="w-full">
								<LogOut size={13} />
								<span>Sign Out</span>
							</Button>
						{/if}
					</div>
				</div>
				<div class="flex-1 h-full">
					<Button
						variant="ghost"
						size="sm"
						aria-label="Close mobile menu"
						onclick={() => (mobileMenuOpen = false)}
						class="w-full h-full rounded-none opacity-0"
					/>
				</div>
			</div>
		{/if}

		<!-- Route Viewport -->
		{#if fullViewport}
			<main id="main-content" tabindex="-1" class="flex-1 h-full w-full relative overflow-hidden p-0 m-0 bg-slate-950">
				{@render children?.()}
			</main>
		{:else}
			<main id="main-content" tabindex="-1" class="flex-1 h-full w-full overflow-y-auto bg-slate-950">
				<div class="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
					{@render children?.()}
				</div>
			</main>
		{/if}
	</div>
</div>
