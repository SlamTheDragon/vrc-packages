<script lang="ts">
	import { Avatar as Primitive } from 'bits-ui';

	let {
		src,
		alt = 'Avatar',
		fallback = 'CT',
		class: className = ''
	}: {
		src?: string;
		alt?: string;
		fallback?: string;
		class?: string;
	} = $props();
</script>

<Primitive.Root class="relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full border border-slate-700 select-none {className}">
	{#if src}
		<Primitive.Image {src} {alt} class="aspect-square h-full w-full object-cover" />
	{/if}
	<Primitive.Fallback class="flex h-full w-full items-center justify-center bg-slate-800 text-xs font-semibold text-slate-200 font-mono">
		{fallback}
	</Primitive.Fallback>
</Primitive.Root>
