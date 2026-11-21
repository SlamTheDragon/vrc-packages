<script lang="ts">
	import { DropdownMenu as Primitive } from 'bits-ui';
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
			data-slot="dropdown-menu-content"
			sideOffset={6}
			class={cn(
				'min-w-[180px] bg-popover border border-border rounded-2xl shadow-2xl p-1.5 text-popover-foreground z-50 animate-in fade-in-0 zoom-in-95',
				className
			)}
		>
			{@render children?.()}
		</Primitive.Content>
	</Primitive.Portal>
</Primitive.Root>
