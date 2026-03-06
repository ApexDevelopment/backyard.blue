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
			<ellipse cx="96" cy="100" rx="88" ry="68" fill="white" transform="rotate(-28 96 100)"/>
			<path
				d="M50 79 L100 39 L150 79 L150 159 L115 159 L115 109 L85 109 L85 159 L50 159 Z"
				fill="black"
			/>
		</mask>
	</defs>
	<rect x="0" y="0" width="200" height="200" fill="currentColor" mask="url(#backyard-cutout)"/>
</svg>
