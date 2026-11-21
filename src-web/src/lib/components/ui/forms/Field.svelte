<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		label,
		description,
		error,
		required = false,
		id,
		class: className = '',
		children
	}: {
		label?: string;
		description?: string;
		error?: string;
		required?: boolean;
		id?: string;
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<div data-slot="field" class={cn('flex flex-col gap-1.5 w-full', className)}>
	{#if label}
		<div class="flex items-center justify-between">
			<label for={id} class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
				{label}
				{#if required}
					<span class="text-destructive font-bold ml-0.5">*</span>
				{/if}
			</label>
		</div>
	{/if}

	{@render children?.()}

	{#if error}
		<p class="text-xs font-medium text-destructive mt-0.5 text-pretty">{error}</p>
	{:else if description}
		<p class="text-xs text-muted-foreground mt-0.5 text-pretty">{description}</p>
	{/if}
</div>
