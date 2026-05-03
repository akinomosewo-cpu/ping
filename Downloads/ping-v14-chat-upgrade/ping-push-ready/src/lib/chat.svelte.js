// src/lib/chat.svelte.js — P.I.N.G. Chat v5
// Transport stack (automatic, best available):
//   1. Supabase DB + Realtime  — persistent, cross-device, survives refresh
//   2. BroadcastChannel        — same device, cross-tab, instant (always on)
//   3. localStorage event      — same device, cross-tab, fallback for old browsers
//   4. Bluetooth relay         — cross-device over BLE mesh when connected

import { supabase, isSupabaseReady } from './supabase.js';

const STORE_KEY = 'ping_chat_v3';
const BC_PREFIX  = 'ping-chat';
const MAX_MSGS   = 150;
const HISTORY_LIMIT = 60;

// ── State ──────────────────────────────────────────────────────────
export const chatState = $state({
	messages:     [],
	onlineCount:  0,
	typingUsers:  [],
	transport:    'none',
	connected:    false,
	error:        '',
	loading:      false,
});

// ── Private ────────────────────────────────────────────────────────
let realtimeChannel = null;
let broadcastCh     = null;
let currentVillage  = null;
let currentUser     = null;
let currentUserId   = null;
let typingTimer     = null;
let bleRelay        = null;

// ── Public API ─────────────────────────────────────────────────────

export async function initChat({ villageId, username, userId }) {
	currentVillage = villageId;
	currentUser    = username;
	currentUserId  = userId ?? null;
	chatState.error   = '';
	chatState.loading = true;

	openBroadcastChannel(villageId);
	listenStorageEvent(villageId);

	if (isSupabaseReady && supabase) {
		await loadHistoryFromDB(villageId);
		await connectSupabase(villageId, username);
	} else {
		loadHistoryFromStorage(villageId);
		chatState.transport = broadcastCh ? 'broadcast' : 'storage';
	}

	chatState.loading = false;
}

export function setBLERelay(fn) {
	bleRelay = fn;
	if (chatState.transport !== 'supabase') chatState.transport = 'bluetooth';
}

export function clearBLERelay() {
	bleRelay = null;
	if (chatState.transport === 'bluetooth') {
		chatState.transport = broadcastCh ? 'broadcast' : 'storage';
	}
}

export function receiveBLEMessage(pkt) {
	if (!pkt?.msg || pkt.from === currentUser) return;
	push({ id: `ble-${Date.now()}`, from: pkt.from ?? 'Mesh', msg: pkt.msg, ts: pkt.ts ?? Date.now(), self: false, status: 'delivered' });
}

export async function sendMessage(text) {
	const msg = text.trim();
	if (!msg || !currentUser) return;

	const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
	const ts = Date.now();

	push({ id: localId, from: currentUser, msg, ts, self: true, status: 'sending' });
	stopTyping();

	if (isSupabaseReady && supabase && currentVillage) {
		try {
			const { data, error } = await supabase
				.from('ping_messages')
				.insert({
					village_id: currentVillage,
					user_id:    currentUserId ?? undefined,
					username:   currentUser,
					message:    msg,
					type:       'MSG',
				})
				.select('id, created_at')
				.single();

			if (!error && data) {
				syncId(localId, data.id, new Date(data.created_at).getTime(), 'delivered');
				broadcastLocal({ id: data.id, from: currentUser, msg, ts: new Date(data.created_at).getTime(), self: false });
			} else {
				syncStatus(localId, 'offline');
				persistToStorage();
			}
		} catch {
			syncStatus(localId, 'offline');
			persistToStorage();
		}
		return;
	}

	syncStatus(localId, 'offline');
	broadcastLocal({ id: localId, from: currentUser, msg, ts, self: false });
	flashStorage({ id: localId, from: currentUser, msg, ts, self: false });
	persistToStorage();

	if (bleRelay) {
		try { await bleRelay({ username: currentUser, message: msg }); } catch { }
	}
}

export function startTyping() {
	if (!realtimeChannel) return;
	clearTimeout(typingTimer);
	realtimeChannel.send({ type: 'broadcast', event: 'typing', payload: { user: currentUser, typing: true } }).catch(() => {});
	typingTimer = setTimeout(stopTyping, 3000);
}

export function stopTyping() {
	clearTimeout(typingTimer);
	if (!realtimeChannel) return;
	realtimeChannel.send({ type: 'broadcast', event: 'typing', payload: { user: currentUser, typing: false } }).catch(() => {});
}

export function destroyChat() {
	stopTyping();
	try { realtimeChannel?.unsubscribe(); } catch { }
	try { broadcastCh?.close(); } catch { }
	realtimeChannel = null;
	broadcastCh     = null;
}

// ── Supabase DB history ────────────────────────────────────────────

async function loadHistoryFromDB(villageId) {
	if (!supabase) return;
	try {
		const { data, error } = await supabase
			.from('ping_messages')
			.select('id, username, message, created_at, type')
			.eq('village_id', villageId)
			.eq('type', 'MSG')
			.order('created_at', { ascending: false })
			.limit(HISTORY_LIMIT);

		if (error || !data) return;

		const msgs = data.reverse().map(row => ({
			id:     row.id,
			from:   row.username,
			msg:    row.message,
			ts:     new Date(row.created_at).getTime(),
			self:   row.username === currentUser,
			status: 'delivered',
		}));

		for (const m of msgs) push(m);
	} catch (e) {
		console.warn('[Chat] loadHistoryFromDB:', e.message);
	}
}

// ── Supabase Realtime ──────────────────────────────────────────────

async function connectSupabase(villageId, username) {
	if (!supabase) return;

	realtimeChannel = supabase.channel(`ping-village-${villageId}`, {
		config: { broadcast: { self: false }, presence: { key: username } }
	});

	realtimeChannel
		.on('postgres_changes', {
			event:  'INSERT',
			schema: 'public',
			table:  'ping_messages',
			filter: `village_id=eq.${villageId}`,
		}, (payload) => {
			const row = payload.new;
			if (!row?.id) return;
			if (row.username === currentUser) return;
			if (chatState.messages.find(m => m.id === row.id)) return;
			push({
				id:     row.id,
				from:   row.username,
				msg:    row.message,
				ts:     new Date(row.created_at).getTime(),
				self:   false,
				status: 'delivered',
			});
		})
		.on('broadcast', { event: 'typing' }, ({ payload }) => {
			if (payload.user === currentUser) return;
			if (payload.typing) {
				if (!chatState.typingUsers.includes(payload.user)) {
					chatState.typingUsers = [...chatState.typingUsers, payload.user];
				}
			} else {
				chatState.typingUsers = chatState.typingUsers.filter(u => u !== payload.user);
			}
			setTimeout(() => {
				chatState.typingUsers = chatState.typingUsers.filter(u => u !== payload.user);
			}, 4000);
		})
		.on('presence', { event: 'sync' }, () => {
			chatState.onlineCount = Object.keys(realtimeChannel.presenceState()).length;
		})
		.on('presence', { event: 'join' }, () => {
			chatState.onlineCount = Object.keys(realtimeChannel.presenceState()).length;
		})
		.on('presence', { event: 'leave' }, () => {
			chatState.onlineCount = Object.keys(realtimeChannel.presenceState()).length;
		});

	realtimeChannel.subscribe(async (status) => {
		if (status === 'SUBSCRIBED') {
			chatState.connected = true;
			chatState.transport = 'supabase';
			chatState.error     = '';
			await realtimeChannel.track({ username, online_at: new Date().toISOString() });
		} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
			chatState.connected = false;
			chatState.transport = broadcastCh ? 'broadcast' : 'storage';
			chatState.error     = 'Cloud sync unavailable — using local fallback.';
		} else if (status === 'CLOSED') {
			chatState.connected = false;
		}
	});
}

// ── BroadcastChannel ───────────────────────────────────────────────

function openBroadcastChannel(villageId) {
	if (typeof BroadcastChannel === 'undefined') return;
	try {
		broadcastCh = new BroadcastChannel(`${BC_PREFIX}-${villageId}`);
		broadcastCh.onmessage = ({ data: pkt }) => {
			if (!pkt?.msg) return;
			if (chatState.messages.find(m => m.id === pkt.id)) return;
			push({ ...pkt, self: false });
		};
		if (!isSupabaseReady) chatState.transport = 'broadcast';
	} catch { }
}

function broadcastLocal(pkt) {
	try { broadcastCh?.postMessage(pkt); } catch { }
}

// ── localStorage sync ──────────────────────────────────────────────

function listenStorageEvent(villageId) {
	if (typeof window === 'undefined') return;
	window.addEventListener('storage', (e) => {
		if (e.key !== `${STORE_KEY}-flash`) return;
		try {
			const pkt = JSON.parse(e.newValue ?? '');
			if (pkt.from === currentUser) return;
			if (pkt.villageId !== villageId) return;
			if (chatState.messages.find(m => m.id === pkt.id)) return;
			push({ ...pkt, self: false });
		} catch { }
	});
	if (!isSupabaseReady && !broadcastCh) chatState.transport = 'storage';
}

function flashStorage(pkt) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(`${STORE_KEY}-flash`, JSON.stringify({ ...pkt, villageId: currentVillage }));
	} catch { }
}

function loadHistoryFromStorage(villageId) {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem(`${STORE_KEY}-${villageId}`);
		if (!raw) return;
		for (const m of JSON.parse(raw).slice(-MAX_MSGS)) push(m);
	} catch {
		try { localStorage.removeItem(`${STORE_KEY}-${villageId}`); } catch { }
	}
}

function persistToStorage() {
	if (typeof localStorage === 'undefined' || !currentVillage) return;
	try {
		localStorage.setItem(
			`${STORE_KEY}-${currentVillage}`,
			JSON.stringify(chatState.messages.slice(-MAX_MSGS).map(m => ({ ...m, self: false })))
		);
	} catch { }
}

// ── Helpers ────────────────────────────────────────────────────────

function push(msg) {
	if (chatState.messages.find(m => m.id === msg.id)) return;
	chatState.messages = [...chatState.messages, msg].sort((a, b) => a.ts - b.ts).slice(-MAX_MSGS);
}

function syncStatus(id, status) {
	chatState.messages = chatState.messages.map(m => m.id === id ? { ...m, status } : m);
}

function syncId(oldId, newId, newTs, status) {
	chatState.messages = chatState.messages.map(m =>
		m.id === oldId ? { ...m, id: newId, ts: newTs ?? m.ts, status } : m
	);
}
