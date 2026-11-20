<script lang="ts">
	import { Tabs as Primitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

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

<Primitive.Root bind:value class="flex flex-col w-full {className}">
	<Primitive.List class="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
		{#each items as item}
			<Primitive.Trigger
				value={item.id}
				disabled={item.disabled}
				class="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer
					text-slate-600 hover:text-slate-900 select-none
					data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs data-[state=active]:font-semibold
					disabled:opacity-40 disabled:cursor-not-allowed"
			>
				<span>{item.label}</span>
				{#if item.count !== undefined}
					<span class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-mono">
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
