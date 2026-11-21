<script lang="ts">
	import type { Snippet } from 'svelte';
	import { GripHorizontal, X, Maximize2, Minimize2 } from '@lucide/svelte';

	interface Props {
		title: string;
		subtitle?: string;
		open?: boolean;
		initialX?: number;
		initialY?: number;
		widthClass?: string;
		onClose?: () => void;
		onDock?: () => void;
		children: Snippet;
	}

	let {
		title,
		subtitle,
		open = $bindable(false),
		initialX = 80,
		initialY = 72,
		widthClass = 'w-[420px]',
		onClose,
		onDock,
		children
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	let posX = $state(initialX);
	// svelte-ignore state_referenced_locally
	let posY = $state(initialY);
	let isMinimized = $state(false);
	let isDragging = $state(false);
	let dragOffsetX = 0;
	let dragOffsetY = 0;

	function startDrag(e: PointerEvent) {
		if ((e.target as HTMLElement).closest('button')) return;
		e.preventDefault();
		isDragging = true;
		dragOffsetX = e.clientX - posX;
		dragOffsetY = e.clientY - posY;
		window.addEventListener('pointermove', onDragMove);
		window.addEventListener('pointerup', stopDrag);
	}

	function onDragMove(e: PointerEvent) {
		if (!isDragging) return;
		posX = Math.max(12, Math.min(window.innerWidth - 260, e.clientX - dragOffsetX));
		posY = Math.max(12, Math.min(window.innerHeight - 80, e.clientY - dragOffsetY));
	}

	function stopDrag() {
		isDragging = false;
		window.removeEventListener('pointermove', onDragMove);
		window.removeEventListener('pointerup', stopDrag);
	}
</script>

{#if open}
	<div
		data-slot="floating-panel"
		role="region"
		aria-label={title}
		style="left: {posX}px; top: {posY}px;"
		class="fixed z-30 {widthClass} max-w-[92vw] bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col font-sans select-none"
	>
		<!-- Draggable Window Header -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			data-slot="floating-panel-header"
			onpointerdown={startDrag}
			class="px-3.5 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2 cursor-move"
		>
			<div class="flex items-center gap-2 min-w-0">
				<GripHorizontal class="w-4 h-4 text-slate-400 shrink-0" />
				<div class="min-w-0">
					<h3 class="text-xs font-bold text-slate-100 truncate">{title}</h3>
					{#if subtitle && !isMinimized}
						<p class="text-[10px] text-slate-400 truncate">{subtitle}</p>
					{/if}
				</div>
			</div>

			<div class="flex items-center gap-1 shrink-0">
				{#if onDock}
					<button
						type="button"
						onclick={onDock}
						class="px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-[10px] font-semibold text-slate-200 cursor-pointer"
						title="Dock into split view"
					>
						Split
					</button>
				{/if}
				<button
					type="button"
					onclick={() => (isMinimized = !isMinimized)}
					class="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
					title={isMinimized ? 'Expand panel' : 'Minimize panel'}
				>
					{#if isMinimized}
						<Maximize2 class="w-3.5 h-3.5" />
					{:else}
						<Minimize2 class="w-3.5 h-3.5" />
					{/if}
				</button>
				<button
					type="button"
					onclick={() => {
						open = false;
						onClose?.();
					}}
					class="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/60 cursor-pointer"
					title="Close panel"
				>
					<X class="w-3.5 h-3.5" />
				</button>
			</div>
		</div>

		{#if !isMinimized}
			<div data-slot="floating-panel-body" class="p-4 max-h-[72vh] overflow-y-auto bg-slate-900">
				{@render children()}
			</div>
		{/if}
	</div>
{/if}
