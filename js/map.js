// Leaflet wrapper. If Leaflet or the tiles can't load (offline), recording still works;
// the route is drawn on a blank background.
// Tiles: OpenStreetMap's free servers are fine for personal use. For heavier use,
// switch TILE_URL to a provider with an API key (MapTiler, Stadia, Thunderforest).
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class RouteMap {
  constructor(el, { interactive = true } = {}) {
    this.el = el;
    this.ok = typeof window.L !== "undefined";
    if (!this.ok) { el.innerHTML = `<div class="map-off">Map unavailable offline. Your route is still being recorded.</div>`; return; }
    const L = window.L;
    this.map = L.map(el, { zoomControl: interactive, attributionControl: true, dragging: interactive, scrollWheelZoom: interactive, touchZoom: interactive, doubleClickZoom: interactive, boxZoom: false, keyboard: interactive });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(this.map);
    this.map.attributionControl.setPrefix(false);
    this.lines = [];
    this.drawn = [];
    this.follow = true;
    this.map.on("dragstart", () => { this.follow = false; });
    this.map.setView([20, 0], 2);
  }
  color() { return css("--route") || "#e8542f"; }

  style() { return { color: this.color(), weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round" }; }
  /* Replace the drawn route. segments: [[lat, lon, ...], ...][] */
  setRoute(segments, { fit = false } = {}) {
    if (!this.ok) return;
    this.lines.forEach(l => l.remove());
    this.lines = []; this.drawn = [];
    this.extend(segments);
    if (fit) this.fit(segments);
  }
  /* Add only the points drawn since last time, so live recording stays cheap. */
  extend(segments) {
    if (!this.ok) return;
    const L = window.L;
    this.drawn = this.drawn || [];
    segments.forEach((s, i) => {
      if (!this.lines[i]) { this.lines[i] = L.polyline([], this.style()).addTo(this.map); this.drawn[i] = 0; }
      for (let k = this.drawn[i]; k < s.length; k++) this.lines[i].addLatLng([s[k][0], s[k][1]]);
      this.drawn[i] = s.length;
    });
  }
  fit(segments) {
    if (!this.ok) return;
    const pts = segments.flat().map(p => [p[0], p[1]]);
    if (pts.length > 1) this.map.fitBounds(pts, { padding: [24, 24] });
    else if (pts.length) this.map.setView(pts[0], 16);
  }
  /* Start and finish markers for a saved activity. */
  endpoints(segments) {
    if (!this.ok) return;
    const L = window.L, pts = segments.flat();
    if (!pts.length) return;
    const dot = (p, fill) => L.circleMarker([p[0], p[1]], { radius: 7, color: css("--surface") || "#fff", weight: 3, fillColor: fill, fillOpacity: 1 }).addTo(this.map);
    dot(pts[0], css("--good") || "#2f9e5b");
    dot(pts[pts.length - 1], css("--fg") || "#171c21");
  }
  /* The live "you are here" dot plus its accuracy circle. */
  setPosition(p) {
    if (!this.ok || !p) return;
    const L = window.L, ll = [p[0], p[1]];
    if (!this.me) {
      this.acc = L.circle(ll, { radius: p[4] || 10, color: css("--ring"), weight: 1, fillColor: css("--ring"), fillOpacity: 0.12, interactive: false }).addTo(this.map);
      this.me = L.circleMarker(ll, { radius: 8, color: css("--surface") || "#fff", weight: 3, fillColor: css("--ring"), fillOpacity: 1, interactive: false }).addTo(this.map);
      this.map.setView(ll, 17);
    } else {
      this.me.setLatLng(ll); this.acc.setLatLng(ll).setRadius(p[4] || 10);
      if (this.follow) this.map.panTo(ll, { animate: true });
    }
  }
  recenter() { this.follow = true; if (this.me) this.map.panTo(this.me.getLatLng()); }
  /* Hover marker driven by the charts. */
  highlight(lat, lon) {
    if (!this.ok) return;
    const L = window.L;
    if (lat == null) { this.hl?.remove(); this.hl = null; return; }
    if (!this.hl) this.hl = L.circleMarker([lat, lon], { radius: 7, color: css("--surface") || "#fff", weight: 3, fillColor: css("--fg"), fillOpacity: 1, interactive: false }).addTo(this.map);
    else this.hl.setLatLng([lat, lon]);
  }
  invalidate() { if (this.ok) this.map.invalidateSize(); }
  destroy() { if (this.ok) this.map.remove(); }
}
