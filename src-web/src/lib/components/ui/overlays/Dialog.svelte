<script lang="ts">
	import { Dialog as Primitive, AlertDialog as AlertPrimitive } from 'bits-ui';
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	interface Props {
		open?: boolean;
		alert?: boolean;
		title?: string;
		description?: string;
		class?: string;
		trigger?: Snippet;
		actions?: Snippet;
		children?: Snippet;
	}

	let {
		open = $bindable(false),
		alert = false,
		title,
		description,
		class: className = '',
		trigger,
		actions,
		children
	}: Props = $props();

	const overlayClass =
		'fixed inset-0 z-50 bg-background/80 backdrop-blur-xs duration-150 ease-out data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0';

	const contentClass = $derived(
		cn(
			'fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-2xl bg-popover p-6 shadow-2xl border border-border text-popover-foreground duration-200 ease-out data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150',
			className
		)
	);

	const closeBtnClass =
		'rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer';
</script>

{#snippet modalBody()}
	<div class="mt-4">
		{@render children?.()}
	</div>

	{#if actions}
		<div class="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-border">
			{@render actions()}
		</div>
	{/if}
{/snippet}

{#if alert}
	<AlertPrimitive.Root bind:open>
		{#if trigger}
			<AlertPrimitive.Trigger class="inline-flex items-center cursor-pointer select-none">
				{@render trigger()}
			</AlertPrimitive.Trigger>
		{/if}

		<AlertPrimitive.Portal>
			<AlertPrimitive.Overlay class={overlayClass} />
			<AlertPrimitive.Content
				data-slot="dialog-content"
				interactOutsideBehavior="ignore"
				class={contentClass}
			>
				<div class="flex items-start justify-between gap-4">
					<div class="flex flex-col gap-1 min-w-0">
						{#if title}
							<AlertPrimitive.Title class="text-lg font-semibold text-foreground tracking-tight text-balance">
								{title}
							</AlertPrimitive.Title>
						{/if}
						{#if description}
							<AlertPrimitive.Description class="text-sm text-muted-foreground leading-normal text-pretty">
								{description}
							</AlertPrimitive.Description>
						{/if}
					</div>

					<AlertPrimitive.Cancel aria-label="Close alert dialog" class={closeBtnClass}>
						<X size={18} />
						<span class="sr-only">Close</span>
					</AlertPrimitive.Cancel>
				</div>

				{@render modalBody()}
			</AlertPrimitive.Content>
		</AlertPrimitive.Portal>
	</AlertPrimitive.Root>
{:else}
	<Primitive.Root bind:open>
		{#if trigger}
			<Primitive.Trigger class="inline-flex items-center cursor-pointer select-none">
				{@render trigger()}
			</Primitive.Trigger>
		{/if}

		<Primitive.Portal>
			<Primitive.Overlay class={overlayClass} />
			<Primitive.Content data-slot="dialog-content" class={contentClass}>
				<div class="flex items-start justify-between gap-4">
					<div class="flex flex-col gap-1 min-w-0">
						{#if title}
							<Primitive.Title class="text-lg font-semibold text-foreground tracking-tight text-balance">
								{title}
							</Primitive.Title>
						{/if}
						{#if description}
							<Primitive.Description class="text-sm text-muted-foreground leading-normal text-pretty">
								{description}
							</Primitive.Description>
						{/if}
					</div>

					<Primitive.Close aria-label="Close dialog" class={closeBtnClass}>
						<X size={18} />
						<span class="sr-only">Close</span>
					</Primitive.Close>
				</div>

				{@render modalBody()}
			</Primitive.Content>
		</Primitive.Portal>
	</Primitive.Root>
{/if}
