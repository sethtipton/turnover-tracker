# AGENTS.md

## Project Purpose

This is a local-only rental flip checklist app. It tracks materials and work tasks for a unit turnover or rental repair project.

## Architecture Overview

- Plain HTML and CSS in `index.html`
- Browser-native JavaScript in `app.js`
- Tiny Node HTTP server in `server.js`
- JSON file persistence in `tasks.json`
- No framework, build step, database, package manager, or browser localStorage

## File Structure

- `server.js`: Local Node HTTP server and JSON API
- `index.html`: Single-page UI and inline CSS
- `app.js`: Client-side rendering, filters, task actions, and API calls
- `tasks.json`: Local task data
- `README.md`: User-facing setup and usage notes
- `AGENTS.md`: Agent-facing project instructions

## How To Run

```bash
node server.js
```

Open:

```text
http://localhost:3000
```

## Data Storage Approach

All data is stored in `tasks.json` as a single JSON array. The server reads this file for `GET /api/tasks` and writes it for `PUT /api/tasks`.

Writes are performed safely by writing to `tasks.json.tmp` first, then renaming it to `tasks.json`.

Task objects use this shape:

```json
{
  "id": "...",
  "room": "Bathroom",
  "category": "Caulking",
  "text": "Remove old bathtub caulk",
  "note": "Use white silicone caulk.",
  "photos": [],
  "voiceNotes": [],
  "materialType": null,
  "status": "approved",
  "order": 1,
  "createdAt": "..."
}
```

Older tasks without `room`, `category`, `note`, `photos`, `voiceNotes`, `materialType`, `status`, or `order` should be normalized with reasonable defaults. Missing work-task categories should default to `Prep`; missing material categories should default to `Shopping List`; missing notes should default to an empty string; missing photos and voice notes should default to `[]`; missing order should default to an incremental value. Missing status should be derived from old `done`: `done: true` becomes `done`, and missing or `done: false` becomes `approved`.

## API Endpoints

- `GET /api/tasks`: Returns parsed task data from `tasks.json`; returns an empty array if the file is missing or invalid.
- `PUT /api/tasks`: Accepts a JSON array and writes it to `tasks.json`.

## Coding Conventions

- Keep code small, direct, and readable.
- Use `async`/`await` for API calls.
- Use `textContent` for inserting task text.
- Keep task data as plain objects.
- Keep materials as tasks with `room: "Materials"` rather than creating a separate data store.
- Use `materialType: "shopping"` for materials to buy and `materialType: "onhand"` for materials on hand.
- Use status values `pending-review`, `approved`, `in-progress`, and `done`; new user-created tasks should default to `approved`.
- Use `order` for room-level sequencing; preserve and rewrite order values when reordering tasks.
- Treat task `order` as the primary room work sequence; use the order of `CATEGORIES` in `app.js` as a fallback or default grouping sequence.
- Prefer sequence categories such as `Prep`, `Plaster / Spackle`, `Sanding`, `Caulking`, `Painting`, `Cleaning`, and `Final Cleaning` over a broad `Repair` bucket.
- Preserve existing data when changing the model.

## Rules

- Keep dependencies at zero.
- Use browser-native JavaScript.
- Use Node built-in modules only.
- Do not add frameworks.
- Do not add build tools.
- Do not add package managers.
- Do not add a database.
- Do not use browser localStorage.
- Keep the app local-only.
