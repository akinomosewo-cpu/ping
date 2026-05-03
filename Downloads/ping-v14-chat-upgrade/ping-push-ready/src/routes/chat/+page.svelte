<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { userAuth, searchUsers } from '$lib/auth.svelte.js';
	import { isSupabaseReady } from '$lib/supabase.js';
	import {
		chatState, initChat, destroyChat,
		sendMessage, startTyping, stopTyping
	} from '$lib/chat.svelte.js';

	let inputEl    = null;
	let logEl      = null;
	let text       = $state('');
	let sending    = $state(false);

	// ── User Search ──────────────────────────────────────────────
	let showSearch    = $state(false);
	let searchQuery   = $state('');
	let searchResults = $state([]);
	let searchLoading = $state(false);
	let searchTimer   = null;

	$effect(() => {
		if (!showSearch) { searchQuery = ''; searchResults = []; }
	});

	async function onSearchInput() {
		clearTimeout(searchTimer);
		const q = searchQuery.trim();
		if (!q) { searchResults = []; return; }
		searchTimer = setTimeout(async () => {
			searchLoading = true;
			searchResults = await searchUsers(q);
			searchLoading = false;
		}, 320);
	}

	function mentionUser(username) {
		text = text + '@' + username + ' ';
		showSearch = false;
		inputEl?.focus();
	}

	onMount(async () => {
		if (!$userAuth.isVerified) { goto('/'); return; }
		const uname = $userAuth.username || ($userAuth.firstName + ' ' + $userAuth.lastName).trim() || 'User';
		await initChat({
			villageId: $userAuth.villageId ?? 'default',
			username:  uname,
			userId:    $userAuth.userId ?? null,
		});
		await tick();
		scrollBottom('instant');
	});

	onDestroy(destroyChat);

	$effect(() => {
		if (chatState.messages.length) tick().then(() => scrollBottom('smooth'));
	});

	function scrollBottom(behavior = 'smooth') {
		logEl?.scrollTo({ top: logEl.scrollHeight, behavior });
	}

	async function submit() {
		const msg = text.trim();
		if (!msg || sending) return;
		sending = true;
		text = '';
		await sendMessage(msg);
		sending = false;
		inputEl?.focus();
	}

	function onKey(e) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); return; }
		startTyping();
	}

	function fmt(ts) {
		return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function fmtDate(ts) {
		return new Date(ts).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
	}

	const groups = $derived(() => {
		const out = [];
		for (const m of chatState.messages) {
			const last = out[out.length - 1];
			if (last && last.from === m.from && m.ts - last.msgs[last.msgs.length-1].ts < 90000) {
				last.msgs.push(m);
			} else {
				out.push({ from: m.from, self: m.self, msgs: [m] });
			}
		}
		return out;
	});

	// Date dividers: show date when day changes
	const dayGroups = $derived(() => {
		const sections = [];
		let lastDay = null;
		for (const g of groups()) {
			const day = new Date(g.msgs[0].ts).toDateString();
			if (day !== lastDay) {
				sections.push({ type: 'divider', label: fmtDate(g.msgs[0].ts) });
				lastDay = day;
			}
			sections.push({ type: 'group', ...g });
		}
		return sections;
	});

	const transportLabel = $derived(() => ({
		supabase:  { icon: '🌐', text: 'Live',    cls: 'live'    },
		bluetooth: { icon: '📡', text: 'BLE',     cls: 'ble'     },
		broadcast: { icon: '📶', text: 'Local',   cls: 'local'   },
		storage:   { icon: '💾', text: 'Offline', cls: 'offline' },
		none:      { icon: '⏳', text: '…',       cls: 'none'    },
	}[chatState.transport] ?? { icon: '⏳', text: '…', cls: 'none' }));

	function statusIcon(status) {
		if (status === 'delivered') return '✓✓';
		if (status === 'offline')   return '💾';
		if (status === 'sending')   return '⏳';
		return '✓';
	}
</script>

<svelte:head><title>P.I.N.G. – Chat</title></svelte:head>

<div class="page">

	<!-- Top bar -->
	<header class="topbar">
		<button class="back" onclick={() => goto('/dashboard')} aria-label="Back">
			<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
				<path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
			</svg>
		</button>

		<div class="head-mid">
			<span class="head-title">Community Chat</span>
			<span class="head-village">
				{$userAuth.villageDisplayName || $userAuth.villageId}
				{#if $userAuth.username}<span class="head-user"> · @{$userAuth.username}</span>{/if}
			</span>
		</div>

		<div class="head-right">
			{#if chatState.onlineCount > 0}
				<span class="online-pill">
					<span class="green-dot"></span>
					{chatState.onlineCount}
				</span>
			{/if}
			<button class="icon-btn" onclick={() => showSearch = !showSearch} aria-label="Search users"
				class:active={showSearch}>
				<svg width="15" height="15" viewBox="0 0 20 20" fill="none">
					<circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.9"/>
					<path d="M13 13l4 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
				</svg>
			</button>
			<span class="transport-pill {transportLabel().cls}">
				{transportLabel().icon} {transportLabel().text}
			</span>
		</div>
	</header>

	<!-- User search panel -->
	{#if showSearch}
		<div class="search-panel">
			<div class="search-row">
				<svg class="search-ico" width="13" height="13" viewBox="0 0 20 20" fill="none">
					<circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.9"/>
					<path d="M13 13l4 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
				</svg>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="search-input"
					bind:value={searchQuery}
					oninput={onSearchInput}
					placeholder="Search by name or @username…"
					autofocus
				/>
				{#if searchQuery}
					<button class="clear-btn" onclick={() => { searchQuery = ''; searchResults = []; }}>✕</button>
				{/if}
			</div>
			{#if searchLoading}
				<div class="search-status">Searching…</div>
			{:else if searchQuery.trim() && searchResults.length === 0}
				<div class="search-status">No users found.</div>
			{:else if searchResults.length > 0}
				<div class="search-results">
					{#each searchResults as u}
						<button class="result-row" onclick={() => mentionUser(u.username)}>
							<div class="result-avatar">{(u.username ?? u.first_name ?? '?')[0].toUpperCase()}</div>
							<div class="result-info">
								<span class="result-name">@{u.username}</span>
								<span class="result-sub">{u.first_name} {u.last_name} · {u.village_name ?? ''}</span>
							</div>
							<span class="result-key">{u.village_key ?? ''}</span>
						</button>
					{/each}
				</div>
			{:else}
				<div class="search-hint">Search for community members to @mention them.</div>
			{/if}
		</div>
	{/if}

	{#if !isSupabaseReady}
		<div class="setup-banner">
			<strong>⚡ Enable cross-device chat:</strong> Add Supabase keys to <code>.env</code>
			<span class="setup-note">· Currently local-tab mode</span>
		</div>
	{/if}

	{#if chatState.error}
		<div class="err-banner">{chatState.error}</div>
	{/if}

	<!-- Message log -->
	<div class="log" bind:this={logEl}>

		{#if chatState.loading}
			<div class="loading-wrap">
				<div class="spinner"></div>
				<span class="loading-txt">Loading messages…</span>
			</div>

		{:else if chatState.messages.length === 0}
			<div class="empty">
				<div class="empty-ico">💬</div>
				<p>No messages yet.</p>
				<p class="empty-sub">You're the first one here — say hello.</p>
			</div>

		{:else}
			{#each dayGroups() as item}
				{#if item.type === 'divider'}
					<div class="date-divider">{item.label}</div>
				{:else}
					<div class="group {item.self ? 'self' : 'other'}">
						{#if !item.self}
							<div class="avatar">{item.from[0]?.toUpperCase()}</div>
						{/if}
						<div class="bubble-col">
							{#if !item.self}
								<span class="sender">@{item.from}</span>
							{/if}
							{#each item.msgs as m, i}
								<div class="bubble {item.self ? 'self' : 'other'} {i === item.msgs.length-1 ? 'last' : ''} {m.status === 'sending' ? 'pending' : ''}">
									<p class="btext">{m.msg}</p>
									{#if i === item.msgs.length - 1}
										<div class="bmeta">
											<span class="btime">{fmt(m.ts)}</span>
											{#if item.self}
												<span class="bstatus" class:delivered={m.status === 'delivered'}>{statusIcon(m.status)}</span>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/each}

			{#if chatState.typingUsers.length > 0}
				<div class="group other">
					<div class="avatar typing-avatar">···</div>
					<div class="bubble-col">
						<span class="sender">{chatState.typingUsers.join(', ')} typing…</span>
						<div class="bubble other typing-bubble">
							<span class="typing-dot"></span>
							<span class="typing-dot"></span>
							<span class="typing-dot"></span>
						</div>
					</div>
				</div>
			{/if}
		{/if}

		<div class="scroll-anchor"></div>
	</div>

	<!-- Composer -->
	<form class="composer" onsubmit={(e) => { e.preventDefault(); submit(); }}>
		<textarea
			bind:this={inputEl}
			bind:value={text}
			onkeydown={onKey}
			onblur={stopTyping}
			placeholder="Message your community…"
			rows="1"
			maxlength="500"
			class="composer-input"
		></textarea>
		<button class="send-btn" type="submit" disabled={!text.trim() || sending} aria-label="Send">
			{#if sending}
				<div class="send-spinner"></div>
			{:else}
				<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
					<path d="M2 10l16-8-8 16V10H2z" fill="currentColor"/>
				</svg>
			{/if}
		</button>
	</form>

</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg-primary);
		overflow: hidden;
	}

	.topbar {
		display: flex;
		align-items: center;
		gap: .6rem;
		padding: .6rem .9rem;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.back {
		background: none; border: none;
		color: var(--text-secondary); cursor: pointer;
		padding: 4px; display: flex; align-items: center;
		border-radius: 6px; flex-shrink: 0;
	}
	.back:hover { background: var(--bg-hover); color: var(--text-primary); }

	.icon-btn {
		background: none; border: none;
		color: var(--text-muted); cursor: pointer;
		padding: 5px; display: flex; align-items: center;
		border-radius: 6px; flex-shrink: 0;
		transition: background .12s, color .12s;
	}
	.icon-btn:hover, .icon-btn.active { background: var(--bg-hover); color: var(--red); }

	.head-mid {
		flex: 1; display: flex; flex-direction: column;
		gap: 1px; min-width: 0;
	}
	.head-title {
		font-family: var(--font-display); font-size: .9rem;
		font-weight: 700; color: var(--text-primary);
	}
	.head-village {
		font-size: .62rem; color: var(--text-muted);
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.head-user { color: var(--red); font-weight: 600; }

	.head-right { display: flex; align-items: center; gap: .4rem; flex-shrink: 0; }

	.online-pill {
		display: flex; align-items: center; gap: 4px;
		font-size: .62rem; color: var(--green);
		background: rgba(0,230,118,.1); border: 1px solid rgba(0,230,118,.2);
		border-radius: 20px; padding: 2px 7px;
	}
	.green-dot {
		width: 5px; height: 5px; border-radius: 50%;
		background: var(--green); animation: blink 1.5s infinite;
	}

	.transport-pill {
		font-size: .58rem; padding: 2px 7px; border-radius: 20px;
		border: 1px solid var(--border); background: var(--bg-card);
		color: var(--text-muted); white-space: nowrap;
	}
	.transport-pill.live    { color: var(--blue);  border-color: rgba(41,182,246,.3); background: rgba(41,182,246,.08); }
	.transport-pill.ble     { color: var(--green); border-color: rgba(0,230,118,.3);  background: rgba(0,230,118,.08); }
	.transport-pill.local   { color: var(--amber); border-color: rgba(245,166,35,.3); background: rgba(245,166,35,.08); }

	/* ── Search panel ── */
	.search-panel {
		flex-shrink: 0;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border);
		padding: .5rem .85rem .65rem;
		max-height: 300px;
		overflow-y: auto;
	}
	.search-row {
		display: flex; align-items: center; gap: .4rem;
		background: var(--bg-card); border: 1px solid var(--border);
		border-radius: 20px; padding: .42rem .9rem;
	}
	.search-ico { color: var(--text-muted); flex-shrink: 0; }
	.search-input {
		flex: 1; background: none; border: none; outline: none;
		color: var(--text-primary); font-family: var(--font-body); font-size: .82rem;
	}
	.search-input::placeholder { color: var(--text-muted); }
	.clear-btn {
		background: none; border: none; color: var(--text-muted);
		cursor: pointer; font-size: .68rem; padding: 0 2px;
	}
	.search-status, .search-hint {
		font-size: .72rem; color: var(--text-muted);
		padding: .5rem .2rem; text-align: center;
	}
	.search-hint { font-style: italic; }
	.search-results { display: flex; flex-direction: column; gap: 2px; margin-top: .4rem; }
	.result-row {
		display: flex; align-items: center; gap: .6rem;
		background: none; border: none; border-radius: 10px;
		padding: .4rem .5rem; cursor: pointer; text-align: left;
		width: 100%; transition: background .1s;
	}
	.result-row:hover { background: var(--bg-hover); }
	.result-avatar {
		width: 30px; height: 30px; border-radius: 50%;
		background: var(--bg-hover); border: 1px solid var(--border);
		display: flex; align-items: center; justify-content: center;
		font-size: .7rem; font-weight: 700; color: var(--text-secondary); flex-shrink: 0;
	}
	.result-info {
		flex: 1; display: flex; flex-direction: column;
		gap: 1px; min-width: 0;
	}
	.result-name { font-size: .8rem; font-weight: 600; color: var(--text-primary); }
	.result-sub {
		font-size: .62rem; color: var(--text-muted);
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.result-key {
		font-size: .6rem; font-family: monospace; color: var(--red);
		background: rgba(255,45,45,.08); border-radius: 4px;
		padding: 1px 5px; flex-shrink: 0;
	}

	/* ── Banners ── */
	.setup-banner {
		background: rgba(41,182,246,.08); border-bottom: 1px solid rgba(41,182,246,.2);
		padding: .55rem 1rem; font-size: .7rem; color: var(--blue); flex-shrink: 0;
	}
	.setup-banner code {
		background: rgba(41,182,246,.15); border-radius: 3px; padding: 1px 4px; font-size: .68rem;
	}
	.setup-note { color: var(--text-muted); margin-left: .3rem; }
	.err-banner {
		background: rgba(255,45,45,.08); border-bottom: 1px solid rgba(255,45,45,.2);
		padding: .45rem 1rem; font-size: .7rem; color: var(--red); flex-shrink: 0;
	}

	/* ── Loading ── */
	.loading-wrap {
		flex: 1; display: flex; flex-direction: column;
		align-items: center; justify-content: center; gap: .75rem;
	}
	.spinner {
		width: 28px; height: 28px; border-radius: 50%;
		border: 2px solid var(--border);
		border-top-color: var(--red);
		animation: spin .7s linear infinite;
	}
	.loading-txt { font-size: .72rem; color: var(--text-muted); }
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── Log ── */
	.log {
		flex: 1; overflow-y: auto; padding: .75rem .85rem 1rem;
		display: flex; flex-direction: column; gap: .15rem; scroll-behavior: smooth;
	}
	.empty {
		flex: 1; display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		text-align: center; gap: .4rem; color: var(--text-muted); padding: 2rem; font-size: .82rem;
	}
	.empty-ico { font-size: 2.5rem; margin-bottom: .25rem; }
	.empty-sub { font-size: .72rem; opacity: .7; }
	.date-divider {
		text-align: center; font-size: .62rem; color: var(--text-muted);
		margin: .5rem 0 .75rem; position: relative;
	}
	.date-divider::before, .date-divider::after {
		content: ''; position: absolute; top: 50%; width: 30%; height: 1px; background: var(--border);
	}
	.date-divider::before { left: 0; }
	.date-divider::after  { right: 0; }
	.group { display: flex; gap: .5rem; margin-bottom: .5rem; align-items: flex-end; }
	.group.self { flex-direction: row-reverse; }
	.avatar {
		width: 28px; height: 28px; border-radius: 50%;
		background: var(--bg-hover); border: 1px solid var(--border);
		font-size: .65rem; font-weight: 700; color: var(--text-secondary);
		display: flex; align-items: center; justify-content: center;
		flex-shrink: 0; font-family: var(--font-display);
	}
	.bubble-col { display: flex; flex-direction: column; gap: 2px; max-width: min(75%, 320px); }
	.group.self .bubble-col { align-items: flex-end; }
	.sender { font-size: .62rem; color: var(--red); font-weight: 600; padding: 0 .4rem; margin-bottom: 1px; }
	.bubble { padding: .5rem .75rem; border-radius: 16px; line-height: 1.5; }
	.bubble.other {
		background: var(--bg-card); border: 1px solid var(--border);
		border-bottom-left-radius: 4px; color: var(--text-primary);
	}
	.bubble.self { background: var(--red); border-bottom-right-radius: 4px; color: #fff; }
	.bubble.pending { opacity: 0.6; }
	.btext { font-size: .83rem; margin: 0; word-break: break-word; white-space: pre-wrap; }
	.bmeta { display: flex; align-items: center; gap: .3rem; justify-content: flex-end; margin-top: 2px; }
	.btime { font-size: .58rem; opacity: .65; }
	.bstatus { font-size: .6rem; opacity: .55; }
	.bstatus.delivered { opacity: .85; }
	.typing-avatar { font-size: .7rem; letter-spacing: 1px; }
	.typing-bubble { display: flex; align-items: center; gap: 4px; padding: .55rem .75rem; min-width: 50px; }
	.typing-dot {
		width: 6px; height: 6px; border-radius: 50%;
		background: var(--text-muted); animation: bounce .9s infinite;
	}
	.typing-dot:nth-child(2) { animation-delay: .15s; }
	.typing-dot:nth-child(3) { animation-delay: .30s; }
	@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
	.scroll-anchor { height: 1px; flex-shrink: 0; }

	/* ── Composer ── */
	.composer {
		display: flex; align-items: flex-end; gap: .5rem;
		padding: .65rem .85rem; background: var(--bg-secondary);
		border-top: 1px solid var(--border); flex-shrink: 0;
		padding-bottom: max(.65rem, env(safe-area-inset-bottom));
	}
	.composer-input {
		flex: 1; background: var(--bg-card); border: 1px solid var(--border);
		border-radius: 20px; padding: .6rem 1rem; color: var(--text-primary);
		font-family: var(--font-body); font-size: .85rem; line-height: 1.5;
		outline: none; resize: none; max-height: 120px; overflow-y: auto; transition: border-color .15s;
	}
	.composer-input:focus { border-color: rgba(255,45,45,.35); }
	.composer-input::placeholder { color: var(--text-muted); }
	.send-btn {
		width: 38px; height: 38px; border-radius: 50%; background: var(--red);
		border: none; color: #fff; cursor: pointer; display: flex;
		align-items: center; justify-content: center; flex-shrink: 0;
		box-shadow: 0 0 12px var(--red-glow); transition: background .12s, transform .08s;
	}
	.send-btn:hover:not(:disabled) { background: var(--red-dim); }
	.send-btn:active:not(:disabled) { transform: scale(.92); }
	.send-btn:disabled { opacity: .35; cursor: not-allowed; box-shadow: none; }
	.send-spinner {
		width: 14px; height: 14px; border-radius: 50%;
		border: 2px solid rgba(255,255,255,.3);
		border-top-color: #fff;
		animation: spin .6s linear infinite;
	}

	@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
</style>
