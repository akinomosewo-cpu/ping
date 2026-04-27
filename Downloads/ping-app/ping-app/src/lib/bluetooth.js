// src/lib/bluetooth.js
// Handles Web Bluetooth API interactions for P.I.N.G.
// Central ↔ Peripheral model via GATT characteristics.

// Custom BLE Service & Characteristic UUIDs for P.I.N.G.
// These are random UUID-v4 values – keep consistent across all devices.
export const PING_SERVICE_UUID      = '0000ff00-0000-1000-8000-00805f9b34fb';
export const PING_ALERT_CHAR_UUID   = '0000ff01-0000-1000-8000-00805f9b34fb';
export const PING_MESSAGE_CHAR_UUID = '0000ff02-0000-1000-8000-00805f9b34fb';

/**
 * Check if Web Bluetooth is supported by this browser.
 * @returns {boolean}
 */
export function isBluetoothSupported() {
	return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

/**
 * Request a nearby P.I.N.G. device (ESP32 node or relay phone).
 * Returns the connected device or null on failure.
 * @returns {Promise<BluetoothDevice|null>}
 */
export async function requestPingDevice() {
	if (!isBluetoothSupported()) return null;
	try {
		const device = await navigator.bluetooth.requestDevice({
			filters: [{ name: 'P.I.N.G. Node' }],
			optionalServices: [PING_SERVICE_UUID]
		});
		return device;
	} catch (err) {
		if (err.name === 'NotFoundError') return null; // User cancelled
		console.error('[P.I.N.G. BLE] Request failed:', err);
		return null;
	}
}

/**
 * Send an SOS alert packet to a connected BLE device.
 * @param {BluetoothDevice} device
 * @param {{ username: string, lat: number|null, lng: number|null, message: string }} payload
 * @returns {Promise<boolean>} success
 */
export async function sendSOSPacket(device, payload) {
	try {
		const server      = await device.gatt.connect();
		const service     = await server.getPrimaryService(PING_SERVICE_UUID);
		const characteristic = await service.getCharacteristic(PING_ALERT_CHAR_UUID);

		const packet = JSON.stringify({
			type: 'SOS',
			from: payload.username,
			lat: payload.lat,
			lng: payload.lng,
			msg: payload.message,
			ts: Date.now()
		});

		const encoder = new TextEncoder();
		await characteristic.writeValue(encoder.encode(packet));
		return true;
	} catch (err) {
		console.error('[P.I.N.G. BLE] SOS send failed:', err);
		return false;
	}
}

/**
 * Send a text message packet to a connected BLE device.
 * @param {BluetoothDevice} device
 * @param {{ username: string, message: string }} payload
 * @returns {Promise<boolean>} success
 */
export async function sendTextPacket(device, payload) {
	try {
		const server      = await device.gatt.connect();
		const service     = await server.getPrimaryService(PING_SERVICE_UUID);
		const characteristic = await service.getCharacteristic(PING_MESSAGE_CHAR_UUID);

		const packet = JSON.stringify({
			type: 'MSG',
			from: payload.username,
			msg: payload.message,
			ts: Date.now()
		});

		const encoder = new TextEncoder();
		await characteristic.writeValue(encoder.encode(packet));
		return true;
	} catch (err) {
		console.error('[P.I.N.G. BLE] Message send failed:', err);
		return false;
	}
}

/**
 * Get the device's current GPS coordinates.
 * Returns null if permission is denied or unavailable.
 * @returns {Promise<{ lat: number, lng: number }|null>}
 */
export function getCurrentLocation() {
	return new Promise((resolve) => {
		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			resolve(null);
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
			() => resolve(null),
			{ timeout: 5000, maximumAge: 60000 }
		);
	});
}
