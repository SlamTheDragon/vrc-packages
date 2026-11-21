<script lang="ts">
	import { Dialog as Primitive } from 'bits-ui';
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		side = 'right',
		title,
		description,
		class: className = '',
		trigger,
		children
	}: {
		open?: boolean;
		side?: 'left' | 'right';
		title?: string;
		description?: string;
		class?: string;
		trigger?: Snippet;
		children?: Snippet;
	} = $props();

	const sideClasses = {
		left: 'left-0 top-0 h-full w-80 max-w-[85vw] border-r animate-in slide-in-from-left duration-200',
		right: 'right-0 top-0 h-full w-80 max-w-[85vw] border-l animate-in slide-in-from-right duration-200'
	};
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
			class="fixed z-50 bg-slate-900 p-6 shadow-2xl border-slate-800 flex flex-col justify-between overflow-y-auto
				{sideClasses[side]} {className}"
		>
			<div class="flex flex-col gap-4">
				<div class="flex items-start justify-between gap-4 pb-3 border-b border-slate-800">
					<div class="flex flex-col gap-1 min-w-0">
						{#if title}
							<Primitive.Title class="text-base font-semibold text-slate-100 tracking-tight">
								{title}
							</Primitive.Title>
						{/if}
						{#if description}
							<Primitive.Description class="text-xs text-slate-400 leading-normal">
								{description}
							</Primitive.Description>
						{/if}
					</div>

					<Primitive.Close class="rounded-lg p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer">
						<X size={18} />
						<span class="sr-only">Close</span>
					</Primitive.Close>
				</div>

				<div class="flex-1">
					{@render children?.()}
				</div>
			</div>
		</Primitive.Content>
	</Primitive.Portal>
</Primitive.Root>
