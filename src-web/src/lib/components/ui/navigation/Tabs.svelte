<script lang="ts">
	import { Tabs as Primitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	interface TabItem {
		id: string;
		label: string;
		count?: number;
		disabled?: boolean;
	}

	let {
		value = $bindable(''),
		items = [],
		class: className = '',
		children
	}: {
		value?: string;
		items: TabItem[];
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<Primitive.Root data-slot="tabs" bind:value class={cn('flex flex-col w-full', className)}>
	<Primitive.List class="inline-flex items-center gap-1 p-1 bg-card rounded-xl border border-border">
		{#each items as item (item.id)}
			<Primitive.Trigger
				value={item.id}
				disabled={item.disabled}
				class="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer
					text-muted-foreground hover:text-foreground select-none
					data-[state=active]:bg-muted data-[state=active]:text-sidebar-primary data-[state=active]:shadow-xs data-[state=active]:font-semibold
					disabled:opacity-40 disabled:cursor-not-allowed"
			>
				<span>{item.label}</span>
				{#if item.count !== undefined}
					<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-foreground border border-border font-mono tabular-nums">
						{item.count}
					</span>
				{/if}
			</Primitive.Trigger>
		{/each}
	</Primitive.List>

	<div class="mt-3">
		{@render children?.()}
	</div>
</Primitive.Root>
