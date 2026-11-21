<script lang="ts" module>
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
	import { cn } from '$lib/utils';

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
	data-slot="sidebar-nav"
	aria-label={label}
	class="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-1 select-none"
>
	{#each groups as group, gi (group.title ?? gi)}
		{#if gi > 0}
			<div class="my-1.5 border-t border-sidebar-border"></div>
		{/if}
		{#if !collapsed && group.title}
			<div class="px-3.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				{group.title}
			</div>
		{/if}
		{#each group.items as item (item.id)}
			{@const active = item.id === activeId}
			{@const Icon = item.icon}
			{@const cls = cn(
				'group relative flex items-center gap-3 py-2 text-sm font-medium rounded-xl no-underline transition-colors cursor-pointer',
				collapsed ? 'justify-center px-2' : 'justify-between px-3.5',
				active
					? 'bg-primary/20 text-sidebar-primary border border-sidebar-primary/40 font-semibold shadow-2xs'
					: 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent border border-transparent'
			)}
			{#snippet content()}
				<div class="flex items-center gap-3 min-w-0">
					{#if Icon}
						<Icon
							size={18}
							class={cn(
								'shrink-0 transition-colors',
								active
									? 'text-sidebar-primary'
									: 'text-muted-foreground group-hover:text-sidebar-foreground'
							)}
						/>
					{/if}
					{#if !collapsed}
						<span class="truncate">{item.label}</span>
					{/if}
				</div>
				{#if !collapsed && item.badge}
					<span
						class={cn(
							'text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0',
							active
								? 'bg-primary/25 text-sidebar-primary border-sidebar-primary/40'
								: 'bg-muted text-muted-foreground border-border'
						)}
					>
						{item.badge}
					</span>
				{:else if !collapsed && item.count !== undefined}
					<span class="text-[11px] px-1.5 py-0.2 rounded font-mono tabular-nums bg-muted text-muted-foreground border border-border shrink-0">
						{item.count}
					</span>
				{/if}
			{/snippet}

			{#if item.href}
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					aria-label={collapsed ? item.label : undefined}
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
					aria-label={collapsed ? item.label : undefined}
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
