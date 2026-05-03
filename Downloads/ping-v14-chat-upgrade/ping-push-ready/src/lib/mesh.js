// src/lib/mesh.js — P.I.N.G. Cross-Browser Mesh v1
//
// Transport stack (best available, auto-selected):
//   1. Web Bluetooth GATT  — Chrome/Android only, true wireless mesh
//   2. WebRTC DataChannel  — Chrome, Firefox, Safari — LAN peer-to-peer
//   3. BroadcastChannel    — same device, multiple tabs
//   4. localStorage events — same device, older browsers
//
// Public API:
//   meshInit(username, villageKey, onPacket)  → starts everything
//   meshSend(packet)                          → broadcast on all active transports
//   meshDestroy()                             → clean up
//   meshState                                 → reactive state object (plain JS, not Svelte $state)
//   isBLESupported()                          → boolean
//   isWebRTCSupported()                       → boolean

// ── Browser guards ────────────────────────────────────────────────
const isBrowser = typeof window !== 'undefined';

export function isBLESupported() {
	return isBrowser && !!navigator.bluetooth;
}

export function isWebRTCSupported() {
	return isBrowser && !!(window.RTCPeerConnection);
}

// ── Shared state (plain object — import and use reactively in Svelte) ──
export const meshState = {
	transport:   'none',   // 'ble' | 'webrtc' | 'broadcast' | 'storage' | 'none'
	peers:       [],       // [{ id, name, transport }]
	connected:   false,
	bleStatus:   'offline',// 'offline' | 'connecting' | 'connected' | 'error'
	rtcStatus:   'idle',   // 'idle' | 'signaling' | 'connected' | 'error'
	error:       '',
	log:         [],       // [{ type, msg, ts }]
};

// ── Private ────────────────────────────────────────────────────────
let _onPacket   = null;
let _username   = '';
let _villageKey = '';

// BLE
let _bleDevice = null;
let _bleChar   = null;

// WebRTC
const _rtcPeers = new Map();   // peerId → { pc, dc, name }
let _sigChannel = null;        // BroadcastChannel used for local signaling (same device demo)
//  For real cross-device WebRTC you'd use a Supabase/WebSocket signaling server.
//  Here we use BroadcastChannel as the signal bus — works cross-tab on same device,
//  and Supabase Realtime as the signal bus cross-device (injected below).
let _supabase   = null;
let _sigSub     = null;

// BroadcastChannel
let _bc = null;

const PING_SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
const PING_CHAR_UUID    = '0000ff01-0000-1000-8000-00805f9b34fb';
const enc = new TextEncoder();
const dec = new TextDecoder();

// ── Logging ────────────────────────────────────────────────────────
function _log(type, msg) {
	meshState.log = [{ type, msg, ts: Date.now() }, ...meshState.log.slice(0, 49)];
}

function _updateTransport() {
	if (_bleDevice?.gatt?.connected) { meshState.transport = 'ble'; return; }
	if (_rtcPeers.size > 0) { meshState.transport = 'webrtc'; return; }
	if (_bc) { meshState.transport = 'broadcast'; return; }
	meshState.transport = 'storage';
}

// ── Packet delivery ────────────────────────────────────────────────
function _deliver(pkt) {
	if (!_onPacket) return;
	if (pkt.from === _username) return;                // dedupe self
	_onPacket(pkt);
}

// ── 1. Web Bluetooth ───────────────────────────────────────────────
export async function bleConnect() {
	if (!isBLESupported()) return { ok: false, error: 'Web Bluetooth not supported in this browser. Use Chrome on Android.' };
	meshState.bleStatus = 'connecting';
	meshState.error = '';
	try {
		const device = await navigator.bluetooth.requestDevice({
			acceptAllDevices: true,
			optionalServices: [PING_SERVICE_UUID]
		});
		_bleDevice = device;
		device.addEventListener('gattserverdisconnected', () => {
			meshState.bleStatus = 'offline';
			meshState.connected = false;
			meshState.peers = meshState.peers.filter(p => p.transport !== 'ble');
			_bleChar = null;
			_log('SYS', `${device.name ?? 'BLE peer'} disconnected`);
			_updateTransport();
		});
		const server = await device.gatt.connect();
		try {
			const svc  = await server.getPrimaryService(PING_SERVICE_UUID);
			_bleChar   = await svc.getCharacteristic(PING_CHAR_UUID);
			await _bleChar.startNotifications();
			_bleChar.addEventListener('characteristicvaluechanged', e => {
				try { _deliver(JSON.parse(dec.decode(e.target.value))); } catch { }
			});
		} catch { /* no PING service — presence only */ }

		meshState.bleStatus = 'connected';
		meshState.connected = true;
		meshState.peers = [...meshState.peers, { id: device.id, name: device.name ?? 'BLE peer', transport: 'ble' }];
		_log('SYS', `BLE connected: ${device.name ?? 'peer'}`);
		_updateTransport();
		return { ok: true };
	} catch (e) {
		meshState.bleStatus = 'error';
		meshState.error = e.name === 'NotFoundError' ? 'No device selected.' : e.message;
		return { ok: false, error: meshState.error };
	}
}

export function bleDisconnect() {
	if (_bleDevice?.gatt?.connected) _bleDevice.gatt.disconnect();
	_bleDevice = null; _bleChar = null;
	meshState.bleStatus = 'offline';
	meshState.peers = meshState.peers.filter(p => p.transport !== 'ble');
	_updateTransport();
}

async function _bleSend(pkt) {
	if (!_bleChar) return;
	try {
		const bytes = enc.encode(JSON.stringify(pkt));
		try { await _bleChar.writeValueWithResponse(bytes); }
		catch { await _bleChar.writeValueWithoutResponse(bytes); }
	} catch { /* ignore */ }
}

// ── 2. WebRTC DataChannel ──────────────────────────────────────────
//
// Signaling flow:
//   Initiator: createOffer → send {type:'offer', sdp, from, to:'*'}
//   Responder:  createAnswer → send {type:'answer', sdp, from, to:initiatorId}
//   Both: exchange ICE candidates via {type:'ice', candidate, from, to}
//
// Signal bus: BroadcastChannel (same device) + Supabase Realtime (cross-device).

const _myRtcId = Math.random().toString(36).slice(2, 10); // stable per session

function _rtcConfig() {
	return {
		iceServers: [
			{ urls: 'stun:stun.l.google.com:19302' },
			{ urls: 'stun:stun1.l.google.com:19302' },
		]
	};
}

async function _createPeer(peerId, peerName, initiator) {
	if (_rtcPeers.has(peerId)) return _rtcPeers.get(peerId);

	const pc = new RTCPeerConnection(_rtcConfig());
	const entry = { pc, dc: null, name: peerName ?? peerId };
	_rtcPeers.set(peerId, entry);

	pc.onicecandidate = e => {
		if (e.candidate) _signal({ type: 'ice', candidate: e.candidate, from: _myRtcId, to: peerId });
	};

	pc.onconnectionstatechange = () => {
		if (pc.connectionState === 'connected') {
			meshState.rtcStatus = 'connected';
			meshState.connected = true;
			if (!meshState.peers.find(p => p.id === peerId)) {
				meshState.peers = [...meshState.peers, { id: peerId, name: entry.name, transport: 'webrtc' }];
			}
			_log('SYS', `WebRTC connected: ${entry.name}`);
			_updateTransport();
		} else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
			_rtcPeers.delete(peerId);
			meshState.peers = meshState.peers.filter(p => p.id !== peerId);
			if (_rtcPeers.size === 0) meshState.rtcStatus = 'idle';
			_log('SYS', `WebRTC peer left: ${entry.name}`);
			_updateTransport();
		}
	};

	function _attachDC(dc) {
		entry.dc = dc;
		dc.onopen    = () => _log('SYS', `DataChannel open: ${entry.name}`);
		dc.onmessage = e => { try { _deliver(JSON.parse(e.data)); } catch { } };
		dc.onerror   = () => {};
	}

	if (initiator) {
		const dc = pc.createDataChannel('ping', { ordered: false, maxRetransmits: 2 });
		_attachDC(dc);
		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		_signal({ type: 'offer', sdp: offer, from: _myRtcId, fromName: _username, to: '*' });
	} else {
		pc.ondatachannel = e => _attachDC(e.channel);
	}

	return entry;
}

async function _handleSignal(msg) {
	if (!isWebRTCSupported()) return;
	if (msg.from === _myRtcId) return;              // ignore own signals
	if (msg.to && msg.to !== '*' && msg.to !== _myRtcId) return; // not for us

	if (msg.type === 'offer') {
		meshState.rtcStatus = 'signaling';
		const entry = await _createPeer(msg.from, msg.fromName, false);
		await entry.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
		const answer = await entry.pc.createAnswer();
		await entry.pc.setLocalDescription(answer);
		_signal({ type: 'answer', sdp: answer, from: _myRtcId, fromName: _username, to: msg.from });
	} else if (msg.type === 'answer') {
		const entry = _rtcPeers.get(msg.from);
		if (entry && entry.pc.signalingState !== 'stable') {
			await entry.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
		}
	} else if (msg.type === 'ice') {
		const entry = _rtcPeers.get(msg.from);
		if (entry) try { await entry.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch { }
	} else if (msg.type === 'announce') {
		// A peer announcing presence — initiate WebRTC if we haven't already
		if (!_rtcPeers.has(msg.from) && _myRtcId < msg.from) {
			// Only the "smaller" ID initiates to avoid both sides offering simultaneously
			meshState.rtcStatus = 'signaling';
			await _createPeer(msg.from, msg.fromName, true);
		}
	}
}

function _signal(msg) {
	// Local signaling via BroadcastChannel
	if (_sigChannel) try { _sigChannel.postMessage(msg); } catch { }
	// Cross-device signaling via Supabase Realtime
	if (_supabase && _sigSub) {
		_sigSub.send({ type: 'broadcast', event: 'rtc-signal', payload: msg }).catch(() => {});
	}
}

export async function rtcAnnounce() {
	if (!isWebRTCSupported()) return { ok: false, error: 'WebRTC not supported' };
	_signal({ type: 'announce', from: _myRtcId, fromName: _username, village: _villageKey });
	return { ok: true };
}

export function rtcDisconnect() {
	for (const [, entry] of _rtcPeers) {
		try { entry.dc?.close(); entry.pc?.close(); } catch { }
	}
	_rtcPeers.clear();
	meshState.rtcStatus = 'idle';
	meshState.peers = meshState.peers.filter(p => p.transport !== 'webrtc');
	_updateTransport();
}

async function _rtcSend(pkt) {
	const data = JSON.stringify(pkt);
	for (const [, entry] of _rtcPeers) {
		if (entry.dc?.readyState === 'open') {
			try { entry.dc.send(data); } catch { }
		}
	}
}

// ── 3. BroadcastChannel ────────────────────────────────────────────
function _initBC(villageKey) {
	if (typeof BroadcastChannel === 'undefined') return;
	try {
		_bc = new BroadcastChannel(`ping_mesh_${villageKey}`);
		_bc.onmessage = ({ data }) => {
			if (data?._rtc) { _handleSignal(data); return; }       // routing WebRTC signals
			_deliver(data);
		};
	} catch { }
}

function _bcSend(pkt) {
	if (_bc) try { _bc.postMessage(pkt); } catch { }
}

// Same BroadcastChannel for local WebRTC signaling — wrap in _rtc flag
function _initSigChannel() {
	if (typeof BroadcastChannel === 'undefined') return;
	try {
		_sigChannel = new BroadcastChannel(`ping_rtc_sig_${_villageKey}`);
		_sigChannel.onmessage = ({ data }) => _handleSignal(data);
	} catch { }
}

// ── 4. localStorage flash ──────────────────────────────────────────
function _lsSend(pkt) {
	if (typeof localStorage === 'undefined') return;
	try { localStorage.setItem('ping_mesh_flash', JSON.stringify({ ...pkt, _ts: Date.now() })); } catch { }
}

function _initLS() {
	if (typeof window === 'undefined') return;
	window.addEventListener('storage', e => {
		if (e.key !== 'ping_mesh_flash') return;
		try {
			const pkt = JSON.parse(e.newValue ?? '');
			if (Date.now() - (pkt._ts ?? 0) > 10000) return; // stale
			_deliver(pkt);
		} catch { }
	});
}

// ── 5. Supabase signaling for cross-device WebRTC ─────────────────
async function _initSupabaseSignaling(villageKey) {
	try {
		const { supabase, isSupabaseReady } = await import('./supabase.js');
		if (!isSupabaseReady || !supabase) return;
		_supabase = supabase;
		_sigSub = supabase.channel(`ping-rtc-${villageKey}`);
		_sigSub.on('broadcast', { event: 'rtc-signal' }, ({ payload }) => _handleSignal(payload));
		_sigSub.subscribe();
	} catch { }
}

// ── Main API ───────────────────────────────────────────────────────

/**
 * Initialize the mesh. Call once on component mount.
 * @param {string} username
 * @param {string} villageKey
 * @param {(pkt: object) => void} onPacket  — called for every received packet (not from self)
 */
export async function meshInit(username, villageKey, onPacket) {
	_username   = username;
	_villageKey = villageKey;
	_onPacket   = onPacket;

	_initBC(villageKey);
	_initSigChannel();
	_initLS();
	await _initSupabaseSignaling(villageKey);

	_updateTransport();
	_log('SYS', 'Mesh initialized');
}

/**
 * Send a packet on all active transports.
 * @param {object} pkt
 */
export async function meshSend(pkt) {
	const full = { ...pkt, from: _username, village: _villageKey, ts: pkt.ts ?? Date.now() };
	await _bleSend(full);
	await _rtcSend(full);
	_bcSend(full);
	_lsSend(full);
}

/** Tear down everything — call on component destroy. */
export function meshDestroy() {
	bleDisconnect();
	rtcDisconnect();
	try { _bc?.close(); } catch { }
	try { _sigChannel?.close(); } catch { }
	try { _sigSub?.unsubscribe(); } catch { }
	_bc = null; _sigChannel = null; _sigSub = null; _supabase = null; _onPacket = null;
	meshState.transport = 'none'; meshState.connected = false;
	meshState.peers = []; meshState.log = [];
}

// ── Packet builders (re-exported from old bluetooth.js) ───────────
export function buildSOSPacket(user, location) {
	return {
		type: 'SOS',
		from: user.username ?? user.firstName,
		name: `${user.firstName} ${user.lastName}`,
		lat: location?.lat ?? null,
		lng: location?.lng ?? null,
		msg: '🚨 EMERGENCY — SOS activated',
		ts: Date.now(),
		village: user.villageKey
	};
}

export function buildMsgPacket(user, text) {
	return { type: 'MSG', from: user.username ?? user.firstName, msg: text, ts: Date.now(), village: user.villageKey };
}

export function getCurrentLocation() {
	return new Promise(resolve => {
		if (!isBrowser || !navigator.geolocation) { resolve(null); return; }
		navigator.geolocation.getCurrentPosition(
			p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
			() => resolve(null),
			{ enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
		);
	});
}

export function dialEmergency() {
	if (isBrowser) window.open('tel:199');
}

// ── Capability helpers ────────────────────────────────────────────
export function getMeshCapabilities() {
	return {
		ble:       isBLESupported(),
		webrtc:    isWebRTCSupported(),
		broadcast: typeof BroadcastChannel !== 'undefined',
		storage:   typeof localStorage !== 'undefined',
	};
}
