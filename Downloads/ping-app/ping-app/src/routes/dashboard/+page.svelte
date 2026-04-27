<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { userAuth, logout } from '$lib/auth.svelte.js';
	import { alertStore, addAlert, markAllRead, clearAlerts } from '$lib/alerts.svelte.js';
	import { isBluetoothSupported, requestPingDevice, sendSOSPacket, getCurrentLocation } from '$lib/bluetooth.js';

	// UI state
	let activeTab        = $state('alerts');   // 'alerts' | 'mesh' | 'chat' | 'settings'
	let sosState         = $state('idle');      // 'idle' | 'arming' | 'sending' | 'sent'
	let sosTimer         = $state(3);
	let meshStatus       = $state('offline');  // 'offline' | 'scanning' | 'connected'
	let connectedDevice  = $state(null);
	let chatMessage      = $state('');
	let chatLog          = $state([]);
	let currentLocation  = $state(null);
	let btSupported      = $state(false);
	let showLogoutConfirm = $state(false);

	// SOS countdown interval ref
	let sosInterval = null;

	onMount(() => {
		if (!userAuth.isVerified) {
			goto('/');
			return;
		}
		btSupported = isBluetoothSupported();
		fetchLocation();

		// Simulate occasional incoming test alerts in demo mode
		const demoInterval = setInterval(() => {
			if (Math.random() < 0.15) {
				addAlert({
					type: Math.random() < 0.3 ? 'SOS' : 'MSG',
					from: ['Audu B.', 'Fatima K.', 'Ibrahim D.'][Math.floor(Math.random() * 3)],
					msg: Math.random() < 0.3
						? 'Armed men spotted on the northern road. Avoid travel.'
						: 'All quiet on the southern farm road.',
					lat: null,
					lng: null,
					ts: Date.now()
				});
			}
		}, 20000);

		return () => clearInterval(demoInterval);
	});

	async function fetchLocation() {
		currentLocation = await getCurrentLocation();
	}

	// ── SOS Logic ──────────────────────────────────────────────────────────
	function armSOS() {
		if (sosState !== 'idle') return;
		sosState = 'arming';
		sosTimer = 3;
		sosInterval = setInterval(() => {
			sosTimer -= 1;
			if (sosTimer <= 0) {
				clearInterval(sosInterval);
				sendSOS();
			}
		}, 1000);
	}

	function cancelSOS() {
		clearInterval(sosInterval);
		sosState = 'idle';
		sosTimer = 3;
	}

	async function sendSOS() {
		sosState = 'sending';
		const loc = currentLocation || await getCurrentLocation();

		addAlert({
			type: 'SOS',
			from: userAuth.username + ' (YOU)',
			msg: '🚨 SOS activated. Immediate assistance required.',
			lat: loc?.lat ?? null,
			lng: loc?.lng ?? null,
			ts: Date.now()
		});

		// Try to send via Bluetooth if connected
		if (connectedDevice) {
			await sendSOSPacket(connectedDevice, {
				username: userAuth.username,
				lat: loc?.lat ?? null,
				lng: loc?.lng ?? null,
				message: 'SOS activated. Immediate assistance required.'
			});
		}

		// Vibrate phone
		if (typeof navigator !== 'undefined' && navigator.vibrate) {
			navigator.vibrate([300, 100, 300, 100, 500]);
		}

		sosState = 'sent';
		setTimeout(() => { sosState = 'idle'; }, 4000);
	}

	// ── Bluetooth ────────────────────────────────────────────────────────
	async function connectMesh() {
		if (!btSupported) return;
		meshStatus = 'scanning';
		const device = await requestPingDevice();
		if (device) {
			connectedDevice = device;
			meshStatus = 'connected';
			addAlert({
				type: 'MSG',
				from: 'System',
				msg: `Connected to mesh node: ${device.name}`,
				lat: null, lng: null,
				ts: Date.now()
			});
		} else {
			meshStatus = 'offline';
		}
	}

	// ── Chat ─────────────────────────────────────────────────────────────
	function sendChatMessage() {
		const msg = chatMessage.trim();
		if (!msg) return;
		const entry = {
			id: Date.now(),
			from: userAuth.username,
			msg,
			ts: Date.now(),
			self: true
		};
		chatLog = [...chatLog, entry];
		chatMessage = '';

		// Simulate echoed reply from mesh (demo)
		setTimeout(() => {
			chatLog = [
				...chatLog,
				{
					id: Date.now() + 1,
					from: 'Mesh Node',
					msg: 'Signal relayed to community.',
					ts: Date.now(),
					self: false
				}
			];
		}, 1200);
	}

	// ── Helpers ──────────────────────────────────────────────────────────
	function timeAgo(ts) {
		const diff = Date.now() - ts;
		if (diff < 60000) return 'just now';
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
		return `${Math.floor(diff / 3600000)}h ago`;
	}

	function handleLogout() {
		logout();
		goto('/');
	}
</script>

<svelte:head>
	<title>P.I.N.G. – Dashboard</title>
</svelte:head>

<div class="app">
	<!-- ── Top bar ──────────────────────────────────────────────────── -->
	<header class="topbar">
		<div class="topbar-left">
			<div class="ping-logo">P.I.N.G.</div>
			<div class="village-info">
				<span class="village-name">{userAuth.villageId ?? 'Unknown'}</span>
				<span class="user-role">{userAuth.role}</span>
			</div>
		</div>
		<div class="topbar-right">
			<div class="mesh-badge {meshStatus}">
				<span class="mesh-dot"></span>
				<span>{meshStatus === 'connected' ? 'Mesh ON' : meshStatus === 'scanning' ? 'Scanning…' : 'No Mesh'}</span>
			</div>
			{#if alertStore.unreadCount > 0}
				<button class="notif-badge" onclick={markAllRead}>{alertStore.unreadCount}</button>
			{/if}
			<button class="icon-btn" onclick={() => (showLogoutConfirm = true)} title="Logout">⏻</button>
		</div>
	</header>

	<!-- ── SOS Section ──────────────────────────────────────────────── -->
	<section class="sos-section">
		<div class="sos-ring {sosState}">
			{#if sosState === 'idle'}
				<button class="sos-btn" onmousedown={armSOS} ontouchstart={armSOS}>
					<span class="sos-icon">🚨</span>
					<span class="sos-label">HOLD TO SOS</span>
				</button>
			{:else if sosState === 'arming'}
				<button class="sos-btn arming" onclick={cancelSOS}>
					<span class="sos-count">{sosTimer}</span>
					<span class="sos-label">TAP TO CANCEL</span>
				</button>
			{:else if sosState === 'sending'}
				<div class="sos-btn sending">
					<span class="sos-icon">📡</span>
					<span class="sos-label">BROADCASTING…</span>
				</div>
			{:else if sosState === 'sent'}
				<div class="sos-btn sent">
					<span class="sos-icon">✓</span>
					<span class="sos-label">SOS SENT</span>
				</div>
			{/if}
		</div>

		{#if currentLocation}
			<p class="location-tag">
				📍 {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
			</p>
		{:else}
			<p class="location-tag no-loc">📍 Location unavailable</p>
		{/if}
	</section>

	<!-- ── Tab Navigation ───────────────────────────────────────────── -->
	<nav class="tabs">
		{#each [
			{ id: 'alerts',   label: 'Alerts',   icon: '🔔' },
			{ id: 'mesh',     label: 'Mesh',     icon: '📡' },
			{ id: 'chat',     label: 'Chat',     icon: '💬' },
			{ id: 'settings', label: 'Settings', icon: '⚙️' }
		] as tab}
			<button
				class="tab-btn {activeTab === tab.id ? 'active' : ''}"
				onclick={() => { activeTab = tab.id; if (tab.id === 'alerts') markAllRead(); }}
			>
				<span>{tab.icon}</span>
				<span>{tab.label}</span>
				{#if tab.id === 'alerts' && alertStore.unreadCount > 0}
					<span class="tab-badge">{alertStore.unreadCount}</span>
				{/if}
			</button>
		{/each}
	</nav>

	<!-- ── Tab Content ──────────────────────────────────────────────── -->
	<main class="tab-content">

		<!-- Alerts Tab -->
		{#if activeTab === 'alerts'}
			<div class="alerts-panel">
				<div class="panel-header">
					<h2>Community Alerts</h2>
					{#if alertStore.alerts.length > 0}
						<button class="small-btn" onclick={clearAlerts}>Clear All</button>
					{/if}
				</div>

				{#if alertStore.alerts.length === 0}
					<div class="empty-state">
						<span>🟢</span>
						<p>All clear. No active alerts.</p>
					</div>
				{:else}
					<div class="alert-list">
						{#each alertStore.alerts as alert (alert.id)}
							<div class="alert-item {alert.type} {alert.read ? 'read' : 'unread'}">
								<div class="alert-header">
									<span class="alert-type-badge {alert.type}">{alert.type}</span>
									<span class="alert-from">{alert.from}</span>
									<span class="alert-time">{timeAgo(alert.ts)}</span>
								</div>
								<p class="alert-msg">{alert.msg}</p>
								{#if alert.lat && alert.lng}
									<a
										class="alert-coords"
										href="https://maps.google.com/?q={alert.lat},{alert.lng}"
										target="_blank"
										rel="noopener"
									>
										📍 {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)} →
									</a>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

		<!-- Mesh Tab -->
		{:else if activeTab === 'mesh'}
			<div class="mesh-panel">
				<div class="panel-header"><h2>Bluetooth Mesh</h2></div>

				{#if !btSupported}
					<div class="warn-card">
						⚠️ Web Bluetooth is not supported on this browser.<br />
						Use <strong>Chrome on Android</strong> or <strong>Bluefy</strong> on iPhone.
					</div>
				{:else}
					<div class="mesh-status-card {meshStatus}">
						<div class="mesh-icon">{meshStatus === 'connected' ? '📡' : meshStatus === 'scanning' ? '🔍' : '📴'}</div>
						<div class="mesh-info">
							<strong>
								{meshStatus === 'connected' ? `Connected: ${connectedDevice?.name ?? 'Node'}` :
								 meshStatus === 'scanning' ? 'Scanning for nodes…' :
								 'No mesh connection'}
							</strong>
							<small>
								{meshStatus === 'connected' ? 'Messages will relay via Bluetooth' :
								 'SOS will be stored locally until connected'}
							</small>
						</div>
					</div>

					{#if meshStatus !== 'connected'}
						<button class="btn-secondary full-width" onclick={connectMesh} disabled={meshStatus === 'scanning'}>
							{meshStatus === 'scanning' ? '🔍 Scanning…' : '📡 Connect to Mesh Node'}
						</button>
					{:else}
						<button class="btn-danger full-width" onclick={() => { connectedDevice = null; meshStatus = 'offline'; }}>
							Disconnect
						</button>
					{/if}
				{/if}

				<div class="mesh-explain">
					<h3>How Mesh Works</h3>
					<p>
						Your phone connects to a nearby <strong>P.I.N.G. Node</strong> (an ESP32 device)
						via Bluetooth. Nodes relay your SOS across the village even when cell towers are
						down. Range: up to 1 km per hop.
					</p>
					<div class="mesh-diagram">
						<span class="node you">📱 You</span>
						<span class="arrow">→ BLE →</span>
						<span class="node">📡 Node</span>
						<span class="arrow">→ LoRa →</span>
						<span class="node">📡 Node</span>
						<span class="arrow">→ BLE →</span>
						<span class="node vanguard">🛡 Vanguard</span>
					</div>
				</div>
			</div>

		<!-- Chat Tab -->
		{:else if activeTab === 'chat'}
			<div class="chat-panel">
				<div class="panel-header"><h2>Mesh Chat</h2></div>

				<div class="chat-log">
					{#if chatLog.length === 0}
						<div class="empty-state">
							<span>💬</span>
							<p>No messages yet. Send a text to your mesh network.</p>
						</div>
					{:else}
						{#each chatLog as entry (entry.id)}
							<div class="chat-bubble {entry.self ? 'self' : 'other'}">
								{#if !entry.self}
									<span class="chat-from">{entry.from}</span>
								{/if}
								<p class="chat-text">{entry.msg}</p>
								<span class="chat-time">{timeAgo(entry.ts)}</span>
							</div>
						{/each}
					{/if}
				</div>

				<div class="chat-input-row">
					<input
						type="text"
						bind:value={chatMessage}
						placeholder="Type a message…"
						onkeydown={(e) => e.key === 'Enter' && sendChatMessage()}
						maxlength="200"
					/>
					<button class="send-btn" onclick={sendChatMessage} disabled={!chatMessage.trim()}>
						Send
					</button>
				</div>
			</div>

		<!-- Settings Tab -->
		{:else if activeTab === 'settings'}
			<div class="settings-panel">
				<div class="panel-header"><h2>Settings</h2></div>

				<div class="setting-card">
					<h3>Identity</h3>
					<div class="setting-row">
						<span class="setting-label">Name</span>
						<span class="setting-value">{userAuth.username}</span>
					</div>
					<div class="setting-row">
						<span class="setting-label">Role</span>
						<span class="setting-value cap">{userAuth.role}</span>
					</div>
					<div class="setting-row">
						<span class="setting-label">Village ID</span>
						<span class="setting-value">{userAuth.villageId ?? '—'}</span>
					</div>
					<div class="setting-row">
						<span class="setting-label">Village Key</span>
						<span class="setting-value">{userAuth.villageKey}</span>
					</div>
				</div>

				<div class="setting-card">
					<h3>Device</h3>
					<div class="setting-row">
						<span class="setting-label">Bluetooth</span>
						<span class="setting-value {btSupported ? 'green' : 'red'}">
							{btSupported ? '✓ Supported' : '✗ Not supported'}
						</span>
					</div>
					<div class="setting-row">
						<span class="setting-label">Location</span>
						<span class="setting-value {currentLocation ? 'green' : 'red'}">
							{currentLocation ? '✓ Available' : '✗ Unavailable'}
						</span>
					</div>
					<div class="setting-row">
						<span class="setting-label">Mesh</span>
						<span class="setting-value {meshStatus === 'connected' ? 'green' : 'red'}">
							{meshStatus === 'connected' ? '✓ Connected' : '✗ Offline'}
						</span>
					</div>
				</div>

				<div class="setting-card">
					<h3>Data</h3>
					<button class="btn-secondary full-width" onclick={clearAlerts}>Clear All Alerts</button>
				</div>

				<button class="btn-danger full-width mt" onclick={() => (showLogoutConfirm = true)}>
					⏻ Leave Network
				</button>
			</div>
		{/if}
	</main>
</div>

<!-- ── Logout Confirm Modal ──────────────────────────────────────── -->
{#if showLogoutConfirm}
	<div class="modal-overlay" role="button" tabindex="0" aria-label="Close modal" onclick={() => (showLogoutConfirm = false)} onkeydown={(e) => e.key === "Escape" && (showLogoutConfirm = false)}>
		<div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<h3>Leave Network?</h3>
			<p>You will need your Village Key to rejoin.</p>
			<div class="modal-btns">
				<button class="btn-secondary" onclick={() => (showLogoutConfirm = false)}>Cancel</button>
				<button class="btn-danger" onclick={handleLogout}>Leave</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ── Layout ─────────────────────────────────── */
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		background: var(--bg-primary);
	}

	/* ── Top Bar ────────────────────────────────── */
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 1rem;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 100;
	}
	.topbar-left { display: flex; align-items: center; gap: 0.75rem; }
	.topbar-right { display: flex; align-items: center; gap: 0.5rem; }

	.ping-logo {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 1.1rem;
		color: var(--red);
		letter-spacing: 0.15em;
	}
	.village-info {
		display: flex;
		flex-direction: column;
		gap: 0px;
	}
	.village-name { font-size: 0.7rem; color: var(--text-primary); font-weight: 600; }
	.user-role { font-size: 0.62rem; color: var(--text-muted); text-transform: capitalize; }

	.mesh-badge {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.68rem;
		padding: 3px 8px;
		border-radius: 20px;
		border: 1px solid var(--border);
		background: var(--bg-card);
		color: var(--text-secondary);
	}
	.mesh-badge .mesh-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text-muted);
	}
	.mesh-badge.connected { border-color: rgba(0,230,118,0.3); color: var(--green); }
	.mesh-badge.connected .mesh-dot { background: var(--green); animation: blink 1.5s infinite; }
	.mesh-badge.scanning .mesh-dot { background: var(--amber); animation: blink 0.8s infinite; }

	@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

	.notif-badge {
		background: var(--red);
		color: white;
		border: none;
		border-radius: 20px;
		padding: 2px 7px;
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
	}
	.icon-btn {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 1rem;
		cursor: pointer;
		padding: 4px;
		line-height: 1;
	}
	.icon-btn:hover { color: var(--text-primary); }

	/* ── SOS Section ────────────────────────────── */
	.sos-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1.5rem 1rem 1rem;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border);
	}

	.sos-ring {
		width: 160px;
		height: 160px;
		border-radius: 50%;
		border: 2px solid rgba(255,45,45,0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		transition: border-color 0.3s;
	}
	.sos-ring::before {
		content: '';
		position: absolute;
		inset: -10px;
		border-radius: 50%;
		border: 1px solid rgba(255,45,45,0.08);
	}
	.sos-ring.arming { border-color: rgba(245,166,35,0.6); animation: pulse-amber 0.8s infinite; }
	.sos-ring.sending, .sos-ring.sent { border-color: rgba(255,45,45,0.7); animation: pulse-red 0.6s infinite; }

	@keyframes pulse-amber { 0%,100%{box-shadow:0 0 0 0 rgba(245,166,35,0.3)} 50%{box-shadow:0 0 0 20px transparent} }
	@keyframes pulse-red   { 0%,100%{box-shadow:0 0 0 0 rgba(255,45,45,0.4)} 50%{box-shadow:0 0 0 25px transparent} }

	.sos-btn {
		width: 130px;
		height: 130px;
		border-radius: 50%;
		background: var(--red);
		border: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 0 0 30px var(--red-glow);
		transition: transform 0.1s, box-shadow 0.2s;
		gap: 4px;
		-webkit-user-select: none;
		user-select: none;
	}
	.sos-btn:active { transform: scale(0.95); }
	.sos-btn.arming { background: var(--amber); box-shadow: 0 0 30px var(--amber-glow); }
	.sos-btn.sending { background: #c0392b; cursor: default; }
	.sos-btn.sent { background: #27ae60; box-shadow: 0 0 30px var(--green-glow); cursor: default; }

	.sos-icon { font-size: 1.8rem; }
	.sos-label { font-family: var(--font-display); font-size: 0.6rem; font-weight: 700; color: white; letter-spacing: 0.1em; }
	.sos-count { font-family: var(--font-display); font-size: 2.5rem; font-weight: 800; color: white; line-height: 1; }

	.location-tag {
		font-size: 0.67rem;
		color: var(--text-muted);
		margin-top: 0.6rem;
	}
	.location-tag.no-loc { color: var(--text-muted); }

	/* ── Tabs ───────────────────────────────────── */
	.tabs {
		display: flex;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 50px;
		z-index: 90;
	}
	.tab-btn {
		flex: 1;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 0.7rem 0.25rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		font-family: var(--font-display);
		font-size: 0.62rem;
		color: var(--text-muted);
		cursor: pointer;
		position: relative;
		transition: color 0.15s, border-color 0.15s;
	}
	.tab-btn:hover { color: var(--text-secondary); }
	.tab-btn.active { color: var(--red); border-bottom-color: var(--red); }

	.tab-badge {
		position: absolute;
		top: 6px;
		right: calc(50% - 18px);
		background: var(--red);
		color: white;
		border-radius: 10px;
		font-size: 0.55rem;
		padding: 1px 5px;
		font-weight: 700;
	}

	/* ── Tab Content ────────────────────────────── */
	.tab-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	.panel-header h2 {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	/* ── Alerts ─────────────────────────────────── */
	.empty-state {
		text-align: center;
		padding: 2rem;
		color: var(--text-muted);
		font-size: 0.85rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.empty-state span { font-size: 1.8rem; }

	.alert-list { display: flex; flex-direction: column; gap: 0.6rem; }

	.alert-item {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem;
		transition: border-color 0.2s;
	}
	.alert-item.SOS { border-left: 3px solid var(--red); }
	.alert-item.MSG { border-left: 3px solid var(--blue); }
	.alert-item.ALL_CLEAR { border-left: 3px solid var(--green); }
	.alert-item.unread { background: var(--bg-hover); }

	.alert-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
		flex-wrap: wrap;
	}
	.alert-type-badge {
		font-size: 0.6rem;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 4px;
		letter-spacing: 0.05em;
	}
	.alert-type-badge.SOS { background: rgba(255,45,45,0.2); color: var(--red); }
	.alert-type-badge.MSG { background: rgba(41,182,246,0.2); color: var(--blue); }
	.alert-type-badge.ALL_CLEAR { background: rgba(0,230,118,0.2); color: var(--green); }
	.alert-from { font-size: 0.75rem; color: var(--text-primary); font-weight: 600; flex: 1; }
	.alert-time { font-size: 0.65rem; color: var(--text-muted); }
	.alert-msg { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.5; }
	.alert-coords {
		display: inline-block;
		margin-top: 0.35rem;
		font-size: 0.68rem;
		color: var(--blue);
		text-decoration: none;
	}
	.alert-coords:hover { text-decoration: underline; }

	/* ── Mesh Panel ─────────────────────────────── */
	.warn-card {
		background: rgba(245,166,35,0.1);
		border: 1px solid rgba(245,166,35,0.3);
		border-radius: var(--radius);
		padding: 1rem;
		font-size: 0.8rem;
		color: var(--amber);
		line-height: 1.6;
		margin-bottom: 1rem;
	}

	.mesh-status-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.mesh-status-card.connected { border-color: rgba(0,230,118,0.3); }
	.mesh-icon { font-size: 1.5rem; flex-shrink: 0; }
	.mesh-info { display: flex; flex-direction: column; gap: 2px; }
	.mesh-info strong { font-size: 0.85rem; color: var(--text-primary); }
	.mesh-info small { font-size: 0.7rem; color: var(--text-secondary); }

	.mesh-explain {
		margin-top: 1.25rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
	}
	.mesh-explain h3 {
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		color: var(--text-primary);
	}
	.mesh-explain p {
		font-size: 0.78rem;
		color: var(--text-secondary);
		line-height: 1.65;
		margin-bottom: 1rem;
	}
	.mesh-diagram {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		font-size: 0.72rem;
	}
	.node { background: var(--bg-hover); padding: 3px 8px; border-radius: 4px; color: var(--text-primary); }
	.node.you { border: 1px solid var(--red); }
	.node.vanguard { border: 1px solid var(--green); }
	.arrow { color: var(--text-muted); }

	/* ── Chat ───────────────────────────────────── */
	.chat-panel { display: flex; flex-direction: column; height: calc(100dvh - 300px); }
	.chat-log {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding-bottom: 0.5rem;
	}
	.chat-bubble {
		max-width: 80%;
		padding: 0.6rem 0.85rem;
		border-radius: var(--radius);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.chat-bubble.self {
		align-self: flex-end;
		background: rgba(255,45,45,0.15);
		border: 1px solid rgba(255,45,45,0.2);
	}
	.chat-bubble.other {
		align-self: flex-start;
		background: var(--bg-card);
		border: 1px solid var(--border);
	}
	.chat-from { font-size: 0.65rem; color: var(--text-muted); }
	.chat-text { font-size: 0.82rem; color: var(--text-primary); line-height: 1.5; }
	.chat-time { font-size: 0.62rem; color: var(--text-muted); align-self: flex-end; }

	.chat-input-row {
		display: flex;
		gap: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--border);
		margin-top: 0.5rem;
	}
	.chat-input-row input {
		flex: 1;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.6rem 0.85rem;
		color: var(--text-primary);
		font-family: var(--font-body);
		font-size: 0.85rem;
		outline: none;
	}
	.chat-input-row input:focus { border-color: var(--border-focus); }
	.send-btn {
		background: var(--red);
		color: white;
		border: none;
		border-radius: var(--radius);
		padding: 0.6rem 1rem;
		font-family: var(--font-display);
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
	}
	.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	/* ── Settings ───────────────────────────────── */
	.settings-panel { display: flex; flex-direction: column; gap: 1rem; }
	.setting-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
	}
	.setting-card h3 {
		font-family: var(--font-display);
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 0.75rem;
	}
	.setting-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border);
		font-size: 0.8rem;
	}
	.setting-row:last-child { border-bottom: none; }
	.setting-label { color: var(--text-secondary); }
	.setting-value { color: var(--text-primary); font-weight: 500; }
	.setting-value.cap { text-transform: capitalize; }
	.setting-value.green { color: var(--green); }
	.setting-value.red { color: var(--red); }

	/* ── Shared Buttons ─────────────────────────── */
	.btn-secondary {
		background: var(--bg-hover);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.7rem 1rem;
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}
	.btn-secondary:hover { background: var(--bg-card); }
	.btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }

	.btn-danger {
		background: rgba(255,45,45,0.1);
		color: var(--red);
		border: 1px solid rgba(255,45,45,0.25);
		border-radius: var(--radius);
		padding: 0.7rem 1rem;
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		transition: background 0.15s;
	}
	.btn-danger:hover { background: rgba(255,45,45,0.2); }

	.full-width { width: 100%; }
	.mt { margin-top: 0.5rem; }
	.small-btn {
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 3px 10px;
		color: var(--text-muted);
		font-family: var(--font-body);
		font-size: 0.72rem;
		cursor: pointer;
	}
	.small-btn:hover { color: var(--text-primary); }

	/* ── Modal ──────────────────────────────────── */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 999;
		padding: 1rem;
	}
	.modal {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		width: 100%;
		max-width: 300px;
	}
	.modal h3 {
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		color: var(--text-primary);
	}
	.modal p { font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1.25rem; }
	.modal-btns { display: flex; gap: 0.75rem; }
	.modal-btns button { flex: 1; }
</style>
