<script lang="ts">
	import { Select as Primitive } from 'bits-ui';
	import { ChevronDown, Check } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { CONTROL_HEIGHTS, COMPONENT_PRESETS } from '$lib/components/ui/tokens';
	import type { ControlSize, SelectOption } from '$lib/components/ui/types';

	let {
		value = $bindable(''),
		options = [],
		placeholder = 'Select an option...',
		size = 'md',
		disabled = false,
		class: className = '',
		onValueChange
	}: {
		value?: string;
		options: SelectOption[];
		placeholder?: string;
		size?: ControlSize;
		disabled?: boolean;
		class?: string;
		onValueChange?: (val: string) => void;
	} = $props();

	let selectedOption = $derived(options.find((opt) => opt.value === value));
	let heightClass = $derived(CONTROL_HEIGHTS[size]);
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
>
	<Primitive.Trigger
		data-slot="dropdown-select-trigger"
		class={cn(
			'group flex items-center justify-between w-full px-3 text-sm font-medium transition-colors duration-150 select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-sidebar-primary disabled:opacity-50 disabled:pointer-events-none',
			COMPONENT_PRESETS.dropdownSelect.trigger,
			heightClass,
			className
		)}
	>
		<span class={cn('truncate', selectedOption ? 'text-foreground' : 'text-muted-foreground font-normal')}>
			{selectedOption ? selectedOption.label : placeholder}
		</span>
		<ChevronDown
			size={16}
			class="text-muted-foreground shrink-0 ml-2 transition-transform duration-150 ease-out group-data-[state=open]:rotate-180"
		/>
	</Primitive.Trigger>

	<Primitive.Portal>
		<Primitive.Content
			data-slot="dropdown-select-content"
			sideOffset={4}
			class={cn(
				COMPONENT_PRESETS.dropdownSelect.content,
				'min-w-[200px] max-h-60 overflow-y-auto p-1 duration-150 ease-out animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1'
			)}
		>
			{#each options as opt (opt.value)}
				<Primitive.Item
					value={opt.value}
					disabled={opt.disabled}
					class="flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer select-none
						hover:bg-muted hover:text-foreground data-[highlighted]:bg-muted data-[highlighted]:text-foreground
						data-[disabled]:opacity-40 data-[disabled]:pointer-events-none"
				>
					<div class="flex flex-col min-w-0">
						<span class="font-medium truncate">{opt.label}</span>
						{#if opt.description}
							<span class="text-xs text-muted-foreground truncate">{opt.description}</span>
						{/if}
					</div>
					{#if value === opt.value}
						<Check size={16} class="text-sidebar-primary shrink-0 ml-2" />
					{/if}
				</Primitive.Item>
			{/each}
		</Primitive.Content>
	</Primitive.Portal>
</Primitive.Root>
