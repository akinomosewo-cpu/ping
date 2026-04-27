<script>
	import { goto } from '$app/navigation';
	import { userAuth, saveAuthToken, validateVillageKey } from '$lib/auth.svelte.js';
	import { onMount } from 'svelte';

	// ─── Calculator state ─────────────────────────────────────────
	let display      = $state('0');
	let expression   = $state('');
	let prevValue    = $state(null);
	let operator     = $state(null);
	let waitingNext  = $state(false);
	let acPressCount = $state(0);
	let acTimer      = null;
	let acFlash      = $state(false);

	// ─── PING login state ─────────────────────────────────────────
	let sheetOpen    = $state(false);
	let sheetStep    = $state(1);   // 1 = form, 2 = trust-device, 3 = success
	let username     = $state('');
	let villageKey   = $state('');
	let role         = $state('resident');
	let loginError   = $state('');
	let loginLoading = $state(false);
	let villageName  = $state('');
	let btSupported  = $state(false);
	let trustDevice  = $state(false);

	onMount(() => {
		if (userAuth.isVerified) { goto('/dashboard'); return; }
		btSupported = typeof navigator !== 'undefined' && !!navigator.bluetooth;
	});

	// ─── Calculator ───────────────────────────────────────────────
	function pressAC() {
		display = '0'; expression = ''; prevValue = null; operator = null; waitingNext = false;
		acFlash = true;
		setTimeout(() => { acFlash = false; }, 160);
		acPressCount += 1;
		clearTimeout(acTimer);
		if (acPressCount >= 3) {
			acPressCount = 0;
			setTimeout(() => { sheetOpen = true; sheetStep = 1; }, 280);
			return;
		}
		acTimer = setTimeout(() => { acPressCount = 0; }, 2000);
	}

	function pressDigit(d) {
		if (waitingNext) { display = String(d); waitingNext = false; }
		else { display = display === '0' ? String(d) : display + d; }
	}

	function pressDot() {
		if (waitingNext) { display = '0.'; waitingNext = false; return; }
		if (!display.includes('.')) display += '.';
	}

	function pressOp(op) {
		const cur = parseFloat(display);
		if (prevValue !== null && !waitingNext) {
			const r = calc(prevValue, cur, operator);
			display = fmt(r); prevValue = r;
		} else { prevValue = cur; }
		operator = op; waitingNext = true; expression = `${display} ${op}`;
	}

	function pressEquals() {
		if (!operator || prevValue === null) return;
		const cur = parseFloat(display);
		const r   = calc(prevValue, cur, operator);
		expression = `${prevValue} ${operator} ${cur} =`;
		display = fmt(r); prevValue = null; operator = null; waitingNext = true;
	}

	function pressPM()  { display = String(parseFloat(display) * -1); }
	function pressPct() { display = String(parseFloat(display) / 100); }
	function pressBack() {
		if (display.length > 1) display = display.slice(0, -1);
		else display = '0';
	}

	function calc(a, b, op) {
		if (op === '+') return a + b;
		if (op === '−') return a - b;
		if (op === '×') return a * b;
		if (op === '÷') return b !== 0 ? a / b : 0;
		return b;
	}
	function fmt(n) {
		if (!isFinite(n)) return 'Error';
		return String(parseFloat(n.toPrecision(10)));
	}

	// ─── PING Login ───────────────────────────────────────────────
	async function submitForm() {
		loginError = '';
		if (!username.trim())   { loginError = 'Please enter your name.'; return; }
		if (!villageKey.trim()) { loginError = 'Enter the Village Key from your admin.'; return; }
		loginLoading = true;
		await new Promise(r => setTimeout(r, 650));
		const res = validateVillageKey(villageKey.trim());
		if (!res.valid) { loginError = 'Invalid Village Key.'; loginLoading = false; return; }
		villageName  = res.villageName;
		loginLoading = false;
		sheetStep    = 2;  // go to "trust this device?"
	}

	async function alwaysTrust() {
		trustDevice = true;
		saveAuthToken({ username: username.trim(), role, villageId: villageName, villageKey: villageKey.trim().toUpperCase() });
		sheetStep = 3;
		await new Promise(r => setTimeout(r, 1500));
		goto('/dashboard');
	}

	async function trustOnce() {
		saveAuthToken({ username: username.trim(), role, villageId: villageName, villageKey: villageKey.trim().toUpperCase() });
		sheetStep = 3;
		await new Promise(r => setTimeout(r, 1500));
		goto('/dashboard');
	}

	function closeSheet() {
		sheetOpen = false;
		setTimeout(() => { sheetStep = 1; loginError = ''; username = ''; villageKey = ''; }, 350);
	}
</script>

<svelte:head>
	<title>Calculator</title>
</svelte:head>

<!-- ═══ CALCULATOR (Image 1 style) ════════════════════════════════ -->
<main class="calc-bg">
	<div class="calc">

		<!-- Display -->
		<div class="display">
			<span class="expr-line">{expression}</span>
			<div class="value-row">
				<span class="value" class:shrink={display.length > 9}>{display}</span>
				<button class="back-btn" onclick={pressBack} aria-label="Backspace">
					<svg width="22" height="16" viewBox="0 0 22 16" fill="none">
						<path d="M8 1L1 8l7 7M1 8h20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
						<path d="M10 4h8a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-8L7 8l3-4z" fill="currentColor" opacity="0.15"/>
					</svg>
				</button>
			</div>
		</div>

		<!-- Keypad -->
		<div class="keypad">
			<!-- Row 1 -->
			<button class="key fn secret" class:triggered={acFlash} onclick={pressAC} style="grid-column: span 2">AC</button>
			<button class="key fn"       onclick={pressPct}>%</button>
			<button class="key op"       class:active={operator === '÷'} onclick={() => pressOp('÷')}>÷</button>

			<!-- Row 2 -->
			<button class="key num" onclick={() => pressDigit('7')}>7</button>
			<button class="key num" onclick={() => pressDigit('8')}>8</button>
			<button class="key num" onclick={() => pressDigit('9')}>9</button>
			<button class="key op"  class:active={operator === '×'} onclick={() => pressOp('×')}>×</button>

			<!-- Row 3 -->
			<button class="key num" onclick={() => pressDigit('4')}>4</button>
			<button class="key num" onclick={() => pressDigit('5')}>5</button>
			<button class="key num" onclick={() => pressDigit('6')}>6</button>
			<button class="key op"  class:active={operator === '−'} onclick={() => pressOp('−')}>−</button>

			<!-- Row 4 -->
			<button class="key num" onclick={() => pressDigit('1')}>1</button>
			<button class="key num" onclick={() => pressDigit('2')}>2</button>
			<button class="key num" onclick={() => pressDigit('3')}>3</button>
			<button class="key op"  class:active={operator === '+'} onclick={() => pressOp('+')}>+</button>

			<!-- Row 5 -->
			<button class="key num zero" onclick={() => pressDigit('0')}>0</button>
			<button class="key num"     onclick={pressDot}>.</button>
			<button class="key op"      onclick={pressEquals}>=</button>
		</div>

	</div>
</main>

<!-- ═══ PING BOTTOM SHEET ═════════════════════════════════════════ -->
{#if sheetOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="scrim" onclick={closeSheet}></div>

	<div class="sheet" class:up={sheetOpen}>

		<!-- Step 1 – Login form -->
		{#if sheetStep === 1}
			<div class="sheet-top">
				<button class="x-btn" onclick={closeSheet} aria-label="Close">✕</button>
				<div style="width:32px"></div>
			</div>

			<div class="ping-icon-wrap">
				<div class="ping-icon-circle">
					<svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
						<circle cx="16" cy="16" r="3.5" fill="#111"/>
						<circle cx="16" cy="16" r="8"   stroke="#111" stroke-width="2"   fill="none"/>
						<circle cx="16" cy="16" r="14"  stroke="#111" stroke-width="1.2" fill="none" opacity="0.35"/>
					</svg>
				</div>
			</div>

			<div class="sheet-body">
				<h2 class="sheet-title">Join your network</h2>
				<p class="sheet-desc">
					Enter the Village Key provided by your community admin to connect to your local mesh.
				</p>

				<div class="field">
					<input id="f-name" type="text" bind:value={username}
						placeholder="Your name or alias" autocomplete="off" maxlength="30" />
				</div>

				<div class="field">
					<input id="f-key" type="text" bind:value={villageKey}
						placeholder="Village Key (e.g. PING01)"
						autocomplete="off" maxlength="8"
						style="text-transform:uppercase;letter-spacing:0.16em;" />
					<span class="field-hint">Demo keys: PING01 · PING02 · TEST00</span>
				</div>

				<div class="field">
					<select id="f-role" bind:value={role}>
						<option value="resident">Resident</option>
						<option value="vanguard">Community Vanguard</option>
					</select>
				</div>

				{#if loginError}
					<p class="err-msg">⚠ {loginError}</p>
				{/if}
			</div>

			<div class="sheet-footer">
				<button class="btn-primary" onclick={submitForm} disabled={loginLoading}>
					{loginLoading ? 'Verifying…' : 'Continue'}
				</button>
			</div>

		<!-- Step 2 – Trust this device? (Image 2 & 3 style) -->
		{:else if sheetStep === 2}
			<div class="sheet-top">
				<button class="x-btn" onclick={closeSheet} aria-label="Close">✕</button>
				<button class="help-btn" aria-label="Help">?</button>
			</div>

			<div class="trust-icon-wrap">
				<div class="trust-icon-circle">
					<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
						<path d="M14 2L4 6v8c0 5.5 4.3 10.7 10 12 5.7-1.3 10-6.5 10-12V6L14 2z" fill="#111" opacity="0.08"/>
						<path d="M14 2L4 6v8c0 5.5 4.3 10.7 10 12 5.7-1.3 10-6.5 10-12V6L14 2z" stroke="#111" stroke-width="1.8" fill="none"/>
						<path d="M9.5 14l3 3 6-6" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</div>
			</div>

			<div class="sheet-body">
				<h2 class="sheet-title">Trust this device?</h2>
				<p class="sheet-desc">
					We won't ask for your Village Key again on this device.
					Only select "Always trust" if this phone is yours alone — do not select it on a shared device.
				</p>

				<div class="trust-features">
					<div class="trust-row">
						<span class="trust-feat-icon">🔒</span>
						<span>Protects the network from unauthorised access</span>
					</div>
					<div class="trust-row">
						<span class="trust-feat-icon">⚡</span>
						<span>Enables instant offline SOS activation</span>
					</div>
				</div>
			</div>

			<div class="sheet-footer">
				<button class="btn-primary" onclick={alwaysTrust}>Always trust</button>
				<button class="btn-ghost"   onclick={trustOnce}>Trust once</button>
			</div>

		<!-- Step 3 – Success -->
		{:else if sheetStep === 3}
			<div class="trust-icon-wrap" style="margin-top: 3rem;">
				<div class="trust-icon-circle success-circle">
					<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
						<path d="M5 14l6 6L23 8" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</div>
			</div>

			<div class="sheet-body" style="text-align:center;">
				<h2 class="sheet-title">You're in, {username}</h2>
				<p class="sheet-desc">{villageName} — now active on the P.I.N.G. mesh.</p>
				<p class="loading-label">Loading secure dashboard…</p>
			</div>
		{/if}

	</div>
{/if}

<style>
	/* ── Reset ───────────────────────────────────── */
	:global(body) {
		margin: 0;
		background: #f0f0f0;
		font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif;
	}

	/* ── Calculator background ───────────────────── */
	.calc-bg {
		min-height: 100dvh;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		background: #f0f0f0;
		padding-bottom: env(safe-area-inset-bottom, 0);
	}

	.calc {
		width: 100%;
		max-width: 430px;
		padding-bottom: 0.5rem;
	}

	/* ── Display ─────────────────────────────────── */
	.display {
		padding: 1rem 1.4rem 0.6rem;
		min-height: 110px;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 2px;
	}

	.expr-line {
		font-size: 0.95rem;
		font-weight: 400;
		color: #999;
		text-align: right;
		min-height: 1.3em;
		display: block;
	}

	.value-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.value {
		font-size: 3.8rem;
		font-weight: 300;
		color: #111;
		letter-spacing: -0.03em;
		line-height: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.value.shrink { font-size: 2.3rem; }

	.back-btn {
		background: none;
		border: none;
		color: #aaa;
		cursor: pointer;
		padding: 6px;
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}
	.back-btn:active { color: #555; }

	/* ── Keypad ──────────────────────────────────── */
	.keypad {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 10px;
		padding: 0 10px 10px;
	}

	.key {
		height: 74px;
		border: none;
		border-radius: 14px;
		cursor: pointer;
		font-size: 1.55rem;
		font-weight: 400;
		font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: filter 0.08s, transform 0.06s;
		-webkit-user-select: none;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
		letter-spacing: -0.01em;
	}

	.key:active {
		filter: brightness(0.88);
		transform: scale(0.96);
	}

	/* Function keys — light gray */
	.key.fn { background: #d4d4d4; color: #111; }

	/* Operator keys — orange */
	.key.op { background: #f5a623; color: #fff; font-weight: 500; }
	.key.op.active { background: #fff; color: #f5a623; }

	/* Number keys — white card */
	.key.num { background: #fff; color: #111; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }

	/* AC secret flash */
	.key.fn.secret.triggered { background: #ff3b30 !important; color: #fff; }

	/* Zero spans 2 columns, left-aligned */
	.key.zero {
		grid-column: span 2;
		border-radius: 14px;
		justify-content: flex-start;
		padding-left: 24px;
	}

	/* ═══════════════════════════════════════════════
	   BOTTOM SHEET
	═══════════════════════════════════════════════ */
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.45);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		z-index: 200;
	}

	.sheet {
		position: fixed;
		bottom: 0; left: 0; right: 0;
		z-index: 300;
		background: #ffffff !important;
		border-radius: 20px 20px 0 0;
		max-height: 92dvh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		color-scheme: light;
		/* Reset dark global vars */
		--bg-primary: #ffffff;
		--bg-secondary: #f5f5f7;
		--bg-card: #f5f5f7;
		--bg-hover: #ebebf0;
		--text-primary: #111111;
		--text-secondary: #555555;
		--text-muted: #aaaaaa;
		--border: rgba(0,0,0,0.08);
		--font-body: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
		color: #111111;
		/* Slide-up */
		transform: translateY(100%);
		transition: transform 0.36s cubic-bezier(0.32,0.72,0,1);
	}
	.sheet.up { transform: translateY(0); }

	@supports (padding-bottom: env(safe-area-inset-bottom)) {
		.sheet { padding-bottom: env(safe-area-inset-bottom); }
	}

	/* ── Sheet top bar (X + help) ────────────────── */
	.sheet-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px 0;
	}

	.x-btn {
		width: 32px; height: 32px;
		border-radius: 50%;
		background: #eeeeee !important;
		border: none;
		font-size: 0.8rem;
		color: #555555 !important;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
	}
	.x-btn:hover { background: #e0e0e0 !important; }

	.help-btn {
		width: 32px; height: 32px;
		border-radius: 50%;
		background: #f0f0f0;
		border: 1.5px solid #ddd;
		font-size: 0.8rem;
		color: #555;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
	}

	/* ── PING icon (step 1) ──────────────────────── */
	.ping-icon-wrap {
		display: flex;
		justify-content: flex-start;
		padding: 20px 24px 0;
	}

	.ping-icon-circle {
		width: 56px; height: 56px;
		border-radius: 50%;
		background: #f0f0f0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* ── Trust icon (step 2) ─────────────────────── */
	.trust-icon-wrap {
		display: flex;
		justify-content: flex-start;
		padding: 20px 24px 0;
	}

	.trust-icon-circle {
		width: 56px; height: 56px;
		border-radius: 50%;
		background: #f0f0f0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.trust-icon-circle.success-circle {
		background: #111;
	}

	/* ── Sheet content ───────────────────────────── */
	.sheet-body {
		padding: 20px 24px 0;
		flex: 1;
	}

	.sheet-title {
		font-size: 1.7rem;
		font-weight: 700;
		color: #111111 !important;
		margin: 0 0 10px;
		line-height: 1.2;
		letter-spacing: -0.02em;
		font-family: -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif;
	}

	.sheet-desc {
		font-size: 0.9rem;
		color: #555555 !important;
		line-height: 1.6;
		margin: 0 0 20px;
		font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
	}

	/* ── Form fields ─────────────────────────────── */
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
	}

	.field input,
	.field select {
		background: #f5f5f7 !important;
		border: none;
		border-radius: 12px;
		padding: 0.85rem 1rem;
		font-size: 0.95rem;
		color: #111111 !important;
		font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
		width: 100%;
		outline: none;
		transition: background 0.15s;
	}

	.field input:focus,
	.field select:focus {
		background: #e5e5ea !important;
	}

	.field input::placeholder { color: #aaaaaa !important; }
	.field select option { background: #ffffff !important; color: #111111 !important; }

	.field-hint {
		font-size: 0.7rem;
		color: #bbb;
		padding-left: 4px;
	}

	.err-msg {
		font-size: 0.78rem;
		color: #ff3b30;
		margin: -4px 0 8px;
		padding-left: 2px;
	}

	/* ── Trust features list ─────────────────────── */
	.trust-features {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-top: 4px;
	}

	.trust-row {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		font-size: 0.88rem;
		color: #333333 !important;
		line-height: 1.5;
		font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
	}

	.trust-feat-icon {
		width: 36px; height: 36px;
		background: #f5f5f7;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		flex-shrink: 0;
	}

	/* ── Footer buttons ──────────────────────────── */
	.sheet-footer {
		padding: 24px 24px 28px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.btn-primary {
		width: 100%;
		background: #111;
		color: #fff;
		border: none;
		border-radius: 14px;
		padding: 0.95rem;
		font-size: 1rem;
		font-weight: 600;
		font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
		cursor: pointer;
		transition: background 0.15s, transform 0.08s;
		letter-spacing: -0.01em;
	}
	.btn-primary:active:not(:disabled) { transform: scale(0.98); background: #333; }
	.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

	.btn-ghost {
		width: 100%;
		background: none;
		border: none;
		color: #007aff;
		font-size: 0.95rem;
		font-weight: 500;
		font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
		cursor: pointer;
		padding: 0.5rem;
		text-align: center;
		letter-spacing: -0.01em;
	}
	.btn-ghost:hover { opacity: 0.7; }

	/* ── Loading state ───────────────────────────── */
	.loading-label {
		font-size: 0.8rem;
		color: #bbb;
		margin-top: 8px;
		animation: blink 1s infinite;
	}

	@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
</style>
