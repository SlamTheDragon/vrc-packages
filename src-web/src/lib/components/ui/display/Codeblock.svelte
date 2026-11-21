<script lang="ts">
	import { Copy, Check } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let {
		code,
		language = 'json',
		class: className = ''
	}: {
		code: string;
		language?: string;
		class?: string;
	} = $props();

	let copied = $state(false);

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch (e) {
			console.error('Clipboard copy failed:', e);
		}
	}
</script>

<div
	data-slot="codeblock"
	class={cn('relative rounded-2xl border border-border bg-background overflow-hidden shadow-xs', className)}
>
	<div class="flex items-center justify-between px-4 py-2 border-b border-border bg-card/60 text-xs">
		<span class="font-mono text-muted-foreground font-semibold uppercase tracking-wider">{language}</span>
		<button
			type="button"
			onclick={copyCode}
			class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer select-none"
			aria-label="Copy code snippet"
		>
			{#if copied}
				<Check size={13} class="text-sidebar-primary" />
				<span class="text-[11px] text-sidebar-primary">Copied</span>
			{:else}
				<Copy size={13} />
				<span class="text-[11px]">Copy</span>
			{/if}
		</button>
	</div>

	<pre class="p-4 text-xs font-mono text-foreground overflow-x-auto leading-relaxed select-text"><code>{code}</code></pre>
</div>
