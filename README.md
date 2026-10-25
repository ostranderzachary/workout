# Musclemap

A mobile-friendly workout tracker. Log your workouts and see the muscles you trained as a heat map on a front and back body view, by day, week, month, year or all time.

## Features

- **Log workouts:** date, optional name, and exercises with reps and weight for each set (lb or kg). About 50 common exercises come with their muscles already mapped. For a new exercise, tap the muscles it works; the app remembers them.
- **Heat map:** switch between Day, Week, Month, Year and All, and step back through earlier periods. Tap a muscle to see which exercises worked it.
- **Sets per muscle:** a set counts 1 for the main muscles and 0.5 for helper muscles. The weekly view marks a 10–20 sets per week target.
- **History:** tap a workout to edit or delete it.
- Example workouts are shown until you log your first one. They are never saved.

## Running it

It's a single static file with no build step. Open `index.html` in a browser, or host it on any static host. For GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**.

Workouts are saved in the browser's `localStorage`, so they stay on that device and browser only.
