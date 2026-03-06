<script lang="ts">
	interface Props {
		size?: number;
	}

	let { size = 24 }: Props = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="backyard logo">
	<defs>
		<mask id="backyard-cutout">
			<rect x="0" y="0" width="200" height="200" fill="black"/>
			<ellipse cx="100" cy="110" rx="92" ry="72" fill="white" transform="rotate(-22 100 110)"/>
			<path
				d="M50 89 L100 49 L150 89 L150 169 L115 169 L115 119 L85 119 L85 169 L50 169 Z"
				fill="black"
			/>
		</mask>
	</defs>
	<rect x="0" y="0" width="200" height="200" fill="currentColor" mask="url(#backyard-cutout)"/>
</svg>
