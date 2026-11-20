<script lang="ts" module>
	import type { Component } from 'svelte';

	export interface SidebarNavItem {
		id: string;
		label: string;
		icon?: any;
		href?: string;
		count?: number;
		badge?: string;
	}

	export interface SidebarNavGroup {
		title?: string;
		items: SidebarNavItem[];
		variant?: 'primary' | 'secondary';
	}
</script>

<script lang="ts">
	interface Props {
		groups: SidebarNavGroup[];
		activeId?: string;
		collapsed?: boolean;
		label?: string;
		onselect?: (item: SidebarNavItem) => void;
	}

	let { groups, activeId, collapsed = false, label = 'Navigation', onselect }: Props = $props();
</script>

<nav
	aria-label={label}
	class="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-1 select-none"
>
	{#each groups as group, gi (gi)}
		{#if gi > 0}
			<div class="my-2 border-t border-slate-200"></div>
		{/if}
		{#if !collapsed && group.title}
			<div class="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
				{group.title}
			</div>
		{/if}
		{#each group.items as item (item.id)}
			{@const active = item.id === activeId}
			{@const Icon = item.icon}
			{@const cls = `group relative flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl no-underline transition-colors cursor-pointer ${
				collapsed ? 'justify-center' : 'justify-between'
			} ${
				active
					? 'bg-emerald-50 text-emerald-950 border border-emerald-300/80 font-semibold shadow-2xs'
					: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
			}`}
			{#snippet content()}
				<div class="flex items-center gap-3 min-w-0">
					{#if Icon}
						<Icon
							size={18}
							class="shrink-0 transition-colors {active
								? 'text-emerald-700'
								: 'text-slate-500 group-hover:text-slate-900'}"
						/>
					{/if}
					{#if !collapsed}
						<span class="truncate">{item.label}</span>
					{/if}
				</div>
				{#if !collapsed && item.badge}
					<span
						class="text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 {active
							? 'bg-emerald-100 text-emerald-800 border-emerald-200'
							: 'bg-slate-100 text-slate-600 border-slate-200'}"
					>
						{item.badge}
					</span>
				{:else if !collapsed && item.count !== undefined}
					<span class="text-[11px] px-1.5 py-0.2 rounded font-mono bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
						{item.count}
					</span>
				{/if}
			{/snippet}

			{#if item.href}
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					title={collapsed ? item.label : undefined}
					class={cls}
					onclick={() => onselect?.(item)}
				>
					{@render content()}
				</a>
			{:else}
				<button
					type="button"
					aria-pressed={active}
					title={collapsed ? item.label : undefined}
					class={cls}
					onclick={() => onselect?.(item)}
				>
					{@render content()}
				</button>
			{/if}
		{/each}
	{/each}
</nav>
