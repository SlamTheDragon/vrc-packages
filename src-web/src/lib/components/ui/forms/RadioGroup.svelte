<script lang="ts">
	import { cn } from '$lib/utils';
	import type { SelectOption } from '$lib/components/ui/types';

	const generatedId = $props.id();

	let {
		value = $bindable(''),
		options = [],
		disabled = false,
		name = generatedId,
		orientation = 'vertical',
		class: className = '',
		onValueChange
	}: {
		value?: string;
		options: SelectOption[];
		disabled?: boolean;
		name?: string;
		orientation?: 'vertical' | 'horizontal';
		class?: string;
		onValueChange?: (val: string) => void;
	} = $props();
</script>

<div
	data-slot="radio-group"
	role="radiogroup"
	class={cn('flex', orientation === 'horizontal' ? 'flex-row gap-4' : 'flex-col gap-2', className)}
>
	{#each options as opt (opt.value)}
		{@const isSelected = value === opt.value}
		{@const isDisabled = disabled || opt.disabled}
		<label
			class={cn(
				'flex items-center gap-2.5 cursor-pointer select-none',
				isDisabled && 'opacity-50 cursor-not-allowed'
			)}
		>
			<input
				type="radio"
				{name}
				value={opt.value}
				checked={isSelected}
				disabled={isDisabled}
				onchange={() => {
					value = opt.value;
					onValueChange?.(opt.value);
				}}
				class="sr-only"
			/>
			<div
				class={cn(
					'size-4 rounded-full border bg-background flex items-center justify-center transition-colors shadow-2xs',
					isSelected ? 'border-sidebar-primary' : 'border-input'
				)}
			>
				{#if isSelected}
					<div class="size-2 rounded-full bg-sidebar-primary"></div>
				{/if}
			</div>
			<div class="flex flex-col">
				<span class="text-sm font-medium text-foreground">{opt.label}</span>
				{#if opt.description}
					<span class="text-xs text-muted-foreground">{opt.description}</span>
				{/if}
			</div>
		</label>
	{/each}
</div>
