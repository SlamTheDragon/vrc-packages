<script lang="ts">
	import { Slider as Primitive } from 'bits-ui';

	let {
		value = $bindable([50]),
		min = 0,
		max = 100,
		step = 1,
		disabled = false,
		label,
		unit = '',
		showValue = true,
		class: className = '',
		onValueChange
	}: {
		value?: number[];
		min?: number;
		max?: number;
		step?: number;
		disabled?: boolean;
		label?: string;
		unit?: string;
		showValue?: boolean;
		class?: string;
		onValueChange?: (val: number[]) => void;
	} = $props();
</script>

<div class="flex flex-col gap-1.5 w-full {className}">
	{#if label || showValue}
		<div class="flex items-center justify-between text-xs font-medium text-slate-700">
			{#if label}
				<span>{label}</span>
			{/if}
			{#if showValue}
				<span class="font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
					{value[0]}{unit}
				</span>
			{/if}
		</div>
	{/if}

	<Primitive.Root
		type="multiple"
		bind:value
		{min}
		{max}
		{step}
		{disabled}
		onValueChange={(val: number[]) => {
			if (Array.isArray(val)) {
				onValueChange?.(val);
			}
		}}
		class="relative flex w-full touch-none select-none items-center py-1 cursor-pointer
			disabled:opacity-50 disabled:cursor-not-allowed"
	>
		<span class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-slate-200">
			<Primitive.Range class="absolute h-full bg-emerald-600 rounded-full" />
		</span>
		<Primitive.Thumb
			index={0}
			class="block h-4 w-4 rounded-full border-2 border-emerald-600 bg-white shadow-sm transition-colors
				focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30
				disabled:pointer-events-none"
		/>
	</Primitive.Root>
</div>
