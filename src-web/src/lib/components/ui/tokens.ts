/**
 * Canonical VRCP Web Design System tokens synchronized with src/app.css (Mist + Teal OKLCH).
 */

export const COLORS = {
	surface: {
		base: 'oklch(0.148 0.004 228.8)',
		canvas: 'oklch(0.148 0.004 228.8)',
		subtle: 'oklch(0.275 0.011 216.9)',
		panel: 'oklch(0.218 0.008 223.9)',
		card: 'oklch(0.218 0.008 223.9)',
		elevated: 'oklch(0.275 0.011 216.9)',
		control: 'oklch(0.274 0.006 286.033)',
		input: 'oklch(1 0 0 / 15%)',
		dialog: 'oklch(0.218 0.008 223.9)',
		dropdown: 'oklch(0.218 0.008 223.9)',
		hover: 'oklch(0.275 0.011 216.9)'
	},

	border: {
		default: 'oklch(1 0 0 / 10%)',
		subtle: 'oklch(1 0 0 / 10%)',
		strong: 'oklch(1 0 0 / 15%)',
		bright: 'oklch(0.56 0.021 213.5)',
		interactive: 'oklch(0.704 0.14 182.503)',
		interactiveAmber: 'oklch(0.769 0.188 70.08)',
		interactiveSky: 'oklch(0.715 0.143 215.221)',
		cardResting: 'oklch(1 0 0 / 10%)',
		cardHover: 'oklch(0.56 0.021 213.5)',
		inputResting: 'oklch(1 0 0 / 15%)'
	},

	accent: {
		primary: 'oklch(0.437 0.078 188.216)',
		primaryForeground: 'oklch(0.984 0.014 180.72)',
		teal: 'oklch(0.704 0.14 182.503)',
		tealForeground: 'oklch(0.277 0.046 192.524)',
		amber: 'oklch(0.769 0.188 70.08)',
		sky: 'oklch(0.715 0.143 215.221)'
	},

	status: {
		success: 'oklch(0.704 0.14 182.503)',
		warning: 'oklch(0.769 0.188 70.08)',
		danger: 'oklch(0.704 0.191 22.216)',
		info: 'oklch(0.715 0.143 215.221)'
	},

	text: {
		main: 'oklch(0.987 0.002 197.1)',
		body: 'oklch(0.987 0.002 197.1)',
		muted: 'oklch(0.723 0.014 214.4)',
		dim: 'oklch(0.56 0.021 213.5)',
		inverse: 'oklch(0.148 0.004 228.8)'
	}
} as const;

export const CONTROL_HEIGHTS = {
	xs: 'h-7',
	sm: 'h-8',
	md: 'h-10',
	lg: 'h-12'
} as const;

export type ControlHeightKey = keyof typeof CONTROL_HEIGHTS;

export const BORDER_RADII = {
	none: 'rounded-none',
	sm: 'rounded-md',
	md: 'rounded-xl',
	lg: 'rounded-2xl',
	xl: 'rounded-3xl',
	full: 'rounded-full'
} as const;

export const TYPOGRAPHY = {
	h1: { size: 'text-3xl', weight: 'font-bold', tracking: 'tracking-tight', lead: 'leading-tight' },
	h2: { size: 'text-2xl', weight: 'font-semibold', tracking: 'tracking-tight', lead: 'leading-snug' },
	h3: { size: 'text-xl', weight: 'font-semibold', tracking: 'tracking-normal', lead: 'leading-snug' },
	h4: { size: 'text-lg', weight: 'font-medium', tracking: 'tracking-normal', lead: 'leading-normal' },
	bodyLarge: { size: 'text-base', weight: 'font-normal', tracking: 'tracking-normal', lead: 'leading-relaxed' },
	body: { size: 'text-sm', weight: 'font-normal', tracking: 'tracking-normal', lead: 'leading-relaxed' },
	bodySmall: { size: 'text-xs', weight: 'font-normal', tracking: 'tracking-normal', lead: 'leading-normal' },
	mono: { font: 'font-mono', size: 'text-xs', weight: 'font-medium', tracking: 'tracking-wide' },
	eyebrow: { size: 'text-xs', weight: 'font-semibold', tracking: 'tracking-wider', transform: 'uppercase' }
} as const;

export const COMPONENT_PRESETS = {
	button: {
		primary: 'bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75 shadow-sm border border-sidebar-primary/35',
		secondary: 'bg-secondary text-secondary-foreground border border-border hover:bg-muted hover:border-ring/50 shadow-xs',
		outline: 'bg-transparent text-foreground border border-border hover:bg-muted/80 hover:text-foreground',
		ghost: 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground',
		destructive: 'bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25 shadow-sm',
		amber: 'bg-warning/20 text-warning border border-warning/40 hover:bg-warning/30 shadow-sm'
	},
	badge: {
		neutral: 'bg-secondary text-secondary-foreground border border-border rounded-full',
		emerald: 'bg-primary/20 text-sidebar-primary border border-sidebar-primary/40 rounded-full',
		amber: 'bg-warning/15 text-warning border border-warning/40 rounded-full',
		sky: 'bg-chart-2/15 text-chart-2 border border-chart-2/40 rounded-full',
		danger: 'bg-destructive/15 text-destructive border border-destructive/40 rounded-full',
		outline: 'bg-transparent text-muted-foreground border border-border rounded-full'
	},
	input: {
		base: 'bg-background text-foreground border border-input rounded-xl focus:border-sidebar-primary focus:ring-1 focus:ring-sidebar-primary transition-colors shadow-xs placeholder:text-muted-foreground'
	},
	card: {
		base: 'bg-card border border-border rounded-2xl shadow-xs transition-shadow hover:shadow-md',
		flat: 'bg-card/85 border border-border rounded-2xl',
		elevated: 'bg-popover border border-ring/40 rounded-2xl shadow-lg'
	},
	dropdownSelect: {
		trigger: 'bg-background border border-input rounded-xl text-foreground hover:border-ring/60 shadow-xs',
		content: 'bg-popover border border-border rounded-2xl shadow-2xl text-popover-foreground z-50'
	}
} as const;

export const PALETTE_SWATCHES = [
	{ name: 'Background', token: '--background', hex: COLORS.surface.base, category: 'Surfaces', role: 'Mist dark page background' },
	{ name: 'Card / Sidebar', token: '--card', hex: COLORS.surface.panel, category: 'Surfaces', role: 'Mist dark card and sidebar surface' },
	{ name: 'Muted Surface', token: '--muted', hex: COLORS.surface.subtle, category: 'Surfaces', role: 'Subtle container and hover backdrop' },
	{ name: 'Secondary Control', token: '--secondary', hex: COLORS.surface.control, category: 'Surfaces', role: 'Neutral secondary button background' },

	{ name: 'Border', token: '--border', hex: COLORS.border.default, category: 'Borders', role: 'Translucent mist container outline' },
	{ name: 'Input Border', token: '--input', hex: COLORS.border.strong, category: 'Borders', role: 'Form input and select outline' },
	{ name: 'Focus Ring', token: '--ring', hex: COLORS.border.bright, category: 'Borders', role: 'Interactive focus ring outline' },

	{ name: 'Primary Teal', token: '--primary', hex: COLORS.accent.primary, category: 'Accents', role: 'Primary action button fill' },
	{ name: 'Sidebar Teal', token: '--sidebar-primary', hex: COLORS.accent.teal, category: 'Accents', role: 'Active navigation, emblem, and primary highlight' },
	{ name: 'Chart Cyan', token: '--chart-2', hex: COLORS.accent.sky, category: 'Accents', role: 'Telemetry and qualified status accent' },

	{ name: 'Foreground', token: '--foreground', hex: COLORS.text.main, category: 'Typography', role: 'Crisp mist primary heading and value text' },
	{ name: 'Muted Foreground', token: '--muted-foreground', hex: COLORS.text.muted, category: 'Typography', role: 'Secondary labels, captions, and metadata' },

	{ name: 'Status Verified', token: '--sidebar-primary', hex: COLORS.status.success, category: 'Feedback', role: 'Measured telemetry and verified actions' },
	{ name: 'Status Warning', token: '--warning', hex: COLORS.status.warning, category: 'Feedback', role: 'Pending review and unverified sessions' },
	{ name: 'Status Destructive', token: '--destructive', hex: COLORS.status.danger, category: 'Feedback', role: 'Errors, revocations, and rejected items' }
];

export const EVIDENCE_TOKENS = {
	measured: {
		label: 'MEASURED',
		color: COLORS.status.success,
		badgeClass: 'bg-primary/20 text-sidebar-primary border border-sidebar-primary/40 rounded-md',
		description: 'Verified directly against live Coordinator D1 or leased observation receipt.'
	},
	qualified: {
		label: 'QUALIFIED',
		color: COLORS.status.info,
		badgeClass: 'bg-chart-2/15 text-chart-2 border border-chart-2/40 rounded-md',
		description: 'Checked against scoped source access profile and RFC 9309 robots snapshot.'
	},
	illustrative: {
		label: 'PROVISIONAL',
		color: COLORS.text.muted,
		badgeClass: 'bg-muted text-muted-foreground border border-border rounded-md',
		description: 'Heuristic discovery lead pending operator review.'
	},
	unavailable: {
		label: 'UNAVAILABLE',
		color: COLORS.text.dim,
		badgeClass: 'bg-card text-muted-foreground border border-border rounded-md',
		description: 'Target origin or coordinator endpoint currently unreachable.'
	},
	failed: {
		label: 'REJECTED',
		color: COLORS.status.danger,
		badgeClass: 'bg-destructive/15 text-destructive border border-destructive/40 rounded-md',
		description: 'Failed validation, revoked lease, or denied by policy.'
	},
	unverified: {
		label: 'UNVERIFIED',
		color: COLORS.status.warning,
		badgeClass: 'bg-warning/15 text-warning border border-warning/40 rounded-md',
		description: 'Awaiting operator or moderator verification.'
	}
} as const;
