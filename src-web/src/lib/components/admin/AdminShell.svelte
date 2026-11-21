<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils';
	import VRCPEmblem from '$lib/components/ui/display/VRCPEmblem.svelte';
	import SidebarNav from '$lib/components/ui/navigation/SidebarNav.svelte';
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import Sheet from '$lib/components/ui/overlays/Sheet.svelte';
	import { adminSession } from '$lib/stores/admin-session.svelte';
	import {
		Menu,
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
		navOnly = false,
		children
	}: {
		currentPath?: string;
		fullViewport?: boolean;
		navOnly?: boolean;
		children?: Snippet;
	} = $props();

	let isHovered = $state(false);
	let isKeyboardFocused = $state(false);
	let mobileMenuOpen = $state(false);

	let sidebarExpanded = $derived(isHovered || isKeyboardFocused);

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

	function handleFocusIn(event: FocusEvent) {
		const target = event.target as HTMLElement | null;
		if (target?.matches?.(':focus-visible')) {
			isKeyboardFocused = true;
		}
	}

	function handleFocusOut(event: FocusEvent) {
		const currentTarget = event.currentTarget as HTMLElement | null;
		const relatedTarget = event.relatedTarget as Node | null;
		if (!currentTarget || !relatedTarget || !currentTarget.contains(relatedTarget)) {
			isKeyboardFocused = false;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			isHovered = false;
			isKeyboardFocused = false;
		}
	}

	function handleSignOut() {
		adminSession.signOut();
		if (typeof window !== 'undefined') {
			window.location.href = '/login';
		}
	}
</script>

{#snippet desktopRail()}
	<aside
		data-slot="floating-nav-island"
		data-expanded={sidebarExpanded}
		aria-label="Primary Sidebar Navigation"
		onmouseenter={() => (isHovered = true)}
		onmouseleave={() => (isHovered = false)}
		onfocusin={handleFocusIn}
		onfocusout={handleFocusOut}
		onkeydown={handleKeyDown}
		class={cn(
			'hidden md:flex fixed top-4 bottom-4 left-4 z-40 flex-col rounded-2xl border border-sidebar-border bg-sidebar/95 text-sidebar-foreground backdrop-blur-md shadow-2xl overflow-hidden select-none transition-[width] duration-200 ease-out',
			sidebarExpanded ? 'w-64' : 'w-16'
		)}
	>
		<div class="h-14 px-[19px] border-b border-sidebar-border flex items-center shrink-0">
			<a
				href="/"
				aria-label="VRC Packages Admin Home"
				class="flex items-center gap-3 min-w-0 text-sidebar-foreground no-underline"
			>
				<VRCPEmblem size={24} color="var(--sidebar-primary)" />
				<span
					aria-hidden={!sidebarExpanded || undefined}
					class={cn(
						'font-semibold text-sm tracking-tight text-sidebar-foreground whitespace-nowrap truncate transition-[opacity,transform] duration-150 ease-out',
						sidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'
					)}
				>
					VRC Packages
				</span>
			</a>
		</div>

		<SidebarNav
			label="Main navigation"
			collapsed={!sidebarExpanded}
			{activeId}
			groups={[
				{ items: workspaceLinks, variant: 'primary' },
				{ items: systemLinks, variant: 'secondary' }
			]}
		/>

		<div class="p-3 border-t border-sidebar-border shrink-0 mt-auto flex flex-col gap-2">
			<div class="relative h-6 flex items-center overflow-hidden">
				<div
					aria-hidden={sidebarExpanded || undefined}
					title={adminSession.authenticated ? `Signed in (${adminSession.role})` : 'Guest session'}
					aria-label={sidebarExpanded ? undefined : adminSession.authenticated ? `Signed in (${adminSession.role})` : 'Guest session'}
					class={cn(
						'w-[38px] shrink-0 flex justify-center transition-opacity duration-150 ease-out',
						sidebarExpanded ? 'opacity-0 pointer-events-none' : 'opacity-100'
					)}
				>
					<span
						class={cn(
							'size-2.5 rounded-full',
							adminSession.authenticated ? 'bg-sidebar-primary' : 'bg-muted-foreground/50'
						)}
					></span>
				</div>

				<div
					aria-hidden={!sidebarExpanded || undefined}
					class={cn(
						'absolute inset-0 flex items-center justify-between gap-2 px-1 whitespace-nowrap transition-[opacity,transform] duration-150 ease-out',
						sidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'
					)}
				>
					<span class="text-xs text-muted-foreground">Session</span>
					<Badge variant={adminSession.authenticated ? 'emerald' : 'neutral'} size="xs">
						{adminSession.authenticated ? adminSession.role : 'guest'}
					</Badge>
				</div>
			</div>

			{#if adminSession.authenticated}
				<Button
					variant="ghost"
					size="xs"
					onclick={handleSignOut}
					aria-label={sidebarExpanded ? undefined : 'Sign Out'}
					title={sidebarExpanded ? undefined : 'Sign Out'}
					class="w-full justify-start px-3 gap-2.5 overflow-hidden text-muted-foreground hover:text-destructive"
				>
					<LogOut size={14} class="shrink-0" />
					<span
						aria-hidden={!sidebarExpanded || undefined}
						class={cn(
							'whitespace-nowrap transition-[opacity,transform] duration-150 ease-out',
							sidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'
						)}
					>
						Sign Out
					</span>
				</Button>
			{/if}
		</div>
	</aside>
{/snippet}

{#snippet mobileNav()}
	<div class="md:hidden fixed bottom-4 left-4 z-40">
		<Button
			variant="secondary"
			size="md"
			aria-label="Open navigation menu"
			onclick={() => (mobileMenuOpen = true)}
			class="size-11 px-0 rounded-2xl border-sidebar-border bg-sidebar/95 text-sidebar-foreground backdrop-blur-md shadow-2xl hover:bg-sidebar-accent"
		>
			<Menu size={18} />
		</Button>
	</div>

	<Sheet
		bind:open={mobileMenuOpen}
		side="left"
		title="VRC Packages"
		description="Navigation menu"
		class="bg-sidebar text-sidebar-foreground border-sidebar-border p-4"
	>
		<div class="flex flex-col h-full justify-between gap-4">
			<SidebarNav
				label="Mobile navigation"
				{activeId}
				onselect={() => (mobileMenuOpen = false)}
				groups={[
					{ items: workspaceLinks, variant: 'primary' },
					{ items: systemLinks, variant: 'secondary' }
				]}
			/>
			<div class="p-3 border-t border-sidebar-border mt-auto flex flex-col gap-2">
				<div class="flex items-center justify-between text-xs text-muted-foreground px-1">
					<span>Session</span>
					<Badge variant={adminSession.authenticated ? 'emerald' : 'neutral'} size="xs">
						{adminSession.authenticated ? adminSession.role : 'guest'}
					</Badge>
				</div>
				{#if adminSession.authenticated}
					<Button variant="ghost" size="xs" onclick={handleSignOut} class="w-full justify-start text-destructive">
						<LogOut size={13} />
						<span>Sign Out</span>
					</Button>
				{/if}
			</div>
		</div>
	</Sheet>
{/snippet}

{#if navOnly}
	{@render desktopRail()}
	{@render mobileNav()}
{:else}
	<div data-slot="admin-shell" class="relative flex h-dvh w-screen overflow-hidden bg-background text-foreground">
		{@render desktopRail()}
		<div class="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
			{@render mobileNav()}
			{#if fullViewport}
				<main id="main-content" tabindex="-1" class="flex-1 size-full relative overflow-hidden p-0 m-0 bg-background">
					{@render children?.()}
				</main>
			{:else}
				<main id="main-content" tabindex="-1" class="flex-1 size-full overflow-y-auto bg-background md:pl-24">
					<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
						{@render children?.()}
					</div>
				</main>
			{/if}
		</div>
	</div>
{/if}
