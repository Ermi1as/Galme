# Bookkeeping Ledger (Galmee) – PWA

## Files
- index.html – the full app
- sw.js – service worker (offline, sync, widget)
- manifest.json – install/PWA settings
- icon-*.png, screenshot-*.png – icons and store screenshots
- widgets/ – Windows widget data
- .well-known/assetlinks.json – only for the Android TWA build (edit first)
- _headers – no-cache rules for Netlify / Cloudflare Pages

## Run locally (do NOT double-click index.html – service workers need http)
    python -m http.server 8080
then open http://localhost:8080

## Deploy (https required)
Upload the whole folder (keep the folder structure) to Netlify, Vercel,
Cloudflare Pages or your own hosting, at the domain ROOT.
Check https://yourdomain/sw.js and /manifest.json open in the browser.

## Android app with working fingerprint
Fingerprint lock was removed; PIN Lock protects the app on every device.

## After updating files
Change CACHE_NAME in sw.js (e.g. v55) so users receive the update.
