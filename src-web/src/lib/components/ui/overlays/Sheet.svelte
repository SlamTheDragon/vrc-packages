<script lang="ts">
	import { Dialog as Primitive } from 'bits-ui';
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

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
		left: 'left-0 top-0 h-full w-80 max-w-[85vw] border-r duration-200 ease-out data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=closed]:duration-150',
		right: 'right-0 top-0 h-full w-80 max-w-[85vw] border-l duration-200 ease-out data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-150'
	};
</script>

<Primitive.Root bind:open>
	{#if trigger}
		<Primitive.Trigger class="inline-flex items-center cursor-pointer select-none">
			{@render trigger()}
		</Primitive.Trigger>
	{/if}

	<Primitive.Portal>
		<Primitive.Overlay
			class="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs duration-150 ease-out data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
		/>
		<Primitive.Content
			data-slot="sheet-content"
			class={cn(
				'fixed z-50 bg-popover p-6 shadow-2xl border-border text-popover-foreground flex flex-col justify-between overflow-y-auto',
				sideClasses[side],
				className
			)}
		>
			<div class="flex flex-1 min-h-0 flex-col gap-4">
				<div class="flex items-start justify-between gap-4 pb-3 border-b border-border">
					<div class="flex flex-col gap-1 min-w-0">
						{#if title}
							<Primitive.Title class="text-base font-semibold text-foreground tracking-tight text-balance">
								{title}
							</Primitive.Title>
						{/if}
						{#if description}
							<Primitive.Description class="text-xs text-muted-foreground leading-normal text-pretty">
								{description}
							</Primitive.Description>
						{/if}
					</div>

					<Primitive.Close
						aria-label="Close sheet"
						class="rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
					>
						<X size={18} />
						<span class="sr-only">Close</span>
					</Primitive.Close>
				</div>

				<div class="flex-1 min-h-0 flex flex-col">
					{@render children?.()}
				</div>
			</div>
		</Primitive.Content>
	</Primitive.Portal>
</Primitive.Root>
