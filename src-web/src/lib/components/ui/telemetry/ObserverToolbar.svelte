<script lang="ts">
	import { ZoomIn, ZoomOut, RotateCcw, Filter, Maximize2 } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import Button from '$lib/components/ui/forms/Button.svelte';

	let {
		onZoomIn,
		onZoomOut,
		onReset,
		onFilter,
		onFullscreen,
		class: className = ''
	}: {
		onZoomIn?: () => void;
		onZoomOut?: () => void;
		onReset?: () => void;
		onFilter?: () => void;
		onFullscreen?: () => void;
		class?: string;
	} = $props();
</script>

<div
	data-slot="observer-toolbar"
	class={cn('inline-flex items-center gap-1 p-1 bg-card border border-border rounded-xl shadow-sm', className)}
>
	<Button variant="ghost" size="xs" onclick={onZoomIn} title="Zoom In" aria-label="Zoom In">
		<ZoomIn size={14} />
	</Button>
	<Button variant="ghost" size="xs" onclick={onZoomOut} title="Zoom Out" aria-label="Zoom Out">
		<ZoomOut size={14} />
	</Button>
	<div class="w-px h-4 bg-border mx-0.5"></div>
	<Button variant="ghost" size="xs" onclick={onReset} title="Reset View" aria-label="Reset View">
		<RotateCcw size={14} />
	</Button>
	{#if onFilter}
		<Button variant="ghost" size="xs" onclick={onFilter} title="Filter Layers" aria-label="Filter Layers">
			<Filter size={14} />
		</Button>
	{/if}
	{#if onFullscreen}
		<Button variant="ghost" size="xs" onclick={onFullscreen} title="Fullscreen" aria-label="Fullscreen">
			<Maximize2 size={14} />
		</Button>
	{/if}
</div>
