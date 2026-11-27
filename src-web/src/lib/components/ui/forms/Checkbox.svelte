<script lang="ts">
	import { Checkbox as Primitive } from 'bits-ui';
	import { Check, Minus } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let {
		checked = $bindable(false),
		indeterminate = false,
		disabled = false,
		required = false,
		id,
		name,
		ariaLabel,
		label,
		class: className = '',
		onclick,
		onCheckedChange
	}: {
		checked?: boolean;
		indeterminate?: boolean;
		disabled?: boolean;
		required?: boolean;
		id?: string;
		name?: string;
		ariaLabel?: string;
		label?: string;
		class?: string;
		onclick?: (event: MouseEvent) => void;
		onCheckedChange?: (checked: boolean) => void;
	} = $props();
</script>

<div data-slot="checkbox" class={cn('inline-flex items-center gap-2.5 select-none', className)}>
	<Primitive.Root
		{id}
		{name}
		{disabled}
		{required}
		{indeterminate}
		aria-label={ariaLabel}
		{onclick}
		bind:checked
		onCheckedChange={(val) => {
			if (typeof val === 'boolean') {
				onCheckedChange?.(val);
			}
		}}
		class="size-4 rounded-md border border-input bg-background flex items-center justify-center
			transition-colors cursor-pointer shadow-2xs
			data-[state=checked]:bg-primary data-[state=checked]:border-sidebar-primary data-[state=checked]:text-primary-foreground
			data-[state=indeterminate]:bg-primary/80 data-[state=indeterminate]:border-sidebar-primary data-[state=indeterminate]:text-primary-foreground
			focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40
			disabled:cursor-not-allowed disabled:opacity-50"
	>
		{#snippet children({ checked: isChecked, indeterminate: isIndeterm })}
			{#if isIndeterm}
				<Minus size={12} strokeWidth={3} class="text-primary-foreground" />
			{:else if isChecked}
				<Check size={12} strokeWidth={3} class="text-primary-foreground" />
			{/if}
		{/snippet}
	</Primitive.Root>

	{#if label}
		<label
			for={id}
			class={cn(
				'text-sm font-medium text-foreground cursor-pointer',
				disabled && 'opacity-50 cursor-not-allowed'
			)}
		>
			{label}
		</label>
	{/if}
</div>
