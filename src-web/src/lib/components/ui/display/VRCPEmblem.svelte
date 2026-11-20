<script lang="ts">
	let {
		size = 24,
		color = '#059669',
		class: className = ''
	}: {
		size?: number;
		color?: string;
		class?: string;
	} = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 32 32"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	class="shrink-0 {className}"
	aria-hidden="true"
>
	<!-- VRCP catalog outer discovery ring -->
	<circle cx="16" cy="16" r="14" stroke={color} stroke-width="1.75" stroke-dasharray="2 4" opacity="0.4" />
	
	<!-- Central VRCP package provenance graph -->
	<path
		d="M16 26V15M16 15L10 9M16 15L22 9M16 19L11 15M16 19L21 15"
		stroke={color}
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	
	<!-- Package & source identity nodes -->
	<circle cx="16" cy="6" r="2.5" fill={color} />
	<circle cx="9" cy="8.5" r="2" fill={color} />
	<circle cx="23" cy="8.5" r="2" fill={color} />
	<circle cx="10" cy="14.5" r="1.75" fill={color} opacity="0.8" />
	<circle cx="22" cy="14.5" r="1.75" fill={color} opacity="0.8" />
	<circle cx="16" cy="27" r="1.5" fill={color} />
</svg>
