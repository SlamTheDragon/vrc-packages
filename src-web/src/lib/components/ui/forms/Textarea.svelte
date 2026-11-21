<script lang="ts">
	import { cn } from '$lib/utils';
	import { COMPONENT_PRESETS } from '$lib/components/ui/tokens';

	let {
		value = $bindable(''),
		placeholder = '',
		rows = 3,
		disabled = false,
		readonly = false,
		required = false,
		error = false,
		class: className = '',
		id,
		name,
		oninput,
		onchange
	}: {
		value?: string;
		placeholder?: string;
		rows?: number;
		disabled?: boolean;
		readonly?: boolean;
		required?: boolean;
		error?: boolean;
		class?: string;
		id?: string;
		name?: string;
		oninput?: (e: Event) => void;
		onchange?: (e: Event) => void;
	} = $props();
</script>

<textarea
	data-slot="textarea"
	{id}
	{name}
	{rows}
	{placeholder}
	{disabled}
	{readonly}
	{required}
	bind:value
	{oninput}
	{onchange}
	class={cn(
		COMPONENT_PRESETS.input.base,
		'w-full p-3 text-sm disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed',
		error && 'border-destructive focus:border-destructive focus:ring-destructive',
		className
	)}
></textarea>
