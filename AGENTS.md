# Turnover Tracker

Turnover Tracker is a property operations intelligence system: it helps users understand the physical state of a property and coordinate the work required to maintain it.

Designed and built as a multi-property rental operations platform using React, Vite, and Supabase, with role-based workspaces, property/unit-level task management, attachment storage, public rental listings, and server-side AI workflows that convert voice walkthroughs into reviewable tasks and materials.

## Task Ordering

- Tasks in the work grid persist their order through `items.sort_order`.
- Active tasks can be reordered by native drag and drop on desktop, or with Up and Down controls on touch and keyboard-driven workflows.
- Completed tasks remain at the bottom of the task list and are not reordered.
