<script lang="ts">
	import { Separator as Primitive } from 'bits-ui';
	import { cn } from '$lib/utils';

	let {
		orientation = 'horizontal',
		class: className = ''
	}: {
		orientation?: 'horizontal' | 'vertical';
		class?: string;
	} = $props();
</script>

<Primitive.Root
	data-slot="separator"
	{orientation}
	class={cn(
		'bg-border shrink-0',
		orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
		className
	)}
/>
