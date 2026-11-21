<script lang="ts">
	import { Accordion as Primitive } from 'bits-ui';
	import { ChevronDown } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	interface AccordionItem {
		id: string;
		title: string;
		content?: string;
	}

	let {
		items = [],
		value = $bindable([] as string[]),
		class: className = '',
		itemSnippet
	}: {
		items: AccordionItem[];
		value?: string[];
		class?: string;
		itemSnippet?: Snippet<[AccordionItem]>;
	} = $props();
</script>

<Primitive.Root
	data-slot="accordion"
	type="multiple"
	bind:value
	class={cn('w-full divide-y divide-border border border-border rounded-2xl overflow-hidden bg-card shadow-xs', className)}
>
	{#each items as item (item.id)}
		<Primitive.Item value={item.id} class="group">
			<Primitive.Header class="flex">
				<Primitive.Trigger class="flex flex-1 items-center justify-between p-4 text-sm font-semibold text-foreground hover:text-foreground transition-colors cursor-pointer select-none">
					<span>{item.title}</span>
					<ChevronDown size={16} class="text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
				</Primitive.Trigger>
			</Primitive.Header>
			<Primitive.Content class="overflow-hidden text-sm text-muted-foreground p-4 pt-0 transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
				{#if itemSnippet}
					{@render itemSnippet(item)}
				{:else}
					<p class="leading-relaxed text-pretty">{item.content}</p>
				{/if}
			</Primitive.Content>
		</Primitive.Item>
	{/each}
</Primitive.Root>
