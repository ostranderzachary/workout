# Musclemap

A mobile-friendly workout tracker. Log lifts and cardio, set daily goals, and see how close each muscle is to its goal on two body heat maps (lifting and cardio), by day, week, month, year or all time.

## Features

- **Log workouts:** date, optional name, and exercises with reps and weight for each set (lb or kg). About 50 common exercises come with their muscles already mapped. For a new exercise, tap the muscles it works; the app remembers them.
- **Heat map:** switch between Day, Week, Month, Year and All, and step back through earlier periods. Tap a muscle to see which exercises worked it.
- **Sets per muscle:** a set counts 1 for the main muscles and 0.5 for helper muscles. The weekly view marks a 10–20 sets per week target.
- **History:** tap a workout to edit or delete it.
- Example workouts are shown until you log your first one. They are never saved.

## Goals

Tap **Goals** to set a weekly target: sets per week for each muscle group, and minutes per week for cardio. The defaults are 14 sets a week for big muscles, 6–10 for smaller ones, and 150 minutes of cardio.

Other ranges scale by their number of days. A day's target is a seventh of the weekly goal, and a 31-day month is 31/7 of it. A year uses 365 or 366 days, and all time counts from your first workout to today.

Each muscle is coloured by how close it is to its target: four shades for each quarter of the way, and the darkest once the goal is met. Set a goal to 0 to leave that muscle off the map.

**Cardio breakdown:** for the selected range, each activity shows sessions, time, distance, and average pace (min/mi or min/km) for runs, walks and hikes, or speed for rides. Highlight cards show your longest session and best pace or fastest speed for each activity. Each session in the workout list also shows its pace or speed. Pace and speed use only sessions logged with a distance.

## XP, levels and titles

Every workout earns XP:

- **Lifting:** 25 XP per workout plus 10 XP per set, counting up to 40 sets.
- **Cardio:** 25 XP per session plus 2 XP per minute, counting up to 180 minutes.

Each level needs 100 XP more than the one before. Level 1 to 2 takes 100 XP, 9 to 10 takes 900 XP, and level 10 is 4,500 XP in total.

Every 10 levels unlocks a new title, named after warrior groups from history. They run from hastily raised levies to the most feared and disciplined forces: Peasant Levy, Saxon Fyrd (10), Gallic Warband (20), Viking Raiders (30), Zulu Impi (40), Varangian Guard (50), Janissaries (60), Samurai (70), Roman Legion (80), Mongol Horde (90) and Spartans (100).

### Weekly bonuses and penalties

Weeks run Monday to Sunday. Each week is judged by the goals in effect that week, so changing a goal doesn't rewrite past weeks.

| Event | XP |
|---|---|
| Each muscle's weekly sets goal met | +20 |
| Every muscle goal met | +100 |
| Weekly cardio goal met | +75 |
| Workout-days goal met (set in Goals, default 4 days) | +50 |
| Streak: days goal met several weeks in a row | +20 per extra week, up to +200 |
| Each workout day missed in a finished week | −40, and the streak resets |

Your first week is never penalised. Total XP never goes below 0, but penalties can take you down a level.

The level card shows this week's workout days, what you'll earn by hitting your goal, what you'll lose if you fall short, and last week's result.

Saving a workout shows the XP earned. Reaching a new level or title brings up a celebration. Tap the level card to see the title ladder and recent XP.

XP is worked out from your logged workouts, so editing or deleting a workout updates it. Example workouts don't earn XP.

## Understanding your progress

- **Get started checklist:** walks new users through setting goals, logging lifts and logging cardio. Each step ticks off when done. You can hide it.
- **Your progress:** shows how many muscle goals are met, how much of the cardio goal is done, the days left in the range, and the muscles furthest behind. Tap one to see it on the map.
- **Pace:** in the current week, month or year, each goal is marked *On pace*, *Behind pace* or *Goal met*. The comparison is with how far through the range you are; for example, 2 of 7 days in, you'd be on pace with 2/7 of the goal. The thin line on each bar marks that point. Past ranges show *Goal met* or *Missed*.
- **Legend:** each map labels its colour steps (none yet, under 25%, 25–49%, 50–74%, 75–99%, goal met). "How to read this map" explains how sets and minutes are counted.

## Cardio

Tap **Log cardio** to add a session: activity type, minutes, optional distance (mi or km), date and name. Each activity maps to the muscles it works. For example, a cycle works quads fully and calves, hamstrings and glutes partly. Those minutes fill the separate cardio heat map. A muscle's main activities count full minutes and supporting ones count half.

## Running it

It's a single static file with no build step. Open `index.html` in a browser, or host it on any static host. For GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**.

Workouts are saved in the browser's `localStorage`, so they stay on that device and browser only.
