# P.I.N.G. — People's Integrated Neighborhood Guard

An **offline-first PWA** with Bluetooth mesh community security alerts.

---

## ✅ Is this a real PWA?

Yes. It includes:
- ✅ `manifest.json` — installable on Android home screen ("Add to Home Screen")
- ✅ Service Worker (`sw.js`) — caches the full app for offline use after first load
- ✅ HTTPS-ready — works on Vercel (required for Bluetooth + SW)
- ✅ App icons (192px + 512px)
- ✅ `display: standalone` — hides browser UI when installed
- ✅ Works offline after first visit (no internet needed for SOS)

---

## 🖥️ Does it work in VS Code?

Yes. Open the folder in VS Code and use the integrated terminal:

```bash
npm install      # first time only
npm run dev      # start dev server → http://localhost:5173
```

**Recommended VS Code extensions:**
- Svelte for VS Code (`svelte.svelte-vscode`)
- ESLint
- Prettier

> PWA features (service worker, install prompt) only activate on **production builds**  
> served over HTTPS. For local testing use `npm run build && npm run preview`.

---

## 🔐 Secret Login (Calculator Disguise)

The app opens as a calculator. To access P.I.N.G.:

**Press `AC` three times quickly** → the login sheet slides up.

**Demo Village Keys:**
| Key    | Community            |
|--------|----------------------|
| PING01 | Zamfara North Sector |
| PING02 | Kaduna East Sector   |
| PING03 | Katsina West Sector  |
| TEST00 | Test Community       |

---

## 🌐 Deploy to Vercel (3 steps)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Click Deploy — Vercel auto-detects SvelteKit

Your app will be live at `https://your-app.vercel.app` with:
- Free HTTPS (required for Bluetooth API + service worker)
- Global CDN (fast load in Nigeria)
- Auto PWA install prompt on Android Chrome

---

## 📁 Project structure

```
ping-app/
├── src/
│   ├── routes/
│   │   ├── +layout.svelte          ← Global styles
│   │   ├── +page.svelte            ← Calculator disguise + PING login
│   │   └── dashboard/+page.svelte  ← Dashboard (SOS, Alerts, Mesh, Chat)
│   └── lib/
│       ├── auth.svelte.js          ← Village Key auth + offline token
│       ├── bluetooth.js            ← Web Bluetooth API
│       └── alerts.svelte.js        ← Alert store (localStorage)
├── static/
│   ├── icon-192.png  ← PWA icon
│   ├── icon-512.png  ← PWA icon
│   ├── manifest.json ← PWA manifest
│   └── favicon.svg
├── vite.config.js    ← PWA plugin config
└── package.json
```

---

## 📱 Bluetooth notes

| Browser              | Bluetooth | Notes                              |
|----------------------|-----------|------------------------------------|
| Chrome on Android    | ✅ Yes    | Full support — recommended         |
| Chrome on Windows    | ✅ Yes    | Good for command center PCs        |
| Safari / iOS Chrome  | ❌ No     | Use **Bluefy** app from App Store  |

---

## ✏️ Customise

**Add a Village Key** — edit `src/lib/auth.svelte.js`:
```js
'NEWKEY': { villageId: 'v005', villageName: 'Your Village' }
```

**Change SOS countdown timer** — edit `src/routes/dashboard/+page.svelte`:
```js
let sosTimer = $state(3); // seconds before SOS fires
```

**Change colours** — edit `:global(:root)` in `src/routes/+layout.svelte`
