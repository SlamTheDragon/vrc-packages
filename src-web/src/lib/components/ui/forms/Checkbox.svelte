<script lang="ts">
	import { Checkbox as Primitive } from 'bits-ui';
	import { Check } from '@lucide/svelte';

	let {
		checked = $bindable(false),
		disabled = false,
		required = false,
		id,
		name,
		label,
		class: className = '',
		onCheckedChange
	}: {
		checked?: boolean;
		disabled?: boolean;
		required?: boolean;
		id?: string;
		name?: string;
		label?: string;
		class?: string;
		onCheckedChange?: (checked: boolean) => void;
	} = $props();
</script>

<div class="inline-flex items-center gap-2.5 select-none {className}">
	<Primitive.Root
		{id}
		{name}
		{disabled}
		{required}
		bind:checked
		onCheckedChange={(val) => {
			if (typeof val === 'boolean') {
				onCheckedChange?.(val);
			}
		}}
		class="w-4 h-4 rounded-md border border-slate-600 bg-slate-950 flex items-center justify-center
			transition-colors cursor-pointer shadow-2xs
			data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-500 data-[state=checked]:text-white
			focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30
			disabled:cursor-not-allowed disabled:opacity-50"
	>
		{#snippet children({ checked: isChecked })}
			{#if isChecked}
				<Check size={12} strokeWidth={3} class="text-white" />
			{/if}
		{/snippet}
	</Primitive.Root>

	{#if label}
		<label for={id} class="text-sm font-medium text-slate-200 cursor-pointer {disabled ? 'opacity-50 cursor-not-allowed' : ''}">
			{label}
		</label>
	{/if}
</div>
