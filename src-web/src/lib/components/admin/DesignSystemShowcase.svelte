<script lang="ts">
	import {
		PALETTE_SWATCHES,
		CONTROL_HEIGHTS,
		EVIDENCE_TOKENS
	} from '$lib/components/ui/tokens';
	import type { EvidenceState } from '$lib/components/ui/types';

	// Forms Domain (10 primitives)
	import Button from '$lib/components/ui/forms/Button.svelte';
	import Input from '$lib/components/ui/forms/Input.svelte';
	import Textarea from '$lib/components/ui/forms/Textarea.svelte';
	import Select from '$lib/components/ui/forms/Select.svelte';
	import DropdownSelect from '$lib/components/ui/forms/DropdownSelect.svelte';
	import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';
	import Switch from '$lib/components/ui/forms/Switch.svelte';
	import Slider from '$lib/components/ui/forms/Slider.svelte';
	import RadioGroup from '$lib/components/ui/forms/RadioGroup.svelte';
	import Field from '$lib/components/ui/forms/Field.svelte';

	// Navigation Domain (6 primitives)
	import Tabs from '$lib/components/ui/navigation/Tabs.svelte';
	import ToggleGroup from '$lib/components/ui/navigation/ToggleGroup.svelte';
	import Accordion from '$lib/components/ui/navigation/Accordion.svelte';
	import DropdownMenu from '$lib/components/ui/navigation/DropdownMenu.svelte';
	import DropdownItem from '$lib/components/ui/navigation/DropdownItem.svelte';

	// Overlays Domain (4 primitives)
	import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
	import Sheet from '$lib/components/ui/overlays/Sheet.svelte';
	import Popover from '$lib/components/ui/overlays/Popover.svelte';
	import Tooltip from '$lib/components/ui/overlays/Tooltip.svelte';

	// Feedback Domain (6 primitives)
	import Badge from '$lib/components/ui/feedback/Badge.svelte';
	import EvidenceBadge from '$lib/components/ui/feedback/EvidenceBadge.svelte';
	import Notice from '$lib/components/ui/feedback/Notice.svelte';
	import Progress from '$lib/components/ui/feedback/Progress.svelte';
	import Skeleton from '$lib/components/ui/feedback/Skeleton.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';

	// Display Domain (7 primitives)
	import Card from '$lib/components/ui/display/Card.svelte';
	import StatCard from '$lib/components/ui/display/StatCard.svelte';
	import Codeblock from '$lib/components/ui/display/Codeblock.svelte';
	import Separator from '$lib/components/ui/display/Separator.svelte';
	import Avatar from '$lib/components/ui/display/Avatar.svelte';
	import Kbd from '$lib/components/ui/display/Kbd.svelte';
	import VRCPEmblem from '$lib/components/ui/display/VRCPEmblem.svelte';

	// Telemetry Domain (5 primitives)
	import DataTable from '$lib/components/ui/telemetry/DataTable.svelte';
	import PropertyInspector from '$lib/components/ui/telemetry/PropertyInspector.svelte';
	import ObserverToolbar from '$lib/components/ui/telemetry/ObserverToolbar.svelte';
	import RenderControls from '$lib/components/ui/telemetry/RenderControls.svelte';
	import AssetPlaceholder from '$lib/components/ui/telemetry/AssetPlaceholder.svelte';

	// Workbench Domain (2 primitives)
	import SplitPane from '$lib/components/ui/workbench/SplitPane.svelte';
	import FloatingPanel from '$lib/components/ui/workbench/FloatingPanel.svelte';

	import {
		Palette,
		Sliders,
		Layers,
		Activity,
		ChevronDown,
		ShieldCheck,
		Package,
		Server
	} from '@lucide/svelte';

	let activeSection = $state('tokens');
	let demoInput = $state('com.vrchat.avatars.physbones');
	let demoTextarea = $state('Verified VPM repository listing under active source access profile.');
	let demoSelect = $state('vpm');
	let demoDropdown = $state('general');
	let demoCheckbox = $state(true);
	let demoSwitch = $state(true);
	let demoSlider = $state([2500]);
	let demoRadio = $state('metadata');
	let demoToggle = $state('release');
	let demoDialogOpen = $state(false);
	let demoSheetOpen = $state(false);
	let demoPopoverOpen = $state(false);
	let demoMenuOpen = $state(false);
	let demoFloatingOpen = $state(false);
	let demoPlaying = $state(false);
	let demoSpeed = $state(1);
	let selectedTableId = $state('pkg-1');

	const sectionTabs = [
		{ id: 'tokens', label: '1. Tokens & Heights', count: 17 },
		{ id: 'forms', label: '2. Forms Domain', count: 10 },
		{ id: 'navigation', label: '3. Navigation & Overlays', count: 10 },
		{ id: 'feedback', label: '4. Feedback & Display', count: 13 },
		{ id: 'telemetry', label: '5. Telemetry & Workbench', count: 7 }
	];

	const platformOptions = [
		{ value: 'vpm', label: 'VPM Registry (vpm)', description: 'VRChat Package Manager JSON listing' },
		{ value: 'github', label: 'GitHub Repository (github)', description: 'Public repository metadata' },
		{ value: 'booth', label: 'BOOTH Storefront (booth)', description: 'Public creator storefront' },
		{ value: 'jinxxy', label: 'Jinxxy Marketplace (jinxxy)', description: 'Creator listing metadata' }
	];

	const ratingOptions = [
		{ value: 'general', label: 'General (Safe)', description: 'Standard public package listing' },
		{ value: 'mature', label: 'Mature', description: 'Moderate mature themes' },
		{ value: 'sexual_suggestive', label: 'Sexual Suggestive', description: 'Suggestive content flag' },
		{ value: 'adult_restricted', label: 'Adult Restricted (18+)', description: 'Age-verified adult content' }
	];

	const purposeRadioOptions = [
		{ value: 'metadata', label: 'Metadata Extraction (metadata)', description: 'Bounded 120s lease package fetch' },
		{ value: 'discovery', label: 'Lead Discovery (discovery)', description: 'Storefront or registry link discovery' }
	];

	const samplePackages = [
		{
			id: 'pkg-1',
			canonicalId: 'com.vrchat.base.sdk',
			platform: 'vpm',
			umbrella: 'tools',
			rating: 'general',
			delayMs: 2000
		},
		{
			id: 'pkg-2',
			canonicalId: 'booth:5819201',
			platform: 'booth',
			umbrella: 'avatars',
			rating: 'general',
			delayMs: 3500
		},
		{
			id: 'pkg-3',
			canonicalId: 'github:vrchat-community/template-package',
			platform: 'github',
			umbrella: 'tools',
			rating: 'general',
			delayMs: 1500
		}
	];

	const sampleColumns = [
		{ key: 'canonicalId', label: 'Canonical ID' },
		{ key: 'platform', label: 'Platform' },
		{ key: 'umbrella', label: 'Umbrella' },
		{ key: 'rating', label: 'Rating' },
		{ key: 'delayMs', label: 'Min Delay (ms)', align: 'right' as const }
	];

	const evidenceStates: EvidenceState[] = [
		'measured',
		'qualified',
		'illustrative',
		'unverified',
		'unavailable',
		'failed'
	];
</script>

<div class="page-stack">
	<div class="page-heading">
		<div class="flex items-center gap-3">
			<div class="p-2.5 rounded-2xl bg-emerald-950/70 border border-emerald-700/60">
				<VRCPEmblem size={28} color="#10b981" />
			</div>
			<div>
				<span class="eyebrow">RULE 09 ARCHITECTURE // /design</span>
				<h1 class="text-2xl font-bold tracking-tight text-slate-100">
					VRCP 6-Domain + Workbench UI Design System
				</h1>
				<p class="text-xs text-slate-400 mt-0.5">
					39 accessible Svelte 5 primitives bound to <code class="font-mono text-emerald-400">$lib/components/ui/tokens.ts</code> and <code class="font-mono">CONTROL_HEIGHTS</code> (Permanent Dark Mode).
				</p>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<EvidenceBadge state="measured" size="md" />
			<Button variant="secondary" size="sm" onclick={() => (demoFloatingOpen = !demoFloatingOpen)}>
				<Layers size={14} />
				<span>{demoFloatingOpen ? 'Hide Floating Panel' : 'Spawn Floating Panel'}</span>
			</Button>
		</div>
	</div>

	<Tabs bind:value={activeSection} items={sectionTabs}>
		{#if activeSection === 'tokens'}
			<div class="flex flex-col gap-6">
				<Card
					title="Standardized Control Heights (CONTROL_HEIGHTS)"
					eyebrow="RULE 09 INVARIANT 6"
				>
					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
						{#each Object.entries(CONTROL_HEIGHTS) as [sizeKey, heightClass]}
							<div class="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col gap-2">
								<div class="flex items-center justify-between">
									<Badge variant="emerald" size="xs">size="{sizeKey}"</Badge>
									<span class="font-mono text-xs text-slate-400">{heightClass}</span>
								</div>
								<Button variant="primary" size={sizeKey as 'xs' | 'sm' | 'md' | 'lg'}>
									Button ({sizeKey})
								</Button>
							</div>
						{/each}
					</div>
				</Card>

				<Card
					title="Evidence State Tokens (EVIDENCE_TOKENS)"
					eyebrow="PROVENANCE & VERIFICATION RUBRIC"
				>
					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{#each evidenceStates as st}
							<div class="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col gap-2">
								<div class="flex items-center justify-between">
									<EvidenceBadge state={st} size="md" />
									<span class="font-mono text-[11px] text-slate-400">{EVIDENCE_TOKENS[st].color}</span>
								</div>
								<p class="text-xs text-slate-300 leading-relaxed">
									{EVIDENCE_TOKENS[st].description}
								</p>
							</div>
						{/each}
					</div>
				</Card>

				<Card
					title="Semantic Dark Carbon Surface Palette (PALETTE_SWATCHES)"
					eyebrow="TOKENS.TS COLOR PROFILE"
				>
					<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
						{#each PALETTE_SWATCHES as swatch}
							<div class="p-3 rounded-xl border border-slate-800 bg-slate-950/60 flex items-center gap-3">
								<div
									class="w-10 h-10 rounded-lg border border-slate-700 shrink-0 shadow-2xs"
									style="background-color: {swatch.hex}"
								></div>
								<div class="min-w-0 flex-1">
									<div class="flex items-center justify-between gap-1">
										<span class="text-xs font-semibold text-slate-100 truncate">{swatch.name}</span>
										<span class="text-[10px] font-mono text-slate-400">{swatch.hex}</span>
									</div>
									<span class="text-[10px] font-mono text-emerald-400 block truncate">{swatch.token}</span>
									<span class="text-[10px] text-slate-400 block truncate">{swatch.role}</span>
								</div>
							</div>
						{/each}
					</div>
				</Card>
			</div>
		{:else if activeSection === 'forms'}
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<Card title="Buttons, Inputs & DropdownSelect" eyebrow="DOMAIN 1 // FORMS">
					<div class="flex flex-col gap-4">
						<div class="flex flex-wrap items-center gap-2">
							<Button variant="primary" size="sm">Primary</Button>
							<Button variant="secondary" size="sm">Secondary</Button>
							<Button variant="outline" size="sm">Outline</Button>
							<Button variant="ghost" size="sm">Ghost</Button>
							<Button variant="amber" size="sm">Amber</Button>
							<Button variant="destructive" size="sm">Destructive</Button>
						</div>

						<Field id="demo-input" label="Canonical Package Identifier" description="Standard Input primitive bound to CONTROL_HEIGHTS.md">
							<Input id="demo-input" bind:value={demoInput} />
						</Field>

						<Field id="demo-dropdown" label="Content Rating (DropdownSelect)" description="Rule 09 required Bits-UI DropdownSelect menu">
							<DropdownSelect bind:value={demoDropdown} options={ratingOptions} />
						</Field>

						<Field id="demo-select" label="Native Platform Select (Select)" description="Accessible native select fallback">
							<Select id="demo-select" bind:value={demoSelect} options={platformOptions} />
						</Field>

						<Field id="demo-textarea" label="Audit Reason (Textarea)">
							<Textarea id="demo-textarea" bind:value={demoTextarea} rows={2} />
						</Field>
					</div>
				</Card>

				<Card title="Selection & Range Controls" eyebrow="DOMAIN 1 // BOOLEAN & RANGE">
					<div class="flex flex-col gap-5">
						<div class="flex flex-wrap items-center gap-6">
							<Checkbox id="demo-check" bind:checked={demoCheckbox} label="Retain Normalized Facts" />
							<Switch id="demo-switch" bind:checked={demoSwitch} label="Auto-Seed Default Profiles" />
						</div>

						<Slider
							bind:value={demoSlider}
							min={1000}
							max={10000}
							step={250}
							unit=" ms"
							label="Origin Pacing Minimum Delay"
						/>

						<Field label="Crawl Lease Purpose (RadioGroup)">
							<RadioGroup bind:value={demoRadio} options={purposeRadioOptions} />
						</Field>
					</div>
				</Card>
			</div>
		{:else if activeSection === 'navigation'}
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<Card title="ToggleGroup, Accordion & DropdownMenu" eyebrow="DOMAIN 2 // NAVIGATION">
					<div class="flex flex-col gap-4">
						<div class="flex items-center justify-between flex-wrap gap-2">
							<ToggleGroup
								bind:value={demoToggle}
								options={[
									{ value: 'release', label: 'Release SDK' },
									{ value: 'preview', label: 'Preview SDK' }
								]}
							/>

							<DropdownMenu bind:open={demoMenuOpen}>
								{#snippet trigger()}
									<Button variant="secondary" size="sm">
										<span>Quick Actions</span>
										<ChevronDown size={14} />
									</Button>
								{/snippet}
								<DropdownItem label="Inspect Source Profile" shortcut="⌘P" />
								<DropdownItem label="Verify Creator Claim" shortcut="⌘K" />
								<DropdownItem label="Revoke Node Token" destructive={true} />
							</DropdownMenu>
						</div>

						<Accordion
							items={[
								{
									id: 'acc-1',
									title: 'Leased-Only Ingestion Boundary',
									content: 'Crawler nodes fetch strictly under unexpired 120s coordinator leases (/v1/node/jobs/claim). Coordinator loss halts all fetching.'
								},
								{
									id: 'acc-2',
									title: 'Source Access Profiles & RFC 9309 Robots',
									content: 'Every crawl requires an active scoped SourceAccessProfile and RFC 9309 robots.txt compliance.'
								}
							]}
						/>
					</div>
				</Card>

				<Card title="Dialog, Sheet, Popover & Tooltip" eyebrow="DOMAIN 3 // OVERLAYS">
					<div class="flex flex-wrap items-center gap-3">
						<Button variant="primary" size="sm" onclick={() => (demoDialogOpen = true)}>
							Open Modal Dialog
						</Button>
						<Button variant="secondary" size="sm" onclick={() => (demoSheetOpen = true)}>
							Open Side Sheet
						</Button>

						<Popover bind:open={demoPopoverOpen}>
							{#snippet trigger()}
								<Button variant="outline" size="sm">Inspect Popover</Button>
							{/snippet}
							<div class="flex flex-col gap-1.5 text-xs">
								<span class="font-semibold text-slate-100">Coordinator Lease Window</span>
								<p class="text-slate-300">Fixed 120-second monotonic lease deadline with SHA-256 node token verification.</p>
							</div>
						</Popover>

						<Tooltip text="Verified against live D1 schema">
							{#snippet trigger()}
								<Badge variant="emerald" size="sm">Hover Tooltip</Badge>
							{/snippet}
						</Tooltip>
					</div>

					<Dialog
						bind:open={demoDialogOpen}
						title="Verify Source Access Profile"
						description="Modal dialog primitive built on Bits-UI Dialog."
					>
						<p class="text-xs text-slate-300">
							Confirming this profile grants scoped HTTP GET discovery access under RFC 9309 robots.txt rules.
						</p>
						{#snippet actions()}
							<Button variant="secondary" size="sm" onclick={() => (demoDialogOpen = false)}>
								Cancel
							</Button>
							<Button variant="primary" size="sm" onclick={() => (demoDialogOpen = false)}>
								Confirm
							</Button>
						{/snippet}
					</Dialog>

					<Sheet
						bind:open={demoSheetOpen}
						title="Package Provenance Drawer"
						description="Slide-over sheet overlay primitive."
					>
						<PropertyInspector
							title="Provenance Receipt"
							properties={[
								{ key: 'Canonical ID', value: demoInput, category: 'Identity' },
								{ key: 'Timestamp Rubric', value: 'confirmed', category: 'Identity' }
							]}
						/>
					</Sheet>
				</Card>
			</div>
		{:else if activeSection === 'feedback'}
			<div class="flex flex-col gap-6">
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<StatCard
						label="Canonical Packages"
						value="1,248"
						subtext="Indexed with confirmed provenance"
						trend="+18 today"
						trendDirection="up"
						icon={Package}
					/>
					<StatCard
						label="Active Source Profiles"
						value="12"
						subtext="Scoped origin + path grants"
						trend="RFC 9309"
						trendDirection="neutral"
						icon={ShieldCheck}
					/>
					<StatCard
						label="Registered Nodes"
						value="4"
						subtext="Capability-scoped workforce"
						trend="120s lease"
						trendDirection="up"
						icon={Server}
					/>
				</div>

				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<Card title="Badges, Notices, Progress & Skeleton" eyebrow="DOMAIN 4 // FEEDBACK">
						<div class="flex flex-col gap-4">
							<div class="flex flex-wrap items-center gap-2">
								<Badge variant="emerald">Emerald</Badge>
								<Badge variant="amber">Amber</Badge>
								<Badge variant="sky">Sky</Badge>
								<Badge variant="danger">Danger</Badge>
								<Badge variant="neutral">Neutral</Badge>
								<Badge variant="outline">Outline</Badge>
							</div>

							<Notice variant="success" title="Release Tarball Prepared">
								Installed <code class="font-mono">vrc-packages-api@0.0.8</code> via <code class="font-mono">bun run prepare:dev preview web</code>.
							</Notice>

							<Progress value={84} max={100} color="emerald" />

							<div class="flex items-center gap-3">
								<Skeleton class="h-8 w-8 rounded-full" />
								<Skeleton class="h-4 flex-1" />
							</div>
						</div>
					</Card>

					<Card title="Avatar, Kbd, Codeblock & EmptyState" eyebrow="DOMAIN 5 // DISPLAY">
						<div class="flex flex-col gap-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2.5">
									<Avatar fallback="OP" />
									<span class="text-xs font-medium text-slate-200">Operator Session</span>
								</div>
								<div class="flex items-center gap-1">
									<Kbd>Ctrl</Kbd>
									<Kbd>K</Kbd>
								</div>
							</div>

							<Separator />

							<Codeblock
								language="json"
								code={`{"schemaVersion":1,"status":"ok","autoSeed":true}`}
							/>

							<EmptyState
								title="No Pending Takedown Notices"
								description="All creator opt-out and delisting verifications are up to date."
							/>
						</div>
					</Card>
				</div>
			</div>
		{:else}
			<div class="flex flex-col gap-6">
				<Card title="ObserverToolbar, RenderControls & AssetPlaceholder" eyebrow="DOMAIN 6 // TELEMETRY">
					<div class="flex flex-wrap items-center justify-between gap-4 mb-4">
						<ObserverToolbar
							onZoomIn={() => {}}
							onZoomOut={() => {}}
							onReset={() => {}}
							onFilter={() => {}}
						/>
						<RenderControls bind:isPlaying={demoPlaying} bind:speed={demoSpeed} />
					</div>
					<AssetPlaceholder label="Provenance Topology Preview" dimensions="100% x 140px" />
				</Card>

				<Card title="SplitPane Workbench with DataTable & PropertyInspector" eyebrow="WORKBENCH DOMAIN">
					<div class="h-[320px] rounded-xl border border-slate-800 overflow-hidden">
						<SplitPane direction="horizontal" initialSplitPercent={62}>
							{#snippet first()}
								<div class="p-3 h-full overflow-auto bg-slate-950">
									<DataTable
										columns={sampleColumns}
										data={samplePackages}
										keyField="id"
										bind:selectedId={selectedTableId}
									/>
								</div>
							{/snippet}
							{#snippet second()}
								<div class="p-3 h-full overflow-auto bg-slate-900">
									<PropertyInspector
										title="Selected Package Row"
										properties={[
											{ key: 'Row ID', value: selectedTableId, category: 'Selection' },
											{ key: 'SDK Channel', value: 'release (0.0.8)', category: 'Pipeline' }
										]}
									/>
								</div>
							{/snippet}
						</SplitPane>
					</div>
				</Card>
			</div>
		{/if}
	</Tabs>

	<FloatingPanel
		title="VRCP Telemetry Inspector"
		subtitle="Draggable Workbench FloatingPanel Primitive"
		bind:open={demoFloatingOpen}
		onClose={() => (demoFloatingOpen = false)}
	>
		<div class="flex flex-col gap-2 text-xs text-slate-300">
			<p>All 39 UI primitives in <code class="font-mono">src-web/src/lib/components/ui/</code> render without raw HTML control leaks.</p>
			<EvidenceBadge state="measured" size="sm" />
		</div>
	</FloatingPanel>
</div>
