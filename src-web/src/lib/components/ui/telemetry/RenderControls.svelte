<script lang="ts">
	import { Play, Pause, SkipForward, RotateCcw } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import Button from '$lib/components/ui/forms/Button.svelte';

	let {
		isPlaying = $bindable(false),
		speed = $bindable(1),
		onStep,
		onReset,
		class: className = ''
	}: {
		isPlaying?: boolean;
		speed?: number;
		onStep?: () => void;
		onReset?: () => void;
		class?: string;
	} = $props();

	const speeds = [0.5, 1, 2, 5];
</script>

<div
	data-slot="render-controls"
	class={cn('inline-flex items-center gap-2 p-1.5 bg-card border border-border rounded-xl shadow-sm', className)}
>
	<Button
		variant={isPlaying ? 'amber' : 'primary'}
		size="xs"
		onclick={() => (isPlaying = !isPlaying)}
		title={isPlaying ? 'Pause' : 'Play'}
		aria-label={isPlaying ? 'Pause' : 'Play'}
	>
		{#if isPlaying}
			<Pause size={13} />
			<span class="text-xs">Pause</span>
		{:else}
			<Play size={13} />
			<span class="text-xs">Run</span>
		{/if}
	</Button>

	<Button variant="ghost" size="xs" onclick={onStep} title="Step Forward" aria-label="Step Forward">
		<SkipForward size={13} />
	</Button>

	<Button variant="ghost" size="xs" onclick={onReset} title="Reset" aria-label="Reset">
		<RotateCcw size={13} />
	</Button>

	<div class="w-px h-4 bg-border mx-0.5"></div>

	<div class="inline-flex items-center gap-0.5">
		{#each speeds as s (s)}
			<button
				type="button"
				onclick={() => (speed = s)}
				class={cn(
					'px-1.5 py-0.5 text-[10px] font-mono tabular-nums rounded cursor-pointer transition-colors',
					speed === s
						? 'bg-primary text-primary-foreground font-bold'
						: 'text-muted-foreground hover:bg-muted hover:text-foreground'
				)}
			>
				{s}x
			</button>
		{/each}
	</div>
</div>
