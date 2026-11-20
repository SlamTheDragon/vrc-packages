/**
 * ============================================================================
 * VRCP WEB DESIGN SYSTEM // TOKENS & THEMES
 * ============================================================================
 * Canonical TypeScript control file centralizing all colors, dimensions,
 * control heights, typography, evidence tokens, component presets, and palette swatches.
 *
 * Designed with a clean, high-contrast modern white surface profile.
 */

/** Reconciled semantic colors and palette tokens */
export const COLORS = {
	/** Semantic Surface Tiers (White Color Profile) */
	surface: {
		/** Pure white page void base */
		base: '#ffffff',
		/** Canvas floor / page backdrop */
		canvas: '#f8fafc',
		/** Sub-toolbars, dock strips, table headers */
		subtle: '#f8fafc',
		/** Panel containers, artboard surfaces, modals */
		panel: '#ffffff',
		/** Resting cards */
		card: '#ffffff',
		/** Elevated cards, active selections, dropdown menus */
		elevated: '#ffffff',
		/** Tech controls, button secondary bg */
		control: '#f1f5f9',
		/** Input field background */
		input: '#ffffff',
		/** Dialog and modal surface */
		dialog: '#ffffff',
		/** Dropdown menu base */
		dropdown: '#ffffff',
		/** Interactive hover state on surface controls */
		hover: '#f1f5f9'
	},

	/** Semantic Border Tiers */
	border: {
		/** Default container, card, and control outline */
		default: '#e2e8f0',
		/** Subtle dividers, resting internal lines */
		subtle: '#f1f5f9',
		/** Strong border, resting tabs, secondary button border */
		strong: '#cbd5e1',
		/** Bright border, focused controls, active container outlines */
		bright: '#94a3b8',
		/** Primary interactive border (Emerald) */
		interactive: '#059669',
		/** Secondary interactive border (Amber) */
		interactiveAmber: '#d97706',
		/** Tertiary interactive border (Sky) */
		interactiveSky: '#0284c7',
		/** Card resting border */
		cardResting: '#e2e8f0',
		/** Card hover border */
		cardHover: '#cbd5e1',
		/** Input resting border */
		inputResting: '#e2e8f0'
	},

	/** Brand Accents: Culinary Green, Thermal Amber, and Hydration Sky */
	accent: {
		/** Primary brand identifier (Emerald 600) */
		emerald: '#059669',
		emeraldHover: '#047857',
		emeraldActive: '#065f46',
		emeraldSubtle: 'rgba(5, 150, 105, 0.08)',
		emeraldBorder: 'rgba(5, 150, 105, 0.30)',

		/** Secondary thermal / Maillard accent (Amber 600) */
		amber: '#d97706',
		amberHover: '#b45309',
		amberActive: '#92400e',
		amberSubtle: 'rgba(217, 119, 6, 0.08)',
		amberBorder: 'rgba(217, 119, 6, 0.30)',

		/** Tertiary aqueous / moisture accent (Sky 600) */
		sky: '#0284c7',
		skyHover: '#0369a1',
		skyActive: '#075985',
		skySubtle: 'rgba(2, 132, 199, 0.08)',
		skyBorder: 'rgba(2, 132, 199, 0.30)'
	},

	/** Semantic Status Tokens */
	status: {
		success: '#10b981',
		successBg: 'rgba(16, 185, 129, 0.08)',
		successBorder: 'rgba(16, 185, 129, 0.30)',

		warning: '#f59e0b',
		warningBg: 'rgba(245, 158, 11, 0.08)',
		warningBorder: 'rgba(245, 158, 11, 0.30)',

		danger: '#ef4444',
		dangerBg: 'rgba(239, 68, 68, 0.08)',
		dangerBorder: 'rgba(239, 68, 68, 0.30)',

		info: '#0284c7',
		infoBg: 'rgba(2, 132, 199, 0.08)',
		infoBorder: 'rgba(2, 132, 199, 0.30)'
	},

	/** High-Contrast Text Tokens */
	text: {
		/** High-contrast primary heading & brand text (Slate 900) */
		main: '#0f172a',
		/** High-contrast body text (Slate 700) */
		body: '#334155',
		/** Readable muted labels & captions (Slate 500) */
		muted: '#64748b',
		/** Low-emphasis secondary metadata (Slate 400) */
		dim: '#94a3b8',
		/** High-contrast inverted text on dark fills */
		inverse: '#ffffff'
	}
} as const;

/** Standardized Interaction Control Height Presets (Rule 09) */
export const CONTROL_HEIGHTS = {
	/** Micro HUD controls, compact status tags (28px) */
	xs: 'h-7',
	/** Standard compact controls, toolbar buttons, inputs, dropdown triggers (32px) */
	sm: 'h-8',
	/** Default interactive controls, modal inputs, standard selects, buttons (40px) */
	md: 'h-10',
	/** Prominent call-to-action buttons (48px) */
	lg: 'h-12'
} as const;

export type ControlHeightKey = keyof typeof CONTROL_HEIGHTS;

/** Clean Modern Border Radii (Generous Curvature) */
export const BORDER_RADII = {
	none: 'rounded-none',
	sm: 'rounded-md',
	md: 'rounded-xl',
	lg: 'rounded-2xl',
	xl: 'rounded-3xl',
	full: 'rounded-full'
} as const;

/** Typography Hierarchy Specification */
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

/** Component Preset Styling Classes */
export const COMPONENT_PRESETS = {
	button: {
		primary: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm border border-emerald-700/50',
		secondary: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-xs',
		outline: 'bg-transparent text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900',
		ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
		destructive: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm border border-red-700/50',
		amber: 'bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800 shadow-sm border border-amber-700/50'
	},
	badge: {
		neutral: 'bg-slate-100 text-slate-700 border border-slate-200 rounded-full',
		emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full',
		amber: 'bg-amber-50 text-amber-700 border border-amber-200 rounded-full',
		sky: 'bg-sky-50 text-sky-700 border border-sky-200 rounded-full',
		danger: 'bg-red-50 text-red-700 border border-red-200 rounded-full',
		outline: 'bg-transparent text-slate-600 border border-slate-300 rounded-full'
	},
	input: {
		base: 'bg-white text-slate-900 border border-slate-200 rounded-xl focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors shadow-xs placeholder:text-slate-400'
	},
	card: {
		base: 'bg-white border border-slate-200 rounded-2xl shadow-xs transition-shadow hover:shadow-md',
		flat: 'bg-white border border-slate-200 rounded-2xl',
		elevated: 'bg-white border border-slate-200/80 rounded-2xl shadow-md'
	},
	dropdownSelect: {
		trigger: 'bg-white border border-slate-200 rounded-xl text-slate-900 hover:border-slate-300 shadow-xs',
		content: 'bg-white border border-slate-200 rounded-2xl shadow-lg text-slate-800 z-50'
	}
} as const;

/** Design System Swatches Catalog (for /design Showcase) */
export const PALETTE_SWATCHES = [
	{ name: 'Surface Base', token: 'surface.base', hex: COLORS.surface.base, category: 'Surfaces', role: 'Pure white root page background' },
	{ name: 'Surface Canvas', token: 'surface.canvas', hex: COLORS.surface.canvas, category: 'Surfaces', role: 'Subtle slate canvas backdrop' },
	{ name: 'Surface Panel', token: 'surface.panel', hex: COLORS.surface.panel, category: 'Surfaces', role: 'White panel and modal container' },
	{ name: 'Surface Control', token: 'surface.control', hex: COLORS.surface.control, category: 'Surfaces', role: 'Neutral interactive button/chip background' },
	
	{ name: 'Border Default', token: 'border.default', hex: COLORS.border.default, category: 'Borders', role: 'Standard card & element container outline' },
	{ name: 'Border Strong', token: 'border.strong', hex: COLORS.border.strong, category: 'Borders', role: 'Secondary buttons, tabs, strong dividers' },
	{ name: 'Border Interactive', token: 'border.interactive', hex: COLORS.border.interactive, category: 'Borders', role: 'Primary focus & interactive state border' },
	
	{ name: 'Emerald Primary', token: 'accent.emerald', hex: COLORS.accent.emerald, category: 'Accents', role: 'Primary brand accent & action button fill' },
	{ name: 'Amber Thermal', token: 'accent.amber', hex: COLORS.accent.amber, category: 'Accents', role: 'Thermal, browning, and Maillard accents' },
	{ name: 'Sky Aqueous', token: 'accent.sky', hex: COLORS.accent.sky, category: 'Accents', role: 'Hydration, water activity, and solution accents' },
	
	{ name: 'Text Main', token: 'text.main', hex: COLORS.text.main, category: 'Typography', role: 'Deep charcoal primary headings and values' },
	{ name: 'Text Body', token: 'text.body', hex: COLORS.text.body, category: 'Typography', role: 'Standard readable paragraph body text' },
	{ name: 'Text Muted', token: 'text.muted', hex: COLORS.text.muted, category: 'Typography', role: 'Descriptive labels, secondary details' },
	{ name: 'Text Dim', token: 'text.dim', hex: COLORS.text.dim, category: 'Typography', role: 'Subtle footnotes, disabled indicators' },
	
	{ name: 'Status Success', token: 'status.success', hex: COLORS.status.success, category: 'Feedback', role: 'Safe biological zones, verified checks' },
	{ name: 'Status Warning', token: 'status.warning', hex: COLORS.status.warning, category: 'Feedback', role: 'Critical boundaries, enzymatic kill-zones' },
	{ name: 'Status Danger', token: 'status.danger', hex: COLORS.status.danger, category: 'Feedback', role: 'Pathogenic hazards, thermal failures' }
];

/** Plain-English 7 Master Functional Class Labels for De-Jargoned UI */
export const PLAIN_CLASS_LABELS: Record<string, string> = {
	starches_grains_flours: 'Flours, Grains & Starches',
	lipids_fats_emulsifiers: 'Butter, Oils & Fats',
	proteins_meats_dairy_marine: 'Eggs, Dairy, Meats & Seafood',
	botanical_produce_alliums: 'Vegetables, Herbs & Aromatics',
	botanical_acids_souring: 'Vinegars, Citrus & Souring',
	sugars_sweeteners_confectionery: 'Sugars & Sweeteners',
	ferments_umami_preserves: 'Salt, Sauces & Ferments'
};

/** Canonical Unit Transformation Opcode Descriptor */
export interface OpcodeOption {
	value: string;
	label: string;
	shortVerb: string;
	supplyTier: 1 | 2 | 3;
	mechanism: string;
}

export const CANONICAL_OPCODES: readonly OpcodeOption[] = [
	{
		value: 'OP_CUT',
		label: 'Cut & Prep (OP_CUT)',
		shortVerb: 'Cut & Prep',
		supplyTier: 1,
		mechanism: 'Mechanical sectioning and surface-area sizing'
	},
	{
		value: 'OP_EXTRACT',
		label: 'Extract & Infuse (OP_EXTRACT)',
		shortVerb: 'Extract & Infuse',
		supplyTier: 1,
		mechanism: 'Solid-liquid diffusion and aromatic leaching'
	},
	{
		value: 'OP_SEPARATE',
		label: 'Drain & Strain (OP_SEPARATE)',
		shortVerb: 'Drain & Strain',
		supplyTier: 1,
		mechanism: 'Phase filtration and moisture removal'
	},
	{
		value: 'OP_HYDRATE',
		label: 'Hydrate & Dissolve (OP_HYDRATE)',
		shortVerb: 'Hydrate & Mix',
		supplyTier: 2,
		mechanism: 'Solvation of dry starches, proteins, or solutes'
	},
	{
		value: 'OP_SHEAR',
		label: 'Knead & Fold (OP_SHEAR)',
		shortVerb: 'Knead & Fold',
		supplyTier: 2,
		mechanism: 'Mechanical shear to align gluten or viscoelastic networks'
	},
	{
		value: 'OP_EMULSIFY',
		label: 'Blend & Emulsify (OP_EMULSIFY)',
		shortVerb: 'Emulsify',
		supplyTier: 2,
		mechanism: 'High-shear droplet dispersion into continuous phase'
	},
	{
		value: 'OP_ACIDIFY',
		label: 'Sour & Acidify (OP_ACIDIFY)',
		shortVerb: 'Acidify',
		supplyTier: 2,
		mechanism: 'Organic acid pH shift and protein charge modification'
	},
	{
		value: 'OP_GEL',
		label: 'Thicken & Gel (OP_GEL)',
		shortVerb: 'Thicken & Gel',
		supplyTier: 2,
		mechanism: 'Starch gelatinization or hydrocolloid junction cross-linking'
	},
	{
		value: 'OP_COAGULATE',
		label: 'Set & Coagulate (OP_COAGULATE)',
		shortVerb: 'Coagulate',
		supplyTier: 2,
		mechanism: 'Controlled thermal or enzymatic protein coagulation'
	},
	{
		value: 'OP_FERMENT',
		label: 'Rest & Ferment (OP_FERMENT)',
		shortVerb: 'Rest & Ferment',
		supplyTier: 2,
		mechanism: 'Biological leavening or enzymatic maturation'
	},
	{
		value: 'OP_SIMMER',
		label: 'Simmer & Braise (OP_SIMMER)',
		shortVerb: 'Simmer',
		supplyTier: 2,
		mechanism: 'Sub-boiling moist convection (85–92°C) and collagen melt'
	},
	{
		value: 'OP_REDUCE',
		label: 'Boil & Reduce (OP_REDUCE)',
		shortVerb: 'Reduce',
		supplyTier: 2,
		mechanism: 'Evaporative concentration of solvent water'
	},
	{
		value: 'OP_CRYSTALLIZE',
		label: 'Chill & Temper (OP_CRYSTALLIZE)',
		shortVerb: 'Chill & Set',
		supplyTier: 2,
		mechanism: 'Controlled cooling to set lipid or sugar crystal lattice'
	},
	{
		value: 'OP_CURE',
		label: 'Salt & Cure (OP_CURE)',
		shortVerb: 'Salt & Cure',
		supplyTier: 2,
		mechanism: 'Osmotic salt equilibrium and water activity reduction'
	},
	{
		value: 'OP_ASSEMBLE',
		label: 'Shape & Assemble (OP_ASSEMBLE)',
		shortVerb: 'Assemble',
		supplyTier: 3,
		mechanism: 'Geometric layering and composite assembly'
	},
	{
		value: 'OP_SEAR',
		label: 'Sear & Sauté (OP_SEAR)',
		shortVerb: 'Sear & Sauté',
		supplyTier: 3,
		mechanism: 'High-heat conductive contact for rapid Maillard browning'
	},
	{
		value: 'OP_BAKE',
		label: 'Bake & Roast (OP_BAKE)',
		shortVerb: 'Bake & Roast',
		supplyTier: 3,
		mechanism: 'Dry oven radiation and convection for crust and crumb set'
	}
];

export function getOpcodeLabel(opcode: string): OpcodeOption {
	return (
		CANONICAL_OPCODES.find((o) => o.value === opcode) ?? {
			value: opcode,
			label: `${opcode.replace('OP_', '')} (${opcode})`,
			shortVerb: opcode.replace('OP_', ''),
			supplyTier: 2,
			mechanism: 'Unit transformation operation'
		}
	);
}

/**
 * Order of Processing Magnitude Hierarchy (NOVA 1–4 / Supply Tier 1–3)
 * Inspired by Blender Node Graph header color coding and food processing hierarchy.
 */
export interface ProcessingMagnitudeSpec {
	tier: 1 | 2 | 3;
	novaGroup: string;
	shortLabel: string;
	description: string;
	headerBgClass: string;
	badgeBgClass: string;
	hexColor: string;
}

export const PROCESSING_MAGNITUDE_TIERS: Record<1 | 2 | 3, ProcessingMagnitudeSpec> = {
	1: {
		tier: 1,
		novaGroup: 'NOVA 1',
		shortLabel: 'Tier 1 • Raw Prep',
		description: 'Unprocessed agricultural commodities and mechanical sectioning / extraction',
		headerBgClass: 'bg-emerald-50/90 border-b border-emerald-200/80',
		badgeBgClass: 'bg-emerald-700 text-white',
		hexColor: '#10b981'
	},
	2: {
		tier: 2,
		novaGroup: 'NOVA 2/3',
		shortLabel: 'Tier 2 • Intermediate',
		description: 'Hydrated, sheared, emulsified, or fermented culinary intermediates',
		headerBgClass: 'bg-sky-50/90 border-b border-sky-200/80',
		badgeBgClass: 'bg-sky-700 text-white',
		hexColor: '#0284c7'
	},
	3: {
		tier: 3,
		novaGroup: 'NOVA 3/4',
		shortLabel: 'Tier 3 • Composite Synthesis',
		description: 'Thermally set or assembled composite dishes ready for service',
		headerBgClass: 'bg-amber-50/90 border-b border-amber-200/80',
		badgeBgClass: 'bg-amber-700 text-white',
		hexColor: '#d97706'
	}
};

export function getProcessingMagnitudeSpec(opcode: string, supplyTier?: number): ProcessingMagnitudeSpec {
	const op = getOpcodeLabel(opcode);
	const resolvedTier = (supplyTier === 1 || supplyTier === 2 || supplyTier === 3)
		? supplyTier
		: op.supplyTier;
	return PROCESSING_MAGNITUDE_TIERS[resolvedTier];
}

/**
 * Canonical Blender-Inspired Node Graph Keyboard Shortcut Map
 */
export interface NodeGraphShortcutSpec {
	key: string;
	label: string;
	domain: 'Creation' | 'Linking & Layout' | 'Node State' | 'Navigation & View' | 'History & Editing' | 'Transform';
	description: string;
}

export const BLENDER_NODE_SHORTCUTS: readonly NodeGraphShortcutSpec[] = [
	{
		key: 'Shift + A',
		label: 'Quick-Add Palette',
		domain: 'Creation',
		description: 'Open cursor-anchored search to spawn an Opcode Step, Pantry Item, or Regional Base'
	},
	{
		key: 'D / Shift + D',
		label: 'Duplicate Step',
		domain: 'Creation',
		description: 'Clone the selected step node with all inputs and parameters'
	},
	{
		key: 'X / Delete',
		label: 'Delete Step',
		domain: 'Creation',
		description: 'Remove the selected step node from the graph'
	},
	{
		key: 'F',
		label: 'Auto-Connect (Make Link)',
		domain: 'Linking & Layout',
		description: 'Wire selected upstream step output (P-OUT) into target step input (P-IN)'
	},
	{
		key: 'L',
		label: 'Auto-Layout DAG',
		domain: 'Linking & Layout',
		description: 'Neatly align all precursor branches and main stages left-to-right by magnitude'
	},
	{
		key: 'M',
		label: 'Mute / Bypass Step',
		domain: 'Node State',
		description: 'Bypass thermal/evaporative loss on selected step and pass raw mass straight through'
	},
	{
		key: 'H',
		label: 'Collapse / Minimize Card',
		domain: 'Node State',
		description: 'Fold selected step card into a compact header pill to save canvas space'
	},
	{
		key: 'Alt + Click',
		label: 'Viewer Node Preview',
		domain: 'Node State',
		description: 'Solo-inspect any intermediate step output in the Live Recipe Facts panel'
	},
	{
		key: 'Home / .',
		label: 'Frame All / Selected',
		domain: 'Navigation & View',
		description: 'Center and fit the entire recipe tree or selected nodes inside the viewport'
	},
	{
		key: 'B + Drag',
		label: 'Box Select',
		domain: 'Navigation & View',
		description: 'Draw a selection marquee around multiple stage nodes'
	},
	{
		key: 'T / N',
		label: 'Toggle Side Shelves',
		domain: 'Navigation & View',
		description: 'Toggle Left Gravity Graph Shelf (T) or Right Live Recipe Facts Inspector (N)'
	},
	{
		key: 'Ctrl + Z',
		label: 'Undo Action',
		domain: 'History & Editing',
		description: 'Undo previous node move, creation, deletion, or wire connection'
	},
	{
		key: 'Ctrl + Shift + Z / Ctrl + Y',
		label: 'Redo Action',
		domain: 'History & Editing',
		description: 'Redo previously undone action'
	},
	{
		key: 'G',
		label: 'Grab / Translate Nodes',
		domain: 'Transform',
		description: 'Enter modal grab mode; move selected nodes with mouse. Click/Enter confirms, Esc/RMB cancels'
	},
	{
		key: 'Ctrl + RMB Drag',
		label: 'Knife Wire Cut',
		domain: 'Linking & Layout',
		description: 'Draw a red cutting stroke across noodles to sever connections instantly'
	},
	{
		key: 'Ctrl + X',
		label: 'Delete & Reconnect',
		domain: 'Creation',
		description: 'Delete selected node and splice upstream inputs directly into downstream outputs'
	}
] as const;

export const EVIDENCE_TOKENS = {
	measured: {
		label: 'MEASURED',
		color: '#059669',
		badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md',
		description: 'Verified directly against live Coordinator D1 or leased observation receipt.'
	},
	qualified: {
		label: 'QUALIFIED',
		color: '#0284c7',
		badgeClass: 'bg-sky-50 text-sky-800 border border-sky-200 rounded-md',
		description: 'Checked against scoped source access profile and RFC 9309 robots snapshot.'
	},
	illustrative: {
		label: 'PROVISIONAL',
		color: '#475569',
		badgeClass: 'bg-slate-100 text-slate-700 border border-slate-300 rounded-md',
		description: 'Heuristic discovery lead pending operator review.'
	},
	unavailable: {
		label: 'UNAVAILABLE',
		color: '#64748b',
		badgeClass: 'bg-slate-50 text-slate-500 border border-slate-200 rounded-md',
		description: 'Target origin or coordinator endpoint currently unreachable.'
	},
	failed: {
		label: 'REJECTED',
		color: '#dc2626',
		badgeClass: 'bg-red-50 text-red-700 border border-red-200 rounded-md',
		description: 'Failed validation, revoked lease, or denied by policy.'
	},
	unverified: {
		label: 'UNVERIFIED',
		color: '#d97706',
		badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200 rounded-md',
		description: 'Awaiting operator or moderator verification.'
	}
} as const;
