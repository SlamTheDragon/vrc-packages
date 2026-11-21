<script lang="ts">
	import { DropdownMenu as Primitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		label,
		icon: Icon,
		shortcut,
		disabled = false,
		destructive = false,
		class: className = '',
		onclick,
		children
	}: {
		label?: string;
		icon?: any;
		shortcut?: string;
		disabled?: boolean;
		destructive?: boolean;
		class?: string;
		onclick?: () => void;
		children?: Snippet;
	} = $props();
</script>

<Primitive.Item
	data-slot="dropdown-item"
	{disabled}
	onSelect={onclick}
	class={cn(
		'flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-medium rounded-xl transition-colors cursor-pointer select-none data-[disabled]:opacity-40 data-[disabled]:pointer-events-none',
		destructive
			? 'text-destructive hover:bg-destructive/15'
			: 'text-popover-foreground hover:bg-muted hover:text-foreground',
		className
	)}
>
	<div class="flex items-center gap-2 min-w-0">
		{#if Icon}
			<Icon size={14} class="shrink-0 opacity-70" />
		{/if}
		{#if label}
			<span class="truncate">{label}</span>
		{:else}
			{@render children?.()}
		{/if}
	</div>

	{#if shortcut}
		<span class="text-[10px] font-mono text-muted-foreground ml-3 tracking-widest">{shortcut}</span>
	{/if}
</Primitive.Item>
