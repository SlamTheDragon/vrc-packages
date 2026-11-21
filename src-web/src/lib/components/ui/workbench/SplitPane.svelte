<script lang="ts">
	import type { Snippet } from 'svelte';

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
		e.preventDefault();
		isDragging = true;
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
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

	function handlePointerUp() {
		isDragging = false;
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
	}

	function handleKeyDown(e: KeyboardEvent) {
		const step = e.shiftKey ? 5 : 2;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			splitPercent = Math.max(minPercent, splitPercent - step);
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			splitPercent = Math.min(maxPercent, splitPercent + step);
		}
	}
</script>

<div
	bind:this={containerEl}
	data-slot="split-pane"
	data-direction={direction}
	class="w-full h-full flex {direction === 'horizontal' ? 'flex-row' : 'flex-col'} overflow-hidden relative select-none"
>
	<!-- First Pane -->
	<div
		data-slot="split-pane-first"
		style={secondPaneOpen && second
			? direction === 'horizontal'
				? `width: ${splitPercent}%;`
				: `height: ${splitPercent}%;`
			: 'width: 100%; height: 100%;'}
		class="relative overflow-hidden shrink-0"
	>
		{@render first()}
	</div>

	{#if secondPaneOpen && second}
		<!-- Accessible Resizable Splitter Handle -->
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
			onkeydown={handleKeyDown}
			class="{direction === 'horizontal'
				? 'w-2 cursor-col-resize hover:bg-emerald-500/30'
				: 'h-2 cursor-row-resize hover:bg-emerald-500/30'} bg-slate-800 transition-colors flex items-center justify-center shrink-0 z-20 focus:outline-hidden focus:bg-emerald-500/40"
		>
			<div
				class="{direction === 'horizontal'
					? 'w-0.5 h-8'
					: 'h-0.5 w-8'} rounded-full bg-slate-500"
			></div>
		</div>

		<!-- Second Pane -->
		<div
			data-slot="split-pane-second"
			class="flex-1 min-w-0 min-h-0 relative overflow-hidden bg-slate-900"
		>
			{@render second()}
		</div>
	{/if}
</div>
