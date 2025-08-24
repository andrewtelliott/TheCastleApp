# The Castle — Prototype

A static, offline-friendly phone UI for filmmaking. Dark, tactical, encrypted vibe.

## Run
- Open `castle-app/index.html` in a browser.
- No build step. No dependencies.

## Screens
- Dashboard: four tiles (Manual, Calendar, Good Deeds, Manifesto)
- Manifesto: scrollable principles
- Operations Map: optional Google Maps with red HUD
- Messages: stacked secure-chat vibe

## Screenshot Mode
- Add `?shot=1` to the URL, or press `Cmd/Alt/Shift + S` to toggle.
- Hides the status bar and bottom nav.

## Google Maps (optional)
- Provide an API key via query: `?gmap=YOUR_API_KEY`
- Optional center/zoom: `?center=43.6,-116.2&zoom=11`
- Example:
  `castle-app/index.html?gmap=YOUR_KEY&center=43.6,-116.2&zoom=11#map`
- If no key, a dark grid fallback renders with the red reticle HUD.

## Notes
- Accessible, semantic HTML; visible focus and high contrast.
- Design tokens in `css/tokens.css`.
- Minimal JS in `js/app.js`; Google Maps loader in `js/map.js`.

## On-Set Tips
- Preload the `#map` route to warm caches before rolling.
- Use `?shot=1` during close-ups to reduce UI clutter.
- You can tweak copy live via DOM inspector if needed.
