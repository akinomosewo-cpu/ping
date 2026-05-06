# P.I.N.G. v17 — Protection In Nigeria

Community safety mesh network. Works offline via Bluetooth + WebRTC.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main app — self-contained single file |
| `sw.js` | Service worker for offline PWA caching |
| `static/manifest.json` | PWA manifest (icons, name, theme) |
| `static/icon-192.png` | App icon 192×192 |
| `static/icon-512.png` | App icon 512×512 |

## Deploy

### Vercel / Netlify
Drop folder — deploys as-is, no build step.

### GitHub Pages
Push to repo root, enable Pages.

### Local
```bash
npx serve .
# or
python3 -m http.server 8080
```

> Must be served over HTTPS (or localhost) for GPS, BLE, and Service Worker to work.

## Emergency contacts
- Police: **199**
- GSM Emergency: **112**
