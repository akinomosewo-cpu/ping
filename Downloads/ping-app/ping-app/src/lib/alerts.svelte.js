// src/lib/alerts.svelte.js
// Manages all incoming and outgoing alerts for P.I.N.G.

/** @typedef {{ id: string, type: 'SOS'|'MSG'|'ALL_CLEAR', from: string, msg: string, lat: number|null, lng: number|null, ts: number, read: boolean }} Alert */

export const alertStore = $state({
	/** @type {Alert[]} */
	alerts: [],
	unreadCount: 0,
	connectedDevice: null,
	meshStatus: 'offline' // 'offline' | 'scanning' | 'connected'
});

/**
 * Add an incoming alert to the store and persist to localStorage.
 * @param {Omit<Alert, 'id'|'read'>} alert
 */
export function addAlert(alert) {
	const newAlert = {
		...alert,
		id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
		read: false
	};
	alertStore.alerts.unshift(newAlert); // newest first
	alertStore.unreadCount += 1;
	persistAlerts();
	// Trigger haptic feedback if available
	if (typeof navigator !== 'undefined' && navigator.vibrate) {
		navigator.vibrate(alert.type === 'SOS' ? [200, 100, 200, 100, 400] : [100]);
	}
}

/** Mark all alerts as read */
export function markAllRead() {
	alertStore.alerts = alertStore.alerts.map((a) => ({ ...a, read: true }));
	alertStore.unreadCount = 0;
	persistAlerts();
}

/** Clear all alerts */
export function clearAlerts() {
	alertStore.alerts = [];
	alertStore.unreadCount = 0;
	if (typeof localStorage !== 'undefined') localStorage.removeItem('ping_alerts');
}

/** Load alerts from localStorage on boot */
export function loadPersistedAlerts() {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem('ping_alerts');
		if (!raw) return;
		const saved = JSON.parse(raw);
		alertStore.alerts = saved;
		alertStore.unreadCount = saved.filter((/** @type {Alert} */ a) => !a.read).length;
	} catch {
		localStorage.removeItem('ping_alerts');
	}
}

function persistAlerts() {
	if (typeof localStorage === 'undefined') return;
	// Keep only the latest 50 alerts to save space
	const trimmed = alertStore.alerts.slice(0, 50);
	localStorage.setItem('ping_alerts', JSON.stringify(trimmed));
}
