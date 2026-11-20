<script lang="ts">
	import { Image } from '@lucide/svelte';

	let {
		label = 'Asset Diagram',
		dimensions = '100% x 200px',
		class: className = ''
	}: {
		label?: string;
		dimensions?: string;
		class?: string;
	} = $props();
</script>

<div class="flex flex-col items-center justify-center p-6 bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-center select-none {className}">
	<div class="p-2.5 rounded-full bg-white text-slate-400 border border-slate-200 mb-2">
		<Image size={20} />
	</div>
	<span class="text-xs font-semibold text-slate-700">{label}</span>
	<span class="text-[10px] font-mono text-slate-400 mt-0.5">{dimensions}</span>
</div>
