<script lang="ts">
	import { Tooltip as Primitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		text = '',
		delayDuration = 200,
		class: className = '',
		trigger,
		content
	}: {
		text?: string;
		delayDuration?: number;
		class?: string;
		trigger: Snippet;
		content?: Snippet;
	} = $props();
</script>

<Primitive.Provider>
	<Primitive.Root {delayDuration}>
		<Primitive.Trigger class="inline-flex items-center cursor-pointer select-none">
			{@render trigger()}
		</Primitive.Trigger>

		<Primitive.Portal>
			<Primitive.Content
				data-slot="tooltip-content"
				sideOffset={4}
				class={cn(
					'z-50 overflow-hidden rounded-lg bg-popover border border-border px-2.5 py-1 text-xs text-popover-foreground shadow-lg duration-150 ease-out animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1',
					className
				)}
			>
				{#if content}
					{@render content()}
				{:else}
					<span>{text}</span>
				{/if}
			</Primitive.Content>
		</Primitive.Portal>
	</Primitive.Root>
</Primitive.Provider>
