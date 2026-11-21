<script lang="ts">
	import { Copy, Check } from '@lucide/svelte';

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

<div class="relative rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-xs {className}">
	<div class="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/60 text-xs">
		<span class="font-mono text-slate-400 font-semibold uppercase tracking-wider">{language}</span>
		<button
			type="button"
			onclick={copyCode}
			class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer select-none"
			aria-label="Copy code snippet"
		>
			{#if copied}
				<Check size={13} class="text-emerald-400" />
				<span class="text-[11px] text-emerald-400">Copied</span>
			{:else}
				<Copy size={13} />
				<span class="text-[11px]">Copy</span>
			{/if}
		</button>
	</div>

	<pre class="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed select-text"><code>{code}</code></pre>
</div>
