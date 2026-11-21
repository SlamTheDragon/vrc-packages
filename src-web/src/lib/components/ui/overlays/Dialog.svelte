<script lang="ts">
	import { Dialog as Primitive } from 'bits-ui';
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		description,
		class: className = '',
		trigger,
		actions,
		children
	}: {
		open?: boolean;
		title?: string;
		description?: string;
		class?: string;
		trigger?: Snippet;
		actions?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<Primitive.Root bind:open>
	{#if trigger}
		<Primitive.Trigger class="inline-flex items-center cursor-pointer select-none">
			{@render trigger()}
		</Primitive.Trigger>
	{/if}

	<Primitive.Portal>
		<Primitive.Overlay class="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs animate-in fade-in-0" />
		<Primitive.Content
			class="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%]
				rounded-2xl bg-slate-900 p-6 shadow-2xl border border-slate-700 duration-200
				animate-in fade-in-0 zoom-in-95 {className}"
		>
			<div class="flex items-start justify-between gap-4">
				<div class="flex flex-col gap-1 min-w-0">
					{#if title}
						<Primitive.Title class="text-lg font-semibold text-slate-100 tracking-tight">
							{title}
						</Primitive.Title>
					{/if}
					{#if description}
						<Primitive.Description class="text-sm text-slate-400 leading-normal">
							{description}
						</Primitive.Description>
					{/if}
				</div>

				<Primitive.Close class="rounded-lg p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer">
					<X size={18} />
					<span class="sr-only">Close</span>
				</Primitive.Close>
			</div>

			<div class="mt-4">
				{@render children?.()}
			</div>

			{#if actions}
				<div class="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
					{@render actions()}
				</div>
			{/if}
		</Primitive.Content>
	</Primitive.Portal>
</Primitive.Root>
