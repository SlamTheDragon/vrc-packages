<script lang="ts">
	import { DropdownMenu as Primitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

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
			sideOffset={6}
			class="min-w-[180px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-1.5 text-slate-100 z-50 animate-in fade-in-0 zoom-in-95 {className}"
		>
			{@render children?.()}
		</Primitive.Content>
	</Primitive.Portal>
</Primitive.Root>
