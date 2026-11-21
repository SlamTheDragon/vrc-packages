<script lang="ts">
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
	role="radiogroup"
	class="flex {orientation === 'horizontal' ? 'flex-row gap-4' : 'flex-col gap-2'} {className}"
>
	{#each options as opt (opt.value)}
		{@const isSelected = value === opt.value}
		{@const isDisabled = disabled || opt.disabled}
		<label
			class="flex items-center gap-2.5 cursor-pointer select-none
				{isDisabled ? 'opacity-50 cursor-not-allowed' : ''}"
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
				class="h-4 w-4 rounded-full border bg-slate-950 flex items-center justify-center transition-colors shadow-2xs
					{isSelected ? 'border-emerald-500' : 'border-slate-600'}"
			>
				{#if isSelected}
					<div class="h-2 w-2 rounded-full bg-emerald-500"></div>
				{/if}
			</div>
			<div class="flex flex-col">
				<span class="text-sm font-medium text-slate-200">{opt.label}</span>
				{#if opt.description}
					<span class="text-xs text-slate-400">{opt.description}</span>
				{/if}
			</div>
		</label>
	{/each}
</div>
