import type { Platform, PriorityLane } from 'vrc-packages-api';
import { cn } from '$lib/utils';
import { COMPONENT_PRESETS, CONTROL_HEIGHTS } from '$lib/components/ui/tokens';

export const ATOMIC_PLATFORMS: readonly Platform[] = [
	'vpm',
	'github',
	'booth',
	'gumroad',
	'jinxxy',
	'itch',
	'shopify',
	'sellfy',
	'custom_domain'
];

export const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
	{ value: 'vpm', label: 'VPM Registry (vpm)' },
	{ value: 'github', label: 'GitHub Repository (github)' },
	{ value: 'booth', label: 'BOOTH.pm (booth)' },
	{ value: 'gumroad', label: 'Gumroad (gumroad)' },
	{ value: 'jinxxy', label: 'Jinxxy (jinxxy)' },
	{ value: 'itch', label: 'itch.io (itch)' },
	{ value: 'shopify', label: 'Shopify (shopify)' },
	{ value: 'sellfy', label: 'Sellfy (sellfy)' },
	{ value: 'custom_domain', label: 'Custom Domain (custom_domain)' }
];

export const PRIORITY_LANE_OPTIONS: { value: string; label: string }[] = [
	{ value: '1', label: 'Lane 1 (Urgent)' },
	{ value: '2', label: 'Lane 2 (High)' },
	{ value: '3', label: 'Lane 3 (Normal)' },
	{ value: '4', label: 'Lane 4 (Background)' }
];

export function toPriorityLane(value: string): PriorityLane {
	const num = Number(value);
	if (num === 1 || num === 2 || num === 3 || num === 4) {
		return num;
	}
	return 3;
}

export const ROW_MENU_TRIGGER_CLASS = cn(
	CONTROL_HEIGHTS.xs,
	COMPONENT_PRESETS.button.ghost,
	'inline-flex items-center justify-center px-1.5 rounded-lg'
);

export function truncateText(value: unknown, maxLen: number): string {
	if (typeof value !== 'string' || value.length === 0) return '—';
	return value.length > maxLen ? `${value.slice(0, maxLen - 3)}...` : value;
}

export function formatTimestamp(value: unknown, fallback = '—'): string {
	if (typeof value !== 'string' || value.length === 0) return fallback;
	return value.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}
