<script>
	import { onMount } from 'svelte';
	import { checkOfflineAuth } from '$lib/auth.svelte.js';
	import { loadPersistedAlerts } from '$lib/alerts.svelte.js';

	let { children } = $props();

	onMount(() => {
		checkOfflineAuth();
		loadPersistedAlerts();
	});
</script>

{@render children()}

<style>
	:global(*) {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}

	:global(:root) {
		/* Core palette – tactical dark */
		--bg-primary:   #080b0f;
		--bg-secondary: #0d1117;
		--bg-card:      #111822;
		--bg-hover:     #1a2332;

		/* Alert colours */
		--red:          #ff2d2d;
		--red-dim:      #cc1f1f;
		--red-glow:     rgba(255, 45, 45, 0.25);
		--amber:        #f5a623;
		--amber-glow:   rgba(245, 166, 35, 0.2);
		--green:        #00e676;
		--green-glow:   rgba(0, 230, 118, 0.2);
		--blue:         #29b6f6;

		/* Text */
		--text-primary:   #e8edf3;
		--text-secondary: #7a8fa8;
		--text-muted:     #3f5166;

		/* Borders */
		--border:       rgba(255, 255, 255, 0.07);
		--border-focus: rgba(255, 45, 45, 0.4);

		/* Typography – Syne (display) + IBM Plex Mono (data) */
		--font-display: 'Syne', sans-serif;
		--font-body:    'IBM Plex Mono', monospace;
		--font-ui:      'Syne', sans-serif;

		/* Spacing */
		--radius:   8px;
		--radius-lg: 16px;
	}

	:global(html, body) {
		background: var(--bg-primary);
		color: var(--text-primary);
		font-family: var(--font-body);
		font-size: 14px;
		line-height: 1.6;
		min-height: 100dvh;
		-webkit-font-smoothing: antialiased;
	}

	:global(#svelte) {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

</style>
