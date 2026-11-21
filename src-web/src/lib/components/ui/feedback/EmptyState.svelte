<script lang="ts">
	import { FolderOpen } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		icon: Icon = FolderOpen,
		title = 'No items found',
		description = 'Try adjusting your search criteria or filters.',
		embedded = false,
		class: className = '',
		action,
		children
	}: {
		icon?: any;
		title?: string;
		description?: string;
		embedded?: boolean;
		class?: string;
		action?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<div
	data-slot="empty-state"
	class={cn(
		'flex flex-col items-center justify-center p-8 text-center',
		!embedded && 'bg-card/60 rounded-2xl border border-dashed border-border',
		className
	)}
>
	<div class="p-3 bg-muted text-muted-foreground rounded-full mb-3 border border-border">
		<Icon size={24} />
	</div>
	<h3 class="text-sm font-semibold text-foreground text-balance">{title}</h3>
	<p class="text-xs text-muted-foreground max-w-sm mt-1 leading-relaxed text-pretty">{description}</p>
	{#if action}
		<div class="mt-4">
			{@render action()}
		</div>
	{:else if children}
		<div class="mt-4">
			{@render children()}
		</div>
	{/if}
</div>
