<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { userAuth, logout, LANGUAGES } from '$lib/auth.svelte.js';
	import { alertStore, addAlert, markAllRead } from '$lib/alerts.svelte.js';
	import {
		meshInit, meshSend, meshDestroy, meshState,
		bleConnect, bleDisconnect, isBLESupported,
		rtcAnnounce, rtcDisconnect, isWebRTCSupported,
		buildSOSPacket, buildMsgPacket, getCurrentLocation,
		getMeshCapabilities,
	} from '$lib/mesh.js';
	import { broadcastPacket, drainOfflineQueue } from '$lib/bluetooth.js';
	import { startLocationWatch, stopLocationWatch, formatCoord } from '$lib/location.js';
	import { i18n, t } from '$lib/i18n.js';
	const T = $derived((key) => t($i18n.lang, key));

	let tab = $state('alerts');
	let sosState = $state('idle');
	let sosInterval = null;
	let loc = $state({ lat: null, lng: null, accuracy: null, region: null, error: null, lastUpdated: null });
	let locGranted = $state(false);
	// Mesh — derived from meshState (plain object, not Svelte $state)
	let meshCaps = $state({ ble: false, webrtc: false, broadcast: false, storage: false });
	let meshError = $state('');
	// Chat handled by /chat route
	let settingsTab = $state('profile');
	let editLang = $state('en');
	let settingsSaved = $state(false);
	let showLogoutConfirm = $state(false);
	// Chat (mesh local — separate from /chat route which uses Supabase)
	let chatMsgs = $state([]);
	let chatMsg  = $state('');
	// Trigger re-render when meshState changes — poll every 500ms (meshState is a plain obj)
	let _meshTick = $state(0);
	let _meshInterval = null;

	// Dashboard guard — only redirect after first mount tick so the store
	// has a chance to hydrate before we incorrectly bounce the user back.
	let _guardReady = $state(false);
	$effect(() => {
		if (_guardReady && !$userAuth.isVerified) goto('/');
	});

	onMount(() => {
		editLang = $userAuth.language ?? 'en';
		meshCaps = getMeshCapabilities();
		startLocation();
		drainOfflineQueue(onMeshPacket);
		// Init mesh — BLE+WebRTC+BroadcastChannel+localStorage
		meshInit(
			$userAuth.username || $userAuth.firstName || 'User',
			$userAuth.villageKey || 'default',
			onMeshPacket
		);
		// Poll meshState to trigger reactivity (plain JS object)
		_meshInterval = setInterval(() => { _meshTick++; }, 600);
		// Enable the auth guard only after mount
		_guardReady = true;
	});

	onDestroy(() => {
		clearInterval(sosInterval);
		clearInterval(_meshInterval);
		stopLocationWatch();
		meshDestroy();
	});

	function startLocation() {
		startLocationWatch(update => { loc = update; locGranted = !!update.lat; });
	}

	async function connectBLE() {
		meshError = '';
		const result = await bleConnect();
		if (!result.ok) meshError = result.error;
	}

	async function connectWebRTC() {
		meshError = '';
		const result = await rtcAnnounce();
		if (!result.ok) meshError = result.error;
	}

	function disconnectMesh() {
		bleDisconnect();
		rtcDisconnect();
	}

	function onMeshPacket(pkt) {
		if (!pkt?.type) return;
		meshState.log = [{ ...pkt, _received: Date.now() }, ...meshState.log.slice(0, 49)];
		if (pkt.type === 'MSG') chatMsgs = [...chatMsgs, { from: pkt.from, msg: pkt.msg, ts: pkt.ts, mine: false }];
		if (pkt.type === 'SOS') addAlert({ type: 'SOS', from: pkt.from, msg: pkt.msg, lat: pkt.lat, lng: pkt.lng, ts: pkt.ts });
	}

	async function fireSOS() {
		if (sosState === 'fired') return; // prevent double-tap
		sosState = 'fired';

		// 1. Vibrate immediately
		if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 600]);

		// 2. Call 199 immediately — use window.open so app stays alive
		window.open('tel:199');

		// 3. Get location & broadcast SOS to mesh in background
		const curLoc = loc.lat ? loc : await getCurrentLocation();
		const pkt = buildSOSPacket(userAuth, curLoc);
		addAlert({
			type: 'SOS',
			from: `${$userAuth.firstName} (YOU)`,
			msg:  '🚨 SOS activated — Police called',
			lat:  curLoc?.lat,
			lng:  curLoc?.lng,
			ts:   Date.now()
		});
		await meshSend(pkt);

		// 4. Reset after 8s
		setTimeout(() => { sosState = 'idle'; }, 8000);
	}

	async function sendChat() {
		const text = chatMsg.trim(); if (!text) return;
		chatMsg = '';
		const pkt = buildMsgPacket(userAuth, text);
		chatMsgs = [...chatMsgs, { from: $userAuth.username || $userAuth.firstName, msg: text, ts: Date.now(), mine: true }];
		await meshSend(pkt);
	}

	function saveSettings() { $userAuth.language = editLang; settingsSaved = true; setTimeout(() => settingsSaved = false, 2000); }
	async function doLogout() { await logout(); goto('/'); }
	function fmtTime(ts) { return new Date(ts).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }); }
	const langName = (code) => LANGUAGES.find(l => l.code === code)?.native ?? code;
	const unread = $derived($alertStore.alerts?.filter(a => !a.read).length ?? 0);
</script>

<div class="app">
	<!-- TOP BAR -->
	<header class="topbar">
		<div class="brand">
			<svg width="20" height="20" viewBox="0 0 28 28" fill="none">
				<circle cx="14" cy="14" r="3" fill="#29b6f6"/>
				<circle cx="14" cy="14" r="7.5" stroke="#29b6f6" stroke-width="1.5" fill="none" opacity=".7"/>
				<circle cx="14" cy="14" r="12" stroke="#29b6f6" stroke-width=".8" fill="none" opacity=".25"/>
			</svg>
			<div>
				<span class="bname">P.I.N.G.</span>
				<span class="bsub">{T("appSub")}</span>
			</div>
		</div>
		<div class="top-right">
			<div class="dots">
				<span class="dot" class:on={meshState.connected} title="Mesh"></span>
				<span class="dot blue" class:on={locGranted} title="GPS"></span>
			</div>
			{#if $userAuth.username}<span class="usr">@{$userAuth.username}</span>{/if}
		</div>
	</header>

	<!-- SOS -->
	<div class="sos-zone">
		{#if sosState === 'idle'}
			<button class="sos" onclick={fireSOS}>
				<span class="sos-t">SOS</span>
				<span class="sos-s">Press to call 199</span>
			</button>
		{:else}
			<button class="sos fired" disabled>
				<span class="sos-t">🚨</span>
				<span class="sos-s">Calling Police…</span>
			</button>
		{/if}
	</div>

	<!-- TAB BAR -->
	<nav class="tabbar">
		<button class="tb" class:on={tab==='alerts'} onclick={() => tab='alerts'}>
			<span class="tb-icon">🔔</span>
			<span class="tb-lbl">{T('alerts')}</span>
			{#if unread > 0}<span class="badge">{unread}</span>{/if}
		</button>
		<button class="tb" class:on={tab==='map'} onclick={() => tab='map'}>
			<span class="tb-icon">📍</span><span class="tb-lbl">{T('location')}</span>
		</button>
		<button class="tb" onclick={() => goto('/chat')}>
			<span class="tb-icon">💬</span><span class="tb-lbl">{T('chat')}</span>
		</button>
		<button class="tb" class:on={tab==='mesh'} onclick={() => tab='mesh'}>
			<span class="tb-icon">📡</span><span class="tb-lbl">{T('mesh')}</span>
		</button>
		<button class="tb" class:on={tab==='settings'} onclick={() => tab='settings'}>
			<span class="tb-icon">⚙️</span><span class="tb-lbl">{T('settings')}</span>
		</button>
	</nav>

	<!-- CONTENT -->
	<main class="content">

		<!-- ALERTS -->
		{#if tab === 'alerts'}
			<div class="sec-head">
				<h3>{T("communityAlerts")}</h3>
				<button class="ghost" onclick={markAllRead}>{T("markRead")}</button>
			</div>
			{#if !$alertStore.alerts?.length}
				<div class="empty"><div class="empty-icon">🛡️</div><p>{T("noAlerts")}</p></div>
			{:else}
				{#each [...$alertStore.alerts] as a}
					<div class="card" class:sos={a.type==='SOS'} class:unread={!a.read}>
						<div class="card-top">
							<span class="tag" class:red={a.type==='SOS'}>{a.type}</span>
							<span class="ts">{fmtTime(a.ts)}</span>
						</div>
						<p class="afrom">{a.from}</p>
						<p class="amsg">{a.msg}</p>
						{#if a.lat}<p class="aloc">📍 {formatCoord(a.lat,true)} · {formatCoord(a.lng,false)}</p>{/if}
					</div>
				{/each}
			{/if}

		<!-- LOCATION -->
		{:else if tab === 'map'}
			<div class="sec-head"><h3>{T("yourLocation")}</h3></div>
			{#if loc.lat}
				<div class="coord-grid">
					<div class="cg"><span class="cg-l">LATITUDE</span><span class="cg-v">{formatCoord(loc.lat,true)}</span><span class="cg-r">{loc.lat.toFixed(6)}</span></div>
					<div class="cg"><span class="cg-l">LONGITUDE</span><span class="cg-v">{formatCoord(loc.lng,false)}</span><span class="cg-r">{loc.lng.toFixed(6)}</span></div>
					<div class="cg"><span class="cg-l">ACCURACY</span><span class="cg-v">±{loc.accuracy ?? '—'}m</span></div>
					<div class="cg"><span class="cg-l">REGION</span><span class="cg-v sm">{loc.region?.name ?? '—'}</span></div>
					<div class="cg span2"><span class="cg-l">COMMUNITY</span><span class="cg-v">{$userAuth.villageDisplayName || '—'}</span></div>
				</div>
				{#if loc.lastUpdated}<p class="upd">Updated {loc.lastUpdated.toLocaleTimeString('en-NG')}</p>{/if}
				<div class="map-wrap">
					<iframe title="Map" loading="lazy" style="width:100%;height:240px;border:none;border-radius:12px;"
						src="https://www.openstreetmap.org/export/embed.html?bbox={loc.lng-.01},{loc.lat-.01},{loc.lng+.01},{loc.lat+.01}&layer=mapnik&marker={loc.lat},{loc.lng}">
					</iframe>
					<a class="osm" href="https://www.openstreetmap.org/?mlat={loc.lat}&mlon={loc.lng}" target="_blank" rel="noopener">Open in OpenStreetMap ↗</a>
				</div>
			{:else if loc.error}
				<div class="empty"><div class="empty-icon">⚠️</div><p>{loc.error}</p></div>
			{:else}
				<div class="empty"><div class="empty-icon">📍</div><p>Acquiring GPS…</p><div class="spin"></div></div>
			{/if}

		<!-- MESH -->
		{:else if tab === 'mesh'}
			<div class="sec-head"><h3>Community Mesh</h3></div>

			<!-- Capability badges -->
			<div class="caps-row">
				<span class="cap" class:on={meshCaps.webrtc}>
					🔗 WebRTC {meshCaps.webrtc ? '✓' : '✗'}
				</span>
				<span class="cap" class:on={meshCaps.ble}>
					📡 BLE {meshCaps.ble ? '✓' : '✗'}
				</span>
				<span class="cap" class:on={meshCaps.broadcast}>
					📶 Local {meshCaps.broadcast ? '✓' : '✗'}
				</span>
			</div>

			<!-- Status card -->
			<div class="mesh-card">
				<div class="mr">
					<span class="ml">Transport</span>
					<span class="mv" class:g={meshState.transport!=='none'&&meshState.transport!=='storage'}>
						{meshState.transport.toUpperCase()}
					</span>
				</div>
				<div class="mr">
					<span class="ml">Peers</span>
					<span class="mv" class:g={meshState.peers.length>0}>{meshState.peers.length}</span>
				</div>
				<div class="mr">
					<span class="ml">BLE</span>
					<span class="mv"
						class:g={meshState.bleStatus==='connected'}
						class:a={meshState.bleStatus==='connecting'}
						class:r={meshState.bleStatus==='error'}>
						{meshState.bleStatus.toUpperCase()}
					</span>
				</div>
				<div class="mr">
					<span class="ml">WebRTC</span>
					<span class="mv"
						class:g={meshState.rtcStatus==='connected'}
						class:a={meshState.rtcStatus==='signaling'}>
						{meshState.rtcStatus.toUpperCase()}
					</span>
				</div>
			</div>

			{#if meshError}<p class="err-sm">⚠ {meshError}</p>{/if}

			<!-- Connect buttons -->
			<div class="mesh-btns">
				{#if meshCaps.webrtc}
					<button class="btn-p" onclick={connectWebRTC}
						disabled={meshState.rtcStatus==='signaling'}>
						{meshState.rtcStatus==='signaling' ? 'Signaling…' : '🔗 Join via WebRTC'}
					</button>
				{/if}
				{#if meshCaps.ble}
					<button class="btn-p" onclick={connectBLE}
						disabled={meshState.bleStatus==='connecting'||meshState.bleStatus==='connected'}>
						{meshState.bleStatus==='connecting' ? 'Scanning…' : '📡 Scan BLE peers'}
					</button>
				{/if}
				{#if meshState.connected}
					<button class="btn-g" onclick={disconnectMesh}>Disconnect all</button>
				{/if}
			</div>

			{#if !meshCaps.ble && !meshCaps.webrtc}
				<div class="info warn">
					<p>⚠️ This browser doesn't support Web Bluetooth or WebRTC. Try <strong>Chrome</strong> or <strong>Firefox</strong> for peer-to-peer mesh.</p>
				</div>
			{:else if !meshCaps.ble}
				<div class="info">
					<p style="font-size:.72rem;line-height:1.6">
						<strong>WebRTC active</strong> — works in Chrome, Firefox & Safari.
						Peers on the same Wi-Fi/LAN connect automatically after clicking "Join via WebRTC" on both devices.
						{#if !meshCaps.ble}<br/><em>Web Bluetooth unavailable in this browser — use Chrome on Android for BLE mesh.</em>{/if}
					</p>
				</div>
			{/if}

			<!-- Peers list -->
			{#if meshState.peers.length}
				<div class="peers">
					<p class="peers-t">Connected peers</p>
					{#each meshState.peers as p}
						<div class="peer">
							<span class="pdot"></span>
							{p.name}
							<span class="ptag">{p.transport}</span>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Mesh log -->
			{#if meshState.log.length}
				<div class="mlog">
					<p class="peers-t">Mesh log</p>
					{#each meshState.log.slice(0, 20) as e}
						<div class="lrow">
							<span class="ltype" class:rs={e.type==='SOS'}>{e.type}</span>
							<span class="lfrom">{e.from ?? 'system'}</span>
							<span class="lmsg">{(e.msg ?? '').slice(0, 50)}</span>
							<span class="lts">{fmtTime(e.ts)}</span>
						</div>
					{/each}
				</div>
			{/if}

		<!-- SETTINGS -->
		{:else if tab === 'settings'}
			<div class="sec-head"><h3>{T("settingsTitle")}</h3></div>
			<div class="stabs">
				{#each [['profile','👤 Profile'],['security','🔐 Security'],['notifs','🔔 Alerts'],['about','ℹ️ About']] as [st,label]}
					<button class="stab" class:on={settingsTab===st} onclick={() => settingsTab=st}>{label}</button>
				{/each}
			</div>

			{#if settingsTab === 'profile'}
				<div class="rows">
					<div class="row"><span class="rl">Name</span><span class="rv">{$userAuth.firstName} {$userAuth.lastName}</span></div>
					<div class="row"><span class="rl">Username</span><span class="rv mono">@{$userAuth.username||'—'}</span></div>
					<div class="row"><span class="rl">Email</span><span class="rv">{$userAuth.email||'—'}</span></div>
					<div class="row"><span class="rl">Phone</span><span class="rv">{$userAuth.phone||'—'}</span></div>
					<div class="row"><span class="rl">Role</span><span class="rv cap">{$userAuth.role}</span></div>
					<div class="row"><span class="rl">Region</span><span class="rv">{$userAuth.region?.name||$userAuth.villageDisplayName||'—'}</span></div>
					<div class="row"><span class="rl">Auth</span><span class="rv cap">{$userAuth.authMethod}</span></div>
					<div class="row secret-row"><span class="rl">Village Key</span><span class="rv">{T('villageKeySent')}</span></div>
				</div>
				<div class="field" style="margin-top:14px">
					<label class="fl">Language</label>
					<select bind:value={editLang} class="fsel">
						{#each LANGUAGES as l}<option value={l.code}>{l.native} — {l.label}</option>{/each}
					</select>
				</div>
				{#if settingsSaved}<p class="saved">✓ Saved</p>{/if}
				<button class="btn-p" style="margin-top:10px" onclick={saveSettings}>{T("saveChanges")}</button>

			{:else if settingsTab === 'security'}
				<div class="rows">
					<div class="row"><span class="rl">Session expires</span><span class="rv">{$userAuth.sessionExpiry ? new Date($userAuth.sessionExpiry).toLocaleDateString('en-NG') : '—'}</span></div>
					<div class="row"><span class="rl">Auth method</span><span class="rv cap">{$userAuth.authMethod}</span></div>
					<div class="row"><span class="rl">Encryption</span><span class="rv">HMAC-SHA256</span></div>
				</div>
				{#if !showLogoutConfirm}
					<button class="btn-danger" style="margin-top:14px" onclick={() => showLogoutConfirm=true}>{T("logOut")}</button>
				{:else}
					<div class="confirm">
						<p>{T("confirmLogout")}</p>
						<div style="display:flex;gap:8px;margin-top:8px">
							<button class="btn-danger" onclick={doLogout}>{T("yesLogout")}</button>
							<button class="btn-g" onclick={() => showLogoutConfirm=false}>{T("cancel")}</button>
						</div>
					</div>
				{/if}

			{:else if settingsTab === 'notifs'}
				<div class="rows">
					<div class="row"><span class="rl">SOS alerts</span><span class="rv green">Always on</span></div>
					<div class="row"><span class="rl">Mesh messages</span><span class="rv green">Always on</span></div>
					<div class="row"><span class="rl">GPS</span><span class="rv">{locGranted?'✅ Active':'❌ Denied'}</span></div>
					<div class="row"><span class="rl">Bluetooth</span><span class="rv">{meshCaps.ble?'✅ BLE':'❌ BLE'} · {meshCaps.webrtc?'✅ WebRTC':'❌ WebRTC'}</span></div>
				</div>

			{:else if settingsTab === 'about'}
				<div class="about-hd">
					<svg width="36" height="36" viewBox="0 0 28 28" fill="none">
						<circle cx="14" cy="14" r="3" fill="#29b6f6"/>
						<circle cx="14" cy="14" r="7.5" stroke="#29b6f6" stroke-width="1.5" fill="none"/>
						<circle cx="14" cy="14" r="12" stroke="#29b6f6" stroke-width=".7" fill="none" opacity=".3"/>
					</svg>
					<div><p class="an">P.I.N.G.</p><p class="af">Protection In Nigeria</p></div>
				</div>
				<p class="adesc">Community safety mesh network for Nigeria. Works offline via Bluetooth. Groups you with nearby people automatically.</p>
				<div class="rows">
					<div class="row"><span class="rl">Version</span><span class="rv">v6.0.0</span></div>
					<div class="row"><span class="rl">Website</span><span class="rv"><a href="https://ping.com.ng" target="_blank" rel="noopener" style="color:#29b6f6">ping.com.ng</a></span></div>
					<div class="row"><span class="rl">Emergency (Police)</span><span class="rv"><a href="tel:199" style="color:#ff2d2d;font-weight:700">Call 199</a></span></div>
					<div class="row"><span class="rl">Emergency (GSM)</span><span class="rv"><a href="tel:112" style="color:#ff2d2d;font-weight:700">Call 112</a></span></div>
				</div>
			{/if}
		{/if}
	</main>
</div>

<style>
.app{display:flex;flex-direction:column;height:100%;max-width:480px;margin:0 auto;background:#080b0f;}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:.65rem 1rem;background:#0d1117;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;}
.brand{display:flex;align-items:center;gap:.55rem;}
.bname{font-size:.82rem;font-weight:800;letter-spacing:.2em;color:#29b6f6;display:block;}
.bsub{font-size:.46rem;color:#3f5166;letter-spacing:.06em;display:block;margin-top:1px;}
.top-right{display:flex;align-items:center;gap:.6rem;}
.dots{display:flex;gap:4px;}
.dot{width:7px;height:7px;border-radius:50%;background:#1a2332;transition:background .3s;}
.dot.on{background:#00e676;box-shadow:0 0 6px #00e676;}
.dot.blue.on{background:#29b6f6;box-shadow:0 0 6px #29b6f6;}
.usr{font-size:.6rem;color:#3f5166;font-family:monospace;}

/* SOS */
.sos-zone{display:flex;justify-content:center;padding:1.2rem 0 .8rem;flex-shrink:0;}
.sos{width:116px;height:116px;border-radius:50%;background:radial-gradient(circle,#c0392b,#96281b);border:3px solid rgba(255,45,45,.3);color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;transition:all .15s;-webkit-tap-highlight-color:transparent;box-shadow:0 0 20px rgba(192,57,43,.25);}
.sos:active{box-shadow:0 0 0 16px rgba(192,57,43,.15),0 0 0 32px rgba(192,57,43,.06);transform:scale(1.05);}
.sos.fired{background:radial-gradient(circle,#e67e22,#d35400);animation:pulse 1s infinite;cursor:not-allowed;}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(230,126,34,.5)}50%{box-shadow:0 0 0 20px rgba(230,126,34,.1)}}
.sos-t{font-size:1.35rem;font-weight:900;letter-spacing:.08em;}
.sos-s{font-size:.52rem;opacity:.7;letter-spacing:.05em;}

/* Tabbar */
.tabbar{display:flex;background:#0d1117;border-top:1px solid rgba(255,255,255,.05);flex-shrink:0;}
.tb{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:.4rem .1rem;background:none;border:none;color:#3f5166;cursor:pointer;transition:color .15s;position:relative;-webkit-tap-highlight-color:transparent;}
.tb-icon{font-size:1rem;}
.tb-lbl{font-size:.5rem;letter-spacing:.04em;text-transform:uppercase;}
.tb.on{color:#29b6f6;}
.badge{position:absolute;top:4px;right:calc(50% - 18px);background:#ff2d2d;color:#fff;font-size:.45rem;font-weight:700;padding:1px 4px;border-radius:6px;min-width:14px;text-align:center;}

/* Content */
.content{flex:1;overflow-y:auto;padding:.9rem;-webkit-overflow-scrolling:touch;}
.sec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.8rem;}
.sec-head h3{font-size:.72rem;font-weight:700;color:#e8edf3;letter-spacing:.12em;text-transform:uppercase;margin:0;}
.ghost{background:none;border:none;color:#3f5166;font-size:.68rem;cursor:pointer;}
.chip{font-size:.58rem;background:#111822;color:#29b6f6;padding:2px 7px;border-radius:8px;border:1px solid rgba(41,182,246,.2);}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;padding:2.5rem 1rem;text-align:center;}
.empty-icon{font-size:2.4rem;}
.empty p{font-size:.8rem;color:#3f5166;line-height:1.5;}

/* Alert cards */
.card{background:#0d1117;border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:.85rem;margin-bottom:.6rem;}
.card.sos{border-color:rgba(255,45,45,.35);background:rgba(255,45,45,.04);}
.card.unread{border-left:3px solid #29b6f6;}
.card-top{display:flex;justify-content:space-between;margin-bottom:.3rem;}
.tag{font-size:.58rem;font-weight:700;letter-spacing:.1em;background:rgba(255,255,255,.07);color:#7a8fa8;padding:2px 7px;border-radius:5px;}
.tag.red{background:rgba(255,45,45,.15);color:#ff2d2d;}
.ts{font-size:.62rem;color:#3f5166;}
.afrom{font-size:.7rem;font-weight:600;color:#29b6f6;margin:.2rem 0 .1rem;}
.amsg{font-size:.82rem;color:#e8edf3;margin:0;}
.aloc{font-size:.62rem;color:#7a8fa8;margin:.3rem 0 0;}

/* Location */
.coord-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:.6rem;}
.span2{grid-column:span 2;}
.cg{background:#0d1117;border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:.6rem .75rem;display:flex;flex-direction:column;gap:3px;}
.cg-l{font-size:.52rem;color:#3f5166;letter-spacing:.1em;font-weight:700;}
.cg-v{font-size:.85rem;font-weight:600;color:#e8edf3;font-family:monospace;}
.cg-v.sm{font-size:.75rem;}
.cg-r{font-size:.6rem;color:#7a8fa8;font-family:monospace;}
.upd{font-size:.6rem;color:#3f5166;text-align:right;margin:.3rem 0 .5rem;}
.map-wrap{border-radius:12px;overflow:hidden;}
.osm{display:block;font-size:.62rem;color:#3f5166;text-align:right;padding:.3rem 0;text-decoration:none;}

/* Chat */
.chat-wrap{min-height:180px;max-height:calc(100dvh - 360px);overflow-y:auto;display:flex;flex-direction:column;gap:.45rem;padding:.2rem 0;}
.bubble{display:flex;flex-direction:column;max-width:80%;gap:2px;}
.bubble.mine{align-self:flex-end;align-items:flex-end;}
.bfrom{font-size:.58rem;color:#7a8fa8;padding-left:4px;}
.bmsg{background:#111822;border-radius:11px;padding:.5rem .8rem;font-size:.83rem;color:#e8edf3;border:1px solid rgba(255,255,255,.05);}
.bubble.mine .bmsg{background:#0057b8;border-color:transparent;}
.bts{font-size:.56rem;color:#3f5166;padding:0 4px;}
.chat-in{display:flex;gap:.5rem;padding-top:.8rem;flex-shrink:0;}
.chat-in input{flex:1;background:#111822;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:.6rem .85rem;font-size:.85rem;color:#e8edf3;outline:none;}
.chat-in input:focus{border-color:rgba(41,182,246,.35);}
.chat-in button{background:#0057b8;border:none;border-radius:10px;padding:.6rem 1rem;color:#fff;font-size:1rem;font-weight:700;cursor:pointer;}
.chat-in button:disabled{opacity:.35;cursor:not-allowed;}

/* Mesh */
.mesh-card{background:#0d1117;border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:.85rem;margin-bottom:.75rem;}
.mr{display:flex;justify-content:space-between;padding:.28rem 0;border-bottom:1px solid rgba(255,255,255,.04);}
.mr:last-child{border-bottom:none;}
.ml{font-size:.68rem;color:#7a8fa8;}
.mv{font-size:.75rem;font-weight:600;color:#e8edf3;}
.mv.g{color:#00e676;} .mv.a{color:#f5a623;} .mv.r{color:#ff2d2d;}
.info{background:#0d1117;border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:.75rem;}
.info.warn{border-color:rgba(245,166,35,.3);background:rgba(245,166,35,.04);}
.info.warn p{color:#f5a623;font-size:.75rem;line-height:1.5;}
.err-sm{font-size:.72rem;color:#ff2d2d;margin:.4rem 0;}
.peers{margin-top:.75rem;}
.peers-t{font-size:.58rem;color:#3f5166;letter-spacing:.1em;text-transform:uppercase;margin:0 0 .4rem;}
.peer{display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:#e8edf3;padding:.25rem 0;}
.pdot{width:6px;height:6px;border-radius:50%;background:#00e676;flex-shrink:0;}
.ptag{font-size:.58rem;color:#3f5166;background:#111;border-radius:4px;padding:1px 5px;margin-left:auto;}
.mlog{margin-top:.75rem;background:#050709;border-radius:10px;padding:.65rem;max-height:180px;overflow-y:auto;}
.lrow{display:flex;gap:.4rem;align-items:baseline;font-size:.62rem;padding:.18rem 0;border-bottom:1px solid rgba(255,255,255,.025);}
.ltype{font-weight:700;color:#7a8fa8;min-width:2.5rem;flex-shrink:0;}
.ltype.rs{color:#ff2d2d;}
.lfrom{color:#29b6f6;min-width:3rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lmsg{color:#7a8fa8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lts{color:#3f5166;flex-shrink:0;}
.caps-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:.75rem;}
.cap{font-size:.65rem;padding:3px 9px;border-radius:20px;background:#111;border:1px solid rgba(255,255,255,.08);color:#3f5166;}
.cap.on{color:#00e676;border-color:rgba(0,230,118,.25);background:rgba(0,230,118,.06);}
.mesh-btns{display:flex;flex-direction:column;gap:8px;margin-bottom:.75rem;}

/* Settings */
.stabs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;}
.stab{background:#111822;border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:.38rem .7rem;font-size:.68rem;color:#7a8fa8;cursor:pointer;transition:all .15s;}
.stab.on{background:#1a2332;color:#29b6f6;border-color:rgba(41,182,246,.25);}
.rows{display:flex;flex-direction:column;gap:.35rem;}
.row{display:flex;justify-content:space-between;align-items:center;background:#0d1117;border-radius:8px;padding:.52rem .8rem;font-size:.76rem;border:1px solid rgba(255,255,255,.05);}
.secret-row{border-color:rgba(41,182,246,.15);}
.rl{color:#7a8fa8;flex-shrink:0;}
.rv{color:#e8edf3;font-weight:500;text-align:right;max-width:58%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.rv.mono{font-family:monospace;}
.rv.cap{text-transform:capitalize;}
.rv.green{color:#00e676;}
.field{display:flex;flex-direction:column;gap:.28rem;}
.fl{font-size:.6rem;color:#7a8fa8;text-transform:uppercase;letter-spacing:.08em;}
.fsel{background:#111822;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:.62rem .85rem;font-size:.85rem;color:#e8edf3;outline:none;width:100%;-webkit-appearance:none;}
.saved{font-size:.72rem;color:#00e676;margin:.3rem 0;}
.confirm{background:#111822;border-radius:10px;padding:.85rem;border:1px solid rgba(255,45,45,.25);}
.confirm p{font-size:.8rem;color:#e8edf3;margin:0;}
.spin{width:22px;height:22px;border:2px solid #111822;border-top-color:#29b6f6;border-radius:50%;animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
.about-hd{display:flex;align-items:center;gap:.8rem;margin-bottom:.6rem;}
.an{font-size:1rem;font-weight:800;color:#29b6f6;letter-spacing:.2em;margin:0;}
.af{font-size:.58rem;color:#7a8fa8;margin:3px 0 0;}
.adesc{font-size:.76rem;color:#7a8fa8;line-height:1.6;margin:.4rem 0 .8rem;}

/* Buttons */
.btn-p{width:100%;background:#0057b8;color:#fff;border:none;border-radius:11px;padding:.8rem;font-size:.88rem;font-weight:600;cursor:pointer;transition:background .15s,transform .08s;}
.btn-p:active:not(:disabled){transform:scale(.98);background:#00409e;}
.btn-p:disabled{opacity:.4;cursor:not-allowed;}
.btn-g{background:none;border:1px solid rgba(255,255,255,.1);color:#7a8fa8;border-radius:9px;padding:.58rem .9rem;font-size:.78rem;cursor:pointer;}
.btn-danger{background:#c0392b;color:#fff;border:none;border-radius:10px;padding:.68rem 1.2rem;font-size:.82rem;font-weight:600;cursor:pointer;}
</style>
