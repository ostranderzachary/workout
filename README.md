# Musclemap

A mobile-friendly workout tracker. Log lifts and cardio, set daily goals, and see how close each muscle is to its goal on two body heat maps (lifting and cardio), by day, week, month, year or all time.

## Features

- **Log workouts:** date, optional name, and exercises with reps and weight for each set (lb or kg). About 50 common exercises come with their muscles already mapped. For a new exercise, tap the muscles it works; the app remembers them.
- **Heat map:** switch between Day, Week, Month, Year and All, and step back through earlier periods. Tap a muscle to see which exercises worked it.
- **Sets per muscle:** a set counts 1 for the main muscles and 0.5 for helper muscles. The weekly view marks a 10–20 sets per week target.
- **History:** tap a workout to edit or delete it.
- Example workouts are shown until you log your first one. They are never saved.

## Goals

Tap **Goals** to set a daily target: sets per day for each muscle group, and minutes per day for cardio. Targets for longer ranges are the daily goal times the days in the range. For example, 2 sets a day is 14 for a week and 62 for a 31-day month. The all-time range counts from your first workout to today.

Each muscle is coloured by how close it is to its target: four shades for each quarter of the way, and the darkest once the goal is met. Set a goal to 0 to leave that muscle off the map.

## Cardio

Tap **Log cardio** to add a session: activity type, minutes, optional distance (mi or km), date and name. Each activity maps to the muscles it works. For example, a cycle works quads fully and calves, hamstrings and glutes partly. Those minutes fill the separate cardio heat map. A muscle's main activities count full minutes and supporting ones count half.

## Running it

It's a single static file with no build step. Open `index.html` in a browser, or host it on any static host. For GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**.

Workouts are saved in the browser's `localStorage`, so they stay on that device and browser only.
