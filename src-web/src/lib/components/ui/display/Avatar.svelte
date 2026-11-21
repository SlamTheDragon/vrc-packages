<script lang="ts">
	import { Avatar as Primitive } from 'bits-ui';
	import { cn } from '$lib/utils';

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

<Primitive.Root
	data-slot="avatar"
	class={cn(
		'relative flex size-8 shrink-0 overflow-hidden rounded-full border border-border select-none',
		className
	)}
>
	{#if src}
		<Primitive.Image {src} {alt} class="aspect-square size-full object-cover" />
	{/if}
	<Primitive.Fallback
		class="flex size-full items-center justify-center bg-muted text-xs font-semibold text-foreground font-mono"
	>
		{fallback}
	</Primitive.Fallback>
</Primitive.Root>
