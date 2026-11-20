<script lang="ts">
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
	class="w-full bg-white text-slate-900 border border-slate-200 rounded-xl p-3 text-sm
		focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors shadow-xs
		placeholder:text-slate-400
		disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed
		{error ? 'border-red-500 focus:border-red-600 focus:ring-red-600' : ''}
		{className}"
></textarea>
