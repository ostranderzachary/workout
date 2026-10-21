// IndexedDB storage. Workouts (strength and cardio summaries) live in `workouts`,
// GPS points in `tracks` (keyed by the workout id) so the list stays light,
// and `meta` holds the in-progress recording and the migration flag.

const DB_NAME = "musclemap";
const LEGACY_KEY = "musclemap.workouts.v1";

let dbp = null;
function open() {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("This browser can't store data."));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("workouts", { keyPath: "id" });
      db.createObjectStore("tracks", { keyPath: "id" });
      db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("This browser blocked storage."));
  });
  return dbp;
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out;
    Promise.resolve(fn(...[].concat(stores).map(s => t.objectStore(s)))).then(v => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = t.onabort = () => reject(t.error || new Error("Saving failed."));
  });
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const Store = {
  async init() {
    await open();
    const migrated = await this.getMeta("migratedLegacy");
    if (!migrated) {
      let legacy = [];
      try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]"); } catch {}
      if (legacy.length) await tx("workouts", "readwrite", s => legacy.forEach(w => s.put({ kind: "strength", ...w })));
      await this.setMeta("migratedLegacy", true);
    }
    // Ask the browser not to clear our data under storage pressure. Installed apps usually get this.
    try { await navigator.storage?.persist?.(); } catch {}
  },
  workouts: () => tx("workouts", "readonly", s => req(s.getAll())),
  putWorkout: (w, track) => tx(["workouts", "tracks"], "readwrite", (ws, ts) => {
    ws.put(w);
    if (track) ts.put({ id: w.id, segments: track });
  }),
  deleteWorkout: id => tx(["workouts", "tracks"], "readwrite", (ws, ts) => { ws.delete(id); ts.delete(id); }),
  getTrack: async id => (await tx("tracks", "readonly", s => req(s.get(id))))?.segments || null,
  getMeta: async key => (await tx("meta", "readonly", s => req(s.get(key))))?.value,
  setMeta: (key, value) => tx("meta", "readwrite", s => { s.put({ key, value }); }),
  delMeta: key => tx("meta", "readwrite", s => { s.delete(key); }),

  async exportAll() {
    const [workouts, tracks] = await tx(["workouts", "tracks"], "readonly", (ws, ts) => Promise.all([req(ws.getAll()), req(ts.getAll())]));
    return { app: "musclemap", version: 1, exportedAt: new Date().toISOString(), workouts, tracks };
  },
  /* Merge a backup: entries with the same id are replaced, everything else is kept. */
  async importAll(data) {
    if (!data || data.app !== "musclemap" || !Array.isArray(data.workouts)) throw new Error("That file isn't a Musclemap backup.");
    await tx(["workouts", "tracks"], "readwrite", (ws, ts) => {
      data.workouts.forEach(w => w && w.id && ws.put(w));
      (data.tracks || []).forEach(t => t && t.id && ts.put(t));
    });
    return data.workouts.length;
  }
};
