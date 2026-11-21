import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

export interface MotionOptions {
	duration?: number;
	x?: number;
	y?: number;
	scale?: number;
}

/**
 * Checks the user's reduced-motion OS/browser preference for programmatic transitions.
 */
export function prefersReducedMotion(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/**
 * Compositor-only Svelte transition animating opacity and 3D transform without layout thrash.
 */
export function compositorTransition(
	node: Element,
	{ duration = 150, x = 0, y = 0, scale = 1 }: MotionOptions = {}
): TransitionConfig {
	if (prefersReducedMotion()) {
		return { duration: 0 };
	}

	const style = getComputedStyle(node);
	const parsedOpacity = Number.parseFloat(style.opacity);
	const targetOpacity = Number.isFinite(parsedOpacity) ? parsedOpacity : 1;
	const existingTransform = style.transform === 'none' ? '' : `${style.transform} `;

	return {
		duration,
		easing: cubicOut,
		css: (t, u) => {
			const currentScale = scale + (1 - scale) * t;
			const parts: string[] = [];
			if (x !== 0 || y !== 0) {
				parts.push(`translate3d(${u * x}px, ${u * y}px, 0)`);
			}
			if (scale !== 1) {
				parts.push(`scale(${currentScale})`);
			}
			const transformValue = parts.length > 0 ? ` transform: ${existingTransform}${parts.join(' ')};` : '';
			return `opacity: ${t * targetOpacity};${transformValue}`;
		}
	};
}
