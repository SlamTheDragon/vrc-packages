<script lang="ts">
	import { DropdownMenu as Primitive } from 'bits-ui';
	import type { Component, Snippet } from 'svelte';

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
	{disabled}
	onSelect={onclick}
	class="flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-medium rounded-xl transition-colors cursor-pointer select-none
		{destructive
			? 'text-red-400 hover:bg-red-950/60'
			: 'text-slate-200 hover:bg-slate-800 hover:text-white'}
		data-[disabled]:opacity-40 data-[disabled]:pointer-events-none {className}"
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
		<span class="text-[10px] font-mono text-slate-400 ml-3 tracking-widest">{shortcut}</span>
	{/if}
</Primitive.Item>
