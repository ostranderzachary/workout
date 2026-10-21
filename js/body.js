// Muscle groups, the exercise library, cardio activity types, and the front/back body drawing.

/* ---------- Muscles & exercise library ---------- */
export const MUSCLES = {
  chest: "Chest", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
  traps: "Traps", lats: "Lats", lowerback: "Lower back", abs: "Abs", obliques: "Obliques",
  glutes: "Glutes", quads: "Quads", hamstrings: "Hamstrings", adductors: "Adductors", calves: "Calves"
};
export const M_IDS = Object.keys(MUSCLES);

export const LIB = {
  "Bench Press": [["chest"], ["triceps", "shoulders"]],
  "Incline Bench Press": [["chest", "shoulders"], ["triceps"]],
  "Dumbbell Bench Press": [["chest"], ["triceps", "shoulders"]],
  "Push-up": [["chest"], ["triceps", "shoulders", "abs"]],
  "Chest Fly": [["chest"], ["shoulders"]],
  "Dip": [["triceps", "chest"], ["shoulders"]],
  "Overhead Press": [["shoulders"], ["triceps", "traps"]],
  "Dumbbell Shoulder Press": [["shoulders"], ["triceps", "traps"]],
  "Lateral Raise": [["shoulders"], ["traps"]],
  "Rear Delt Fly": [["shoulders"], ["traps"]],
  "Face Pull": [["shoulders", "traps"], []],
  "Barbell Curl": [["biceps"], ["forearms"]],
  "Dumbbell Curl": [["biceps"], ["forearms"]],
  "Hammer Curl": [["biceps", "forearms"], []],
  "Tricep Pushdown": [["triceps"], []],
  "Skull Crusher": [["triceps"], []],
  "Overhead Tricep Extension": [["triceps"], []],
  "Pull-up": [["lats"], ["biceps", "traps", "forearms"]],
  "Chin-up": [["lats", "biceps"], ["forearms"]],
  "Lat Pulldown": [["lats"], ["biceps"]],
  "Barbell Row": [["lats", "traps"], ["biceps", "lowerback"]],
  "Dumbbell Row": [["lats"], ["traps", "biceps"]],
  "Seated Cable Row": [["lats", "traps"], ["biceps"]],
  "Shrug": [["traps"], ["forearms"]],
  "Deadlift": [["hamstrings", "glutes", "lowerback"], ["traps", "forearms", "quads"]],
  "Romanian Deadlift": [["hamstrings", "glutes"], ["lowerback"]],
  "Back Squat": [["quads", "glutes"], ["adductors", "lowerback"]],
  "Front Squat": [["quads"], ["glutes", "abs"]],
  "Goblet Squat": [["quads", "glutes"], ["abs"]],
  "Leg Press": [["quads"], ["glutes"]],
  "Lunge": [["quads", "glutes"], ["hamstrings", "adductors"]],
  "Bulgarian Split Squat": [["quads", "glutes"], ["hamstrings", "adductors"]],
  "Leg Extension": [["quads"], []],
  "Leg Curl": [["hamstrings"], []],
  "Hip Thrust": [["glutes"], ["hamstrings"]],
  "Adductor Machine": [["adductors"], []],
  "Calf Raise": [["calves"], []],
  "Plank": [["abs"], ["obliques"]],
  "Crunch": [["abs"], []],
  "Hanging Leg Raise": [["abs"], ["obliques"]],
  "Russian Twist": [["obliques"], ["abs"]],
  "Back Extension": [["lowerback"], ["glutes", "hamstrings"]],
  "Farmer's Carry": [["forearms", "traps"], ["abs"]],
  "Wrist Curl": [["forearms"], []],
  "Kettlebell Swing": [["glutes", "hamstrings"], ["lowerback", "shoulders"]],
  "Running": [["quads", "calves"], ["hamstrings", "glutes"]],
  "Cycling": [["quads"], ["calves", "hamstrings"]],
  "Rowing Machine": [["lats"], ["quads", "hamstrings", "biceps"]]
};

/* ---------- Body drawing (left half; mirrored for right) ---------- */
const SIL_TORSO = "M100 74 L90 74 Q88 84 72 86 Q60 88 58 96 L70 110 Q70 160 73 210 Q66 228 65 246 Q60 282 64 320 Q66 336 68 346 Q60 372 64 400 Q66 414 70 424 Q64 434 74 436 L88 436 Q92 426 88 414 Q94 386 92 362 Q94 350 94 340 Q99 300 99 266 L100 264 Z";
const SIL_ARM = "M66 86 Q52 86 48 102 Q45 130 46 170 Q40 194 40 216 Q41 236 46 242 Q44 256 48 264 Q54 268 58 258 L58 240 Q64 214 66 196 L68 172 Q70 140 68 112 Z";
const FOREARM = "M48 174 Q42 194 42 214 Q44 232 48 238 L57 238 Q62 214 64 196 Q65 182 62 174 Z";
export const FRONT = {
  traps: ["M91 74 Q88 82 77 87 L93 89 Q97 82 97 76 Z"],
  shoulders: ["M72 86 Q55 86 50 102 Q48 116 52 126 Q60 112 72 104 Q76 94 72 86 Z"],
  chest: ["M99 92 L76 90 Q68 98 68 112 Q70 130 84 134 Q97 134 99 126 Z"],
  biceps: ["M54 128 Q49 144 50 160 Q53 170 60 170 Q66 160 67 140 Q66 122 60 116 Z"],
  forearms: [FOREARM],
  obliques: ["M71 136 Q82 140 85 150 Q83 182 85 214 Q77 216 74 208 Q70 180 70 152 Z"],
  abs: ["M88 138 Q99 135 100 138 L100 224 Q90 225 87 216 Q85 180 87 150 Z"],
  quads: ["M68 250 Q63 276 66 304 Q68 326 76 338 L90 338 Q95 316 95 290 Q95 268 92 256 Q82 248 68 250 Z"],
  adductors: ["M94 258 Q99 262 98 274 L97 302 Q95 292 94 272 Z"],
  calves: ["M68 352 Q63 374 67 396 Q71 410 76 412 L82 412 Q89 392 89 370 Q88 354 82 348 Z"]
};
export const BACK = {
  lats: ["M72 108 Q70 130 72 160 Q76 182 80 194 Q88 188 96 174 Q93 140 90 120 Q82 108 72 108 Z"],
  traps: ["M100 66 L91 72 Q86 84 74 90 Q88 98 93 116 Q97 140 100 158 Z"],
  shoulders: ["M72 88 Q55 88 50 104 Q49 116 53 125 Q62 110 76 100 Z"],
  triceps: ["M54 127 Q49 144 50 160 Q53 170 60 170 Q66 158 67 140 Q66 122 60 116 Z"],
  forearms: [FOREARM],
  lowerback: ["M100 176 L100 222 L79 222 Q76 208 78 198 Q90 192 100 176 Z"],
  glutes: ["M100 226 L80 225 Q67 233 66 254 Q67 274 82 279 Q97 278 100 268 Z"],
  hamstrings: ["M66 284 Q63 304 67 324 Q71 338 78 342 L90 342 Q95 322 96 302 Q97 290 95 282 Q80 288 66 284 Z"],
  calves: ["M69 350 Q61 372 65 390 Q71 404 79 404 Q90 396 90 374 Q90 356 84 346 Z"]
};
const MIRROR = 'transform="matrix(-1 0 0 1 200 0)"';

export function figure(view, shapes, levels, sel) {
  let s = `<svg viewBox="0 0 200 444" role="img" aria-label="${view} view of the body">`;
  s += `<ellipse class="sil" cx="100" cy="36" rx="20" ry="25"/><rect class="sil" x="91" y="56" width="18" height="22" rx="4"/>`;
  for (const d of [SIL_TORSO, SIL_ARM]) s += `<path class="sil" d="${d}"/><path class="sil" d="${d}" ${MIRROR}/>`;
  for (const [id, paths] of Object.entries(shapes)) {
    const cls = `m l${levels[id] || 0}${sel === id ? " sel" : ""}`;
    for (const d of paths) {
      for (const t of ["", MIRROR]) s += `<path class="${cls}" data-m="${id}" d="${d}" ${t}><title>${MUSCLES[id]}</title></path>`;
    }
  }
  if (view === "Front") s += `<path class="absline" d="M100 140 V222 M88 160 H112 M87 182 H113 M87 202 H113"/>`;
  s += `</svg>`;
  return s;
}

/* Cardio activities. Moving time counts toward the heat map: CARDIO_SET_SECONDS of cardio = one set.
   moveSpeed (m/s) is the auto-pause threshold; maxSpeed rejects GPS jumps. */
export const CARDIO_SET_SECONDS = 600;
export const ACTIVITIES = {
  run:  { label: "Run",  p: ["quads", "calves"], s: ["hamstrings", "glutes"], usesPace: true, moveSpeed: 0.8, maxSpeed: 12 },
  walk: { label: "Walk", p: ["calves"], s: ["quads", "glutes", "hamstrings"], usesPace: true, moveSpeed: 0.4, maxSpeed: 6 },
  hike: { label: "Hike", p: ["quads", "glutes"], s: ["calves", "hamstrings"], usesPace: true, moveSpeed: 0.3, maxSpeed: 6 },
  ride: { label: "Ride", p: ["quads"], s: ["calves", "hamstrings", "glutes"], usesPace: false, moveSpeed: 1.0, maxSpeed: 30 }
};
