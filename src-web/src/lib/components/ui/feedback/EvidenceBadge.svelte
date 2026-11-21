<script lang="ts">
	import { cn } from '$lib/utils';
	import type { EvidenceState } from '$lib/components/ui/types';
	import { EVIDENCE_TOKENS, CONTROL_HEIGHTS } from '$lib/components/ui/tokens';
	import { ShieldCheck, CheckCircle2, Sparkles, HelpCircle, AlertTriangle, Clock } from '@lucide/svelte';

	let {
		state = 'illustrative',
		size = 'md',
		showIcon = true,
		showLabel = true,
		class: className = ''
	}: {
		state?: EvidenceState;
		size?: 'sm' | 'md';
		showIcon?: boolean;
		showLabel?: boolean;
		class?: string;
	} = $props();

	const stateIcons: Record<EvidenceState, any> = {
		measured: ShieldCheck,
		qualified: CheckCircle2,
		illustrative: Sparkles,
		unavailable: HelpCircle,
		failed: AlertTriangle,
		unverified: Clock
	};

	let token = $derived(EVIDENCE_TOKENS[state] ?? EVIDENCE_TOKENS.illustrative);
	let IconComponent = $derived(stateIcons[state] ?? Sparkles);
	let heightClass = $derived(
		size === 'sm'
			? `${CONTROL_HEIGHTS.xs} text-[10px] px-2`
			: `${CONTROL_HEIGHTS.sm} text-xs px-2.5`
	);
</script>

<span
	data-slot="evidence-badge"
	class={cn(
		'vrcp-evidence-badge inline-flex items-center gap-1.5 font-mono font-semibold uppercase tracking-wider select-none',
		heightClass,
		token.badgeClass,
		className
	)}
	title={token.description}
	role="status"
	aria-label={`Evidence State: ${token.label}. ${token.description}`}
>
	{#if showIcon}
		<IconComponent size={size === 'sm' ? 11 : 13} class="shrink-0" aria-hidden="true" />
	{/if}
	{#if showLabel}
		<span>{token.label}</span>
	{/if}
</span>
