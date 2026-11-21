<script lang="ts">
	import { Separator as Primitive } from 'bits-ui';

	let {
		orientation = 'horizontal',
		class: className = ''
	}: {
		orientation?: 'horizontal' | 'vertical';
		class?: string;
	} = $props();
</script>

<Primitive.Root
	{orientation}
	class="bg-slate-800 shrink-0
		{orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px'}
		{className}"
/>
