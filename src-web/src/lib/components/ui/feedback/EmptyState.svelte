<script lang="ts">
	import { FolderOpen } from '@lucide/svelte';
	import type { Component, Snippet } from 'svelte';

	let {
		icon: Icon = FolderOpen,
		title = 'No items found',
		description = 'Try adjusting your search criteria or filters.',
		class: className = '',
		action
	}: {
		icon?: any;
		title?: string;
		description?: string;
		class?: string;
		action?: Snippet;
	} = $props();
</script>

<div class="flex flex-col items-center justify-center p-8 text-center bg-slate-900/60 rounded-2xl border border-dashed border-slate-700 {className}">
	<div class="p-3 bg-slate-800 text-slate-400 rounded-full mb-3 border border-slate-700">
		<Icon size={24} />
	</div>
	<h3 class="text-sm font-semibold text-slate-200">{title}</h3>
	<p class="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">{description}</p>
	{#if action}
		<div class="mt-4">
			{@render action()}
		</div>
	{/if}
</div>
