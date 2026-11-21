<script lang="ts">
	import { ToggleGroup as Primitive } from 'bits-ui';
	import type { SelectOption } from '$lib/components/ui/types';

	let {
		value = $bindable(''),
		options = [],
		disabled = false,
		class: className = '',
		onValueChange
	}: {
		value?: string;
		options: SelectOption[];
		disabled?: boolean;
		class?: string;
		onValueChange?: (val: string) => void;
	} = $props();
</script>

<Primitive.Root
	type="single"
	bind:value
	{disabled}
	onValueChange={(val) => {
		if (val !== undefined) {
			onValueChange?.(String(val));
		}
	}}
	class="inline-flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 {className}"
>
	{#each options as opt}
		<Primitive.Item
			value={opt.value}
			disabled={opt.disabled}
			class="px-3 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer select-none
				text-slate-300 hover:text-white
				data-[state=on]:bg-slate-800 data-[state=on]:text-emerald-300 data-[state=on]:shadow-xs data-[state=on]:font-semibold
				disabled:opacity-40 disabled:cursor-not-allowed"
		>
			{opt.label}
		</Primitive.Item>
	{/each}
</Primitive.Root>
