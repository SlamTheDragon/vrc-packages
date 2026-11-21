<script lang="ts">
	import { ToggleGroup as Primitive } from 'bits-ui';
	import { cn } from '$lib/utils';
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
	data-slot="toggle-group"
	type="single"
	bind:value
	{disabled}
	onValueChange={(val) => {
		if (val !== undefined) {
			onValueChange?.(String(val));
		}
	}}
	class={cn('inline-flex items-center gap-1 p-1 bg-card rounded-xl border border-border', className)}
>
	{#each options as opt (opt.value)}
		<Primitive.Item
			value={opt.value}
			disabled={opt.disabled}
			class="px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer select-none
				text-muted-foreground hover:text-foreground
				data-[state=on]:bg-muted data-[state=on]:text-sidebar-primary data-[state=on]:shadow-xs data-[state=on]:font-semibold
				disabled:opacity-40 disabled:cursor-not-allowed"
		>
			{opt.label}
		</Primitive.Item>
	{/each}
</Primitive.Root>
