<script lang="ts">
	import { Popover as Primitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		open = $bindable(false),
		class: className = '',
		trigger,
		children
	}: {
		open?: boolean;
		class?: string;
		trigger: Snippet;
		children?: Snippet;
	} = $props();
</script>

<Primitive.Root bind:open>
	<Primitive.Trigger class="inline-flex items-center cursor-pointer select-none">
		{@render trigger()}
	</Primitive.Trigger>

	<Primitive.Portal>
		<Primitive.Content
			data-slot="popover-content"
			sideOffset={6}
			class={cn(
				'z-50 w-72 rounded-2xl bg-popover p-4 shadow-2xl border border-border text-popover-foreground duration-150 ease-out animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1',
				className
			)}
		>
			{@render children?.()}
		</Primitive.Content>
	</Primitive.Portal>
</Primitive.Root>
