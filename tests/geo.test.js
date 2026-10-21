import { test } from "node:test";
import assert from "node:assert/strict";
import { haversine, acceptPoint, trackStats, splits, elevation, profile, recentSpeed, duration, pace, toGPX, parseGPX, MILE } from "../js/geo.js";

// A straight run north: one point every 5 s at 3 m/s (8:56 per mile), climbing 1 m per point.
const DEG_PER_M = 1 / 111195;
function straight({ n = 600, speed = 3, dt = 5, start = Date.UTC(2026, 9, 20, 7), alt = 100, climb = 1 } = {}) {
  return Array.from({ length: n }, (_, i) => [40 + i * speed * dt * DEG_PER_M, -74, start + i * dt * 1000, alt + i * climb, 5]);
}

test("haversine measures a degree of latitude", () => {
  assert.ok(Math.abs(haversine([0, 0], [1, 0]) - 111195) < 5);
});

test("trackStats sums distance and drops a stop from moving time", () => {
  const a = straight({ n: 121 });            // 600 s, 1800 m
  const last = a[a.length - 1];
  const stopped = Array.from({ length: 12 }, (_, i) => [last[0], last[1], last[2] + (i + 1) * 10000, last[3], 5]); // 2 min standing
  const s = trackStats([a.concat(stopped)], { moveSpeed: 0.8 });
  assert.ok(Math.abs(s.distance - 1800) < 2);
  assert.ok(Math.abs(s.moving - 600) < 1);
  assert.ok(Math.abs(s.elapsed - 720) < 1);
});

test("distance is not counted across manual pause segments", () => {
  const a = straight({ n: 11 }), b = straight({ n: 11, start: Date.UTC(2026, 9, 20, 8) }).map(p => [p[0] + 0.01, ...p.slice(1)]);
  const s = trackStats([a, b]);
  assert.ok(Math.abs(s.distance - 300) < 1);
});

test("splits are a mile each with moving time, plus a partial last split", () => {
  const sp = splits([straight({ n: 400 })], MILE);       // 5985 m
  assert.equal(sp.length, 4);
  for (const x of sp.slice(0, 3)) { assert.ok(Math.abs(x.distance - MILE) < 0.01); assert.ok(Math.abs(x.time - MILE / 3) < 0.5); }
  assert.ok(Math.abs(sp[3].distance - (5985 - 3 * MILE)) < 2);
  assert.ok(Math.abs(sp[0].elev - MILE / 15) < 1); // 1 m per 15 m
});

test("elevation ignores noise inside the dead band", () => {
  const noisy = straight({ n: 50, climb: 0 }).map((p, i) => [p[0], p[1], p[2], 100 + (i % 2 ? 1.5 : -1.5), 5]);
  assert.equal(elevation([noisy]).gain, 0);
  assert.equal(elevation([[[0, 0, 0, null, 5]]]).gain, null);
});

test("acceptPoint filters poor accuracy, jumps and jitter", () => {
  const p = [40, -74, 0, null, 5];
  assert.equal(acceptPoint(null, [40, -74, 0, null, 80]), "inaccurate");
  assert.equal(acceptPoint(p, [40.01, -74, 5000, null, 5]), "jump");
  assert.equal(acceptPoint(p, [40 + 1 * DEG_PER_M, -74, 2000, null, 5]), "still");
  assert.equal(acceptPoint(p, [40 + 1 * DEG_PER_M, -74, 12000, null, 5]), "ok");
  assert.equal(acceptPoint(p, [40 + 8 * DEG_PER_M, -74, 3000, null, 5]), "ok");
});

test("recentSpeed and profile report about 3 m/s", () => {
  const a = straight({ n: 30 });
  assert.ok(Math.abs(recentSpeed(a) - 3) < 0.01);
  const pr = profile([straight({ n: 1000 })], { maxPoints: 100 });
  assert.ok(pr.length <= 102);
  assert.ok(Math.abs(pr[50].speed - 3) < 0.01);
});

test("formatting", () => {
  assert.equal(duration(3725), "1:02:05");
  assert.equal(duration(59.6), "1:00");
  assert.equal(pace(MILE / 512, MILE), "8:32");
  assert.equal(pace(0, MILE), "–:––");
});

test("GPX round trip keeps segments, times, elevation and type", () => {
  const segs = [straight({ n: 5 }), straight({ n: 3, start: Date.UTC(2026, 9, 20, 9) })];
  const g = parseGPX(toGPX({ name: "Morning & Run", activity: "hike" }, segs));
  assert.equal(g.name, "Morning & Run");
  assert.equal(g.activity, "hike");
  assert.equal(g.segments.length, 2);
  assert.equal(g.segments[0][4 - 1][2], segs[0][3][2]);
  assert.ok(Math.abs(g.segments[1][2][3] - segs[1][2][3]) < 0.06);
});

test("parseGPX reads Strava-style files with numeric types and lon before lat", () => {
  const g = parseGPX(`<gpx><trk><name><![CDATA[Lunch Ride]]></name><type>1</type><trkseg>
    <trkpt lon="-74.0" lat="40.0"><ele>10</ele><time>2026-10-20T12:00:00Z</time></trkpt>
    <trkpt lon="-74.0" lat="40.001"><time>2026-10-20T12:00:10Z</time></trkpt></trkseg></trk></gpx>`);
  assert.equal(g.activity, "ride");
  assert.equal(g.name, "Lunch Ride");
  assert.equal(g.segments[0].length, 2);
  assert.equal(g.segments[0][1][3], null);
  assert.throws(() => parseGPX("<gpx></gpx>"), /no track/);
});

test("elevation still counts a real steady climb", () => {
  const g = elevation([straight({ n: 101, climb: 1 })]).gain;   // 100 m of climbing
  assert.ok(g > 90 && g <= 100, `gain ${g}`);
});
