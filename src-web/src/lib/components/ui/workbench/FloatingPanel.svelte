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
		class="fixed z-30 {widthClass} max-w-[92vw] bg-popover rounded-2xl border border-border text-popover-foreground shadow-2xl overflow-hidden flex flex-col font-sans select-none"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			data-slot="floating-panel-header"
			onpointerdown={startDrag}
			class="px-3.5 py-2.5 bg-background/80 border-b border-border flex items-center justify-between gap-2 cursor-move"
		>
			<div class="flex items-center gap-2 min-w-0">
				<GripHorizontal class="size-4 text-muted-foreground shrink-0" />
				<div class="min-w-0">
					<h3 class="text-xs font-bold text-foreground truncate text-balance">{title}</h3>
					{#if subtitle && !isMinimized}
						<p class="text-[10px] text-muted-foreground truncate">{subtitle}</p>
					{/if}
				</div>
			</div>

			<div class="flex items-center gap-1 shrink-0">
				{#if onDock}
					<button
						type="button"
						onclick={onDock}
						class="px-2 py-0.5 rounded-lg bg-secondary border border-border hover:bg-muted text-[10px] font-semibold text-secondary-foreground cursor-pointer"
						title="Dock into split view"
					>
						Split
					</button>
				{/if}
				<button
					type="button"
					onclick={() => (isMinimized = !isMinimized)}
					class="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
					aria-label={isMinimized ? 'Expand panel' : 'Minimize panel'}
					title={isMinimized ? 'Expand panel' : 'Minimize panel'}
				>
					{#if isMinimized}
						<Maximize2 class="size-3.5" />
					{:else}
						<Minimize2 class="size-3.5" />
					{/if}
				</button>
				<button
					type="button"
					onclick={() => {
						open = false;
						onClose?.();
					}}
					class="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/15 cursor-pointer"
					aria-label="Close panel"
					title="Close panel"
				>
					<X class="size-3.5" />
				</button>
			</div>
		</div>

		{#if !isMinimized}
			<div data-slot="floating-panel-body" class="p-4 max-h-[72vh] overflow-y-auto bg-popover">
				{@render children()}
			</div>
		{/if}
	</div>
{/if}
