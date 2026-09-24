# Task milestones

Milestones are a new items.kind value with an optional milestone_date field and a fixed blue appearance. They share sort_order with tasks. Reached milestones use status=done but stay in position and remain reorderable. Existing tasks are never converted automatically or through the UI.

The migration 20260923180000_task_milestones.sql was applied to shared Supabase on September 23, 2026. Carthage’s “Take pictures” and “Hand keys to renter” rows were changed to kind=milestone in place, preserving their IDs, notes, status, and sort order. No conversion control is exposed in the app.

Use http://127.0.0.1:5173/turnover-tracker/tests/browser/milestones.html for an isolated interactive preview. It uses the production components with in-memory sample data; refreshing resets it. It makes no database writes.

Verified: component tests for ordering, reached-state controls, reorder excluding completed tasks, deletion targeting, save failure/retry, and add form controls; desktop browser menu and 390px-wide creation form. Full test suite, lint, and production build pass. Migration and the two persisted Carthage milestone rows were verified in the shared database.
