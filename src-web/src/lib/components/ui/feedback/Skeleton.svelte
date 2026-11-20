<script lang="ts">
	let {
		class: className = ''
	}: {
		class?: string;
	} = $props();
</script>

<div class="animate-pulse rounded-xl bg-slate-200/80 {className}"></div>
