<script lang="ts">
	import { Switch as Primitive } from 'bits-ui';
	import { cn } from '$lib/utils';

	let {
		checked = $bindable(false),
		disabled = false,
		id,
		name,
		label,
		class: className = '',
		onCheckedChange
	}: {
		checked?: boolean;
		disabled?: boolean;
		id?: string;
		name?: string;
		label?: string;
		class?: string;
		onCheckedChange?: (checked: boolean) => void;
	} = $props();
</script>

<div data-slot="switch" class={cn('inline-flex items-center gap-2.5 select-none', className)}>
	<Primitive.Root
		{id}
		{name}
		{disabled}
		bind:checked
		onCheckedChange={(val) => {
			if (typeof val === 'boolean') {
				onCheckedChange?.(val);
			}
		}}
		class="w-9 h-5 rounded-full p-0.5 bg-muted border border-border transition-colors cursor-pointer
			data-[state=checked]:bg-primary data-[state=checked]:border-sidebar-primary
			focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40
			disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center"
	>
		<Primitive.Thumb
			class="size-4 rounded-full bg-foreground shadow-sm transition-transform duration-150 ease-out
				data-[state=checked]:translate-x-4 pointer-events-none block"
		/>
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
