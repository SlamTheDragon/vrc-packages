<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	interface Props {
		direction?: 'horizontal' | 'vertical';
		initialSplitPercent?: number;
		minPercent?: number;
		maxPercent?: number;
		secondPaneOpen?: boolean;
		first: Snippet;
		second?: Snippet;
	}

	let {
		direction = 'horizontal',
		initialSplitPercent = 58,
		minPercent = 24,
		maxPercent = 78,
		secondPaneOpen = true,
		first,
		second
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	let splitPercent = $state(initialSplitPercent);
	let isDragging = $state(false);
	let containerEl = $state<HTMLDivElement | null>(null);

	function handlePointerDown(e: PointerEvent) {
		if ((e.target as HTMLElement | null)?.closest('button')) return;
		e.preventDefault();
		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);
		isDragging = true;
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging || !containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		if (direction === 'horizontal') {
			const pct = ((e.clientX - rect.left) / rect.width) * 100;
			splitPercent = Math.max(minPercent, Math.min(maxPercent, Number(pct.toFixed(1))));
		} else {
			const pct = ((e.clientY - rect.top) / rect.height) * 100;
			splitPercent = Math.max(minPercent, Math.min(maxPercent, Number(pct.toFixed(1))));
		}
	}

	function handlePointerUp(e: PointerEvent) {
		isDragging = false;
		const target = e.currentTarget as HTMLElement;
		if (target.hasPointerCapture?.(e.pointerId)) {
			target.releasePointerCapture(e.pointerId);
		}
	}

	function resetSplit() {
		splitPercent = initialSplitPercent;
	}

	function handleKeyDown(e: KeyboardEvent) {
		const step = e.shiftKey ? 5 : 2;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			splitPercent = Math.max(minPercent, splitPercent - step);
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			splitPercent = Math.min(maxPercent, splitPercent + step);
		} else if (e.key === 'Home') {
			e.preventDefault();
			resetSplit();
		}
	}
</script>

<div
	bind:this={containerEl}
	data-slot="split-pane"
	data-direction={direction}
	class={cn(
		'size-full flex overflow-hidden relative select-none',
		direction === 'horizontal' ? 'flex-row' : 'flex-col'
	)}
>
	<div
		data-slot="split-pane-first"
		style={secondPaneOpen && second
			? direction === 'horizontal'
				? `width: ${splitPercent}%;`
				: `height: ${splitPercent}%;`
			: 'width: 100%; height: 100%;'}
		class="relative overflow-hidden shrink-0 min-w-0 min-h-0"
	>
		{@render first()}
	</div>

	{#if secondPaneOpen && second}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			data-slot="split-pane-handle"
			role="separator"
			tabindex={0}
			aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
			aria-valuenow={Math.round(splitPercent)}
			aria-valuemin={minPercent}
			aria-valuemax={maxPercent}
			aria-label="Resize workbench split panels"
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
			onkeydown={handleKeyDown}
			class={cn(
				"relative bg-border touch-none transition-colors flex items-center justify-center shrink-0 z-20 focus-visible:outline-none focus-visible:bg-sidebar-primary/40 before:content-[''] before:absolute",
				direction === 'horizontal'
					? 'w-2 cursor-col-resize hover:bg-sidebar-primary/30 before:inset-y-0 before:-inset-x-2'
					: 'h-2 cursor-row-resize hover:bg-sidebar-primary/30 before:inset-x-0 before:-inset-y-2'
			)}
		>
			<button
				type="button"
				onclick={resetSplit}
				title="Reset split width"
				aria-label="Reset split panel width"
				class={cn(
					'relative z-10 rounded-full bg-muted-foreground/70 hover:bg-sidebar-primary transition-colors cursor-pointer before:content-[""] before:absolute before:-inset-2',
					direction === 'horizontal' ? 'w-1 h-8' : 'h-1 w-8'
				)}
			></button>
		</div>

		<div
			data-slot="split-pane-second"
			class="flex-1 min-w-0 min-h-0 relative overflow-hidden bg-card"
		>
			{@render second()}
		</div>
	{/if}
</div>
