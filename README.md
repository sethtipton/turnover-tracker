# Rental Flip Checklist

A local-only checklist app for tracking a rental flip project. It keeps materials and work tasks in one JSON-backed checklist, organized by room and category.

The page includes:

- A dashboard with overall progress, open work, and shopping count
- A quick search box that filters tasks by text, note, room, and category
- Shareable URL filters for search, room, category, status, material type, photos, and notes
- Filters for room, category, status, material type, photo presence, and note presence
- A Review Queue section for `pending-review` tasks
- A Materials section split into `Shopping List` and `Materials On Hand`
- Room headers with progress bars
- Drag-and-drop ordering inside rooms
- Swipe-left completion on mobile task rows
- Inline quick-add inputs at the bottom of room sections
- Compact Work Mode for dense execution
- Long-press/right-click context actions for task rows
- Voice note recording and playback on tasks
- Task sections grouped by room, with tasks ordered by saved room sequence
- Hidden add forms that open only when you click `+ Add item`

Room work categories are ordered to match a practical flip sequence:

```text
Prep
Plaster / Spackle
Sanding
Caulking
Painting
Hardware
Appliances
Windows
Cleaning
Final Cleaning
```

## Run

```bash
node server.js
```

## Open

```text
http://localhost:3000
```

## Data

Checklist items are stored in:

```text
tasks.json
```

Each task includes an `id`, `room`, `category`, `text`, optional `note`, `photos`, `voiceNotes`, `materialType`, `status`, `order`, and `createdAt` value.

```json
{
  "id": "bathroom-caulk-tub",
  "room": "Bathroom",
  "category": "Caulking",
  "text": "Remove old bathtub caulk",
  "note": "Use white silicone caulk.",
  "photos": [
    {
      "id": "photo-1",
      "data": "data:image/jpeg;base64,...",
      "filename": "tub-before.jpg",
      "timestamp": "2026-07-18T12:00:00.000Z"
    }
  ],
  "voiceNotes": [
    {
      "id": "voice-1",
      "data": "data:audio/webm;base64,...",
      "filename": "Voice note",
      "mimeType": "audio/webm",
      "timestamp": "2026-07-18T12:00:00.000Z"
    }
  ],
  "materialType": null,
  "status": "approved",
  "order": 1,
  "createdAt": "2026-07-18T12:00:00.000Z"
}
```

Materials are stored as regular tasks with `room: "Materials"`. Items to buy use `materialType: "shopping"`. Items already available use `materialType: "onhand"`.

Task statuses are `pending-review`, `approved`, `in-progress`, and `done`. New user-created tasks default to `approved`. Older tasks without `status` are normalized from `done`: `done: true` becomes `done`, and missing or `done: false` becomes `approved`.

Older material tasks without `materialType` are normalized from category: `Shopping List` becomes `shopping`, and `Materials` becomes `onhand`.

The app has no database, no login, no sync, and no browser localStorage. Changes are saved by the local Node server directly to `tasks.json`.

## API

- `GET /api/tasks` returns the JSON task array.
- `PUT /api/tasks` replaces the JSON task array after validating that the request body is an array.
