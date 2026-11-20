<script lang="ts">
	import type { Snippet } from 'svelte';

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

<div class="flex flex-col gap-1.5 w-full {className}">
	{#if label}
		<div class="flex items-center justify-between">
			<label for={id} class="text-xs font-semibold text-slate-700 uppercase tracking-wide">
				{label}
				{#if required}
					<span class="text-red-500 font-bold ml-0.5">*</span>
				{/if}
			</label>
		</div>
	{/if}

	{@render children?.()}

	{#if error}
		<p class="text-xs font-medium text-red-600 mt-0.5">{error}</p>
	{:else if description}
		<p class="text-xs text-slate-500 mt-0.5">{description}</p>
	{/if}
</div>
