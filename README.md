# Musclemap

A mobile-friendly workout tracker. Log lifts, record runs, walks, hikes and rides with GPS, and see the muscles you trained as a heat map on a front and back body view, by day, week, month, year or all time.

## Features

**Strength**
- Log workouts with a date, optional name, and exercises with reps and weight for each set (lb or kg).
- About 50 common exercises come with their muscles already mapped. For a new exercise, tap the muscles it works; the app remembers them.

**Cardio**
- **Live GPS recording** for runs, walks, hikes and rides. The screen shows a live map of your route, moving time, distance, average pace and current pace, plus climb when the phone reports altitude.
- **Auto-pause:** the clock stops when you stop moving. You can turn it off in Settings.
- **Pause and resume:** distance isn't counted while paused.
- **Screen lock:** a hold-to-unlock overlay stops pocket taps.
- **Saved as you go:** if the browser closes mid-activity, the app offers to resume it or save it the next time you open it.
- **Activity page:** route map, stats, per-mile (or km) splits, and pace and elevation charts. Dragging across a chart marks that spot on the map.
- **Hand entry** for treadmill, spin bike and other sessions without GPS.
- **GPX import and export.** You can import activities exported from Strava, Garmin and most watches.

**Heat map**
- Switch between Day, Week, Month, Year and All, and step back through earlier periods. Tap a muscle to see which exercises worked it.
- A set counts 1 for the main muscles and 0.5 for helper muscles. Ten minutes of cardio moving time counts as one set.
- The weekly view marks a 10–20 sets per week target.

Example lifts and runs are shown until you add your first workout. They are never saved.

## Recording with the screen on

Browsers only get GPS while the page is open and on screen. iPhone and Android stop sending location to web apps when the screen locks or you switch apps. Strava avoids this because it's a native app.

- The app asks the phone to keep the screen awake while recording. Most browsers support this, including iOS 16.4 and later.
- If GPS stops for a while anyway, the app tells you, and that stretch is drawn as a straight line.
- Recording with the screen off needs a native wrapper such as [Capacitor](https://capacitorjs.com/) with a background-location plugin. The data format here doesn't need to change for that.

## Install it on your phone

The app needs HTTPS for GPS, which GitHub Pages provides.

1. In this repository, go to **Settings → Pages → Deploy from a branch → `main` / root**.
2. Open `https://<your-username>.github.io/workout/` on your phone.
3. Add it to your home screen. On iPhone, tap Share, then **Add to Home Screen**. On Android, open the browser menu and tap **Install app**.

Once installed, it opens full screen and works without signal. You can record a run with no connection, but map tiles need a connection to load.

## Your data

- Workouts and GPS tracks are stored on the device in IndexedDB. They don't sync between devices.
- Use **Settings → Export backup** now and then, and **Import backup** on a new phone.
- Safari may clear data for websites you haven't used for a while. Installing to the home screen avoids this.
- Workouts saved by earlier versions of the app (in `localStorage`) are copied over automatically the first time you open this version.

## Maps

Maps use [Leaflet](https://leafletjs.com/), with a copy kept in `vendor/leaflet`, and [OpenStreetMap](https://www.openstreetmap.org/) tiles.

OpenStreetMap's free tile servers are fine for personal use. For heavier use, change `TILE_URL` in `js/map.js` to a provider with an API key, such as MapTiler, Stadia or Thunderforest.

## Development

There's no build step. ES modules need a web server, so `file://` won't work:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # unit tests for the GPS maths and GPX parsing (Node 20+)
```

Browsers allow GPS on `localhost` without HTTPS. To test on a phone, deploy to GitHub Pages or use an HTTPS tunnel.

| File | What it does |
|---|---|
| `index.html`, `styles.css` | Page markup and styles |
| `js/app.js` | Heat map, lift logging, history, settings, backup and import |
| `js/cardio.js` | Record, save and activity screens, and hand-entry cardio |
| `js/recorder.js` | GPS watch, pause and resume, wake lock, crash recovery |
| `js/geo.js` | Distance, moving time, elevation, splits, pace, GPX (no DOM, unit-tested) |
| `js/charts.js` | Pace and elevation charts |
| `js/map.js` | Leaflet wrapper |
| `js/store.js` | IndexedDB storage and backup |
| `js/body.js` | Muscles, exercise library, cardio types, body drawing |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable app and offline support |
