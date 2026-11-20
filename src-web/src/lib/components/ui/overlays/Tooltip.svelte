<script lang="ts">
	import { Tooltip as Primitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

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
				sideOffset={4}
				class="z-50 overflow-hidden rounded-lg bg-slate-900 px-2.5 py-1 text-xs text-white shadow-md animate-in fade-in-0 zoom-in-95 {className}"
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
