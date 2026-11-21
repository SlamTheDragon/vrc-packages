export type ControlSize = 'xs' | 'sm' | 'md' | 'lg';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'amber';

export type BadgeVariant = 'neutral' | 'emerald' | 'amber' | 'sky' | 'danger' | 'outline';

export type CardVariant = 'base' | 'flat' | 'elevated';

export type EvidenceState = 'measured' | 'qualified' | 'illustrative' | 'unavailable' | 'failed' | 'unverified';

export interface SidebarNavItem {
	id: string;
	href: string;
	label: string;
	icon?: any;
	badge?: string;
	external?: boolean;
}

export interface SidebarNavGroup {
	title?: string;
	items: SidebarNavItem[];
	variant?: 'primary' | 'secondary';
}

export interface SelectOption {
	value: string;
	label: string;
	group?: string;
	disabled?: boolean;
	description?: string;
}

export interface DataTableColumn<T = any> {
	key: keyof T | string;
	label: string;
	align?: 'left' | 'center' | 'right';
	width?: string;
	format?: (value: any, row: T) => string;
}

/** 2D Graph Node and Edge Specifications for Culinary Trees */
export interface GraphNode {
	id: string;
	label: string;
	sublabel?: string;
	x?: number;
	y?: number;
	targetX?: number;
	targetY?: number;
	category?: string;
	/** Order of Processing Magnitude: 1 = Raw Commodity, 2 = Intermediate, 3 = Composite, 4 = Opcode */
	processingMagnitude?: 1 | 2 | 3 | 4;
	novaGroup?: string;
	radius?: number;
	color?: string;
	description?: string;
	mass?: number;
	temperature?: number;
	inPantry?: boolean;
	isCraftable?: boolean;
	isLockedOut?: boolean;
	isFallbackHardware?: boolean;
	requiredEquipment?: string;
	payload?: any;
}

export interface GraphEdge {
	id?: string;
	source: string;
	target: string;
	label?: string;
	type?: 'precursor' | 'opcode' | 'pairing';
	color?: string;
}
