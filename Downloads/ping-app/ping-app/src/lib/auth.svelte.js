// src/lib/auth.svelte.js
// Global authentication and user state for P.I.N.G.

export const userAuth = $state({
	isVerified: false,
	role: 'resident', // 'resident' | 'vanguard' | 'admin'
	username: '',
	villageId: null,
	villageKey: ''
});

/**
 * Check if the user has a stored auth token in localStorage.
 * Called on app boot to restore session offline.
 */
export function checkOfflineAuth() {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem('ping_auth_token');
		if (!raw) return;
		const token = JSON.parse(raw);
		if (token && token.isVerified) {
			userAuth.isVerified = token.isVerified;
			userAuth.role = token.role;
			userAuth.username = token.username;
			userAuth.villageId = token.villageId;
			userAuth.villageKey = token.villageKey;
		}
	} catch {
		// Corrupted token – clear it
		localStorage.removeItem('ping_auth_token');
	}
}

/**
 * Save user session to localStorage for offline use.
 * @param {{ username: string, role: string, villageId: string, villageKey: string }} data
 */
export function saveAuthToken(data) {
	userAuth.isVerified = true;
	userAuth.username = data.username;
	userAuth.role = data.role;
	userAuth.villageId = data.villageId;
	userAuth.villageKey = data.villageKey;

	localStorage.setItem(
		'ping_auth_token',
		JSON.stringify({
			isVerified: true,
			role: data.role,
			username: data.username,
			villageId: data.villageId,
			villageKey: data.villageKey
		})
	);
}

/**
 * Log out – clear token and reset state.
 */
export function logout() {
	userAuth.isVerified = false;
	userAuth.role = 'resident';
	userAuth.username = '';
	userAuth.villageId = null;
	userAuth.villageKey = '';
	localStorage.removeItem('ping_auth_token');
}

/**
 * Validate the 6-digit Village Key against known communities.
 * In production this should call a secure backend API.
 * @param {string} key
 * @returns {{ valid: boolean, villageId?: string, villageName?: string }}
 */
export function validateVillageKey(key) {
	// Demo keys – replace with real API call in production
	const DEMO_KEYS = {
		'PING01': { villageId: 'v001', villageName: 'Zamfara North Sector' },
		'PING02': { villageId: 'v002', villageName: 'Kaduna East Sector' },
		'PING03': { villageId: 'v003', villageName: 'Katsina West Sector' },
		'TEST00': { villageId: 'v000', villageName: 'Test Community' }
	};
	const match = DEMO_KEYS[key.toUpperCase()];
	if (match) return { valid: true, ...match };
	return { valid: false };
}
