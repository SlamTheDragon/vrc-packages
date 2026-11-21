<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import VRCPEmblem from '$lib/components/ui/display/VRCPEmblem.svelte';
	import SidebarNav from '$lib/components/ui/navigation/SidebarNav.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
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

	const workspaceLinks = [
		{ id: '/operator', href: '/operator', label: 'Operator', icon: ShieldCheck },
		{ id: '/moderator', href: '/moderator', label: 'Moderator', icon: Scale }
	];

	const systemLinks = [
		{ id: '/', href: '/', label: 'Overview', icon: LayoutGrid },
		{ id: '/login', href: '/login', label: 'Sign In', icon: KeyRound },
		{ id: '/design', href: '/design', label: 'Design System', icon: Palette }
	];

	const sectionTitles: Record<string, string> = {
		'/': 'Overview',
		'/login': 'Sign In',
		'/operator': 'Operator Console',
		'/moderator': 'Moderator Queue',
		'/design': 'Design System'
	};

	let activeId = $derived.by(() => {
		const normalized = currentPath.replace(/\/+$/, '') || '/';
		const all = [...workspaceLinks, ...systemLinks];
		return (
			all.find((item) => {
				if (item.href === '/') return normalized === '/';
				return normalized.startsWith(item.href);
			})?.id ?? '/'
		);
	});

	let currentSectionTitle = $derived(sectionTitles[activeId] ?? 'Admin Console');

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
		class="hidden md:flex flex-col shrink-0 h-full bg-slate-900/95 border-r border-slate-800/90 transition-[width] duration-200 ease-out z-30 select-none
			{sidebarCollapsed ? 'w-16' : 'w-64'}"
	>
		<!-- Compact Brand Header + Collapse Toggle -->
		<div class="h-14 px-3.5 border-b border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
			<a
				href="/"
				aria-label="VRC Packages Admin Home"
				class="flex items-center gap-2.5 min-w-0 text-slate-100 no-underline"
			>
				<VRCPEmblem size={24} color="#10b981" />
				{#if !sidebarCollapsed}
					<span class="font-semibold text-sm tracking-tight text-slate-100 truncate">
						VRC Packages
					</span>
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
					<ChevronRight size={15} />
				{:else}
					<ChevronLeft size={15} />
				{/if}
			</Button>
		</div>

		<!-- Sidebar Navigation -->
		<SidebarNav
			label="Main navigation"
			collapsed={sidebarCollapsed}
			{activeId}
			groups={[
				{ title: 'Workspace', items: workspaceLinks, variant: 'primary' },
				{ title: 'System', items: systemLinks, variant: 'secondary' }
			]}
		/>

		<!-- Minimal Session Footer -->
		<div class="p-3 border-t border-slate-800/80 shrink-0 mt-auto flex flex-col gap-2">
			{#if sidebarCollapsed}
				<div class="flex justify-center" title={adminSession.authenticated ? adminSession.role : 'Guest'}>
					<span
						class="h-2.5 w-2.5 rounded-full {adminSession.authenticated ? 'bg-emerald-400' : 'bg-slate-600'}"
					></span>
				</div>
			{:else}
				<div class="flex items-center justify-between gap-2 px-1">
					<span class="text-xs text-slate-400">Session</span>
					<Badge variant={adminSession.authenticated ? 'emerald' : 'neutral'} size="xs">
						{adminSession.authenticated ? adminSession.role : 'guest'}
					</Badge>
				</div>

				{#if adminSession.authenticated}
					<Button
						variant="ghost"
						size="xs"
						onclick={handleSignOut}
						class="w-full justify-start text-slate-400 hover:text-red-300"
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
		<!-- Uncluttered Top Bar -->
		<header class="h-14 px-4 sm:px-6 bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-between gap-4 shrink-0 z-30">
			<div class="flex items-center gap-3 min-w-0">
				<div class="md:hidden">
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
				<span class="text-sm font-semibold text-slate-100 truncate">
					{currentSectionTitle}
				</span>
			</div>

			<div class="flex items-center gap-2 min-w-0 text-xs font-mono text-slate-400">
				<span
					class="h-2 w-2 rounded-full shrink-0 {adminSession.authenticated ? 'bg-emerald-400' : 'bg-slate-600'}"
					aria-hidden="true"
				></span>
				<span class="truncate max-w-[180px] sm:max-w-[300px]" title={adminSession.coordinatorUrl}>
					{adminSession.coordinatorHostname}
				</span>
			</div>
		</header>

		<!-- Mobile Slide-Out Drawer Overlay -->
		{#if mobileMenuOpen}
			<div class="md:hidden fixed inset-0 top-14 z-40 bg-slate-950/75 backdrop-blur-xs flex">
				<div class="w-64 h-full bg-slate-900 border-r border-slate-800 flex flex-col justify-between shadow-2xl">
					<SidebarNav
						label="Mobile navigation"
						{activeId}
						onselect={() => (mobileMenuOpen = false)}
						groups={[
							{ title: 'Workspace', items: workspaceLinks, variant: 'primary' },
							{ title: 'System', items: systemLinks, variant: 'secondary' }
						]}
					/>
					<div class="p-3 border-t border-slate-800 flex flex-col gap-2">
						<div class="flex items-center justify-between text-xs text-slate-400 px-1">
							<span>Session</span>
							<Badge variant={adminSession.authenticated ? 'emerald' : 'neutral'} size="xs">
								{adminSession.authenticated ? adminSession.role : 'guest'}
							</Badge>
						</div>
						{#if adminSession.authenticated}
							<Button variant="ghost" size="xs" onclick={handleSignOut} class="w-full justify-start text-red-400">
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
				<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
					{@render children?.()}
				</div>
			</main>
		{/if}
	</div>
</div>
