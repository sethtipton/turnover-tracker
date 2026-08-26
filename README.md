# Turnover Tracker

Turnover Tracker is a property-operations system for understanding the physical state of rental properties, capturing maintenance observations, and coordinating the work required to maintain them.

It is also a public portfolio project demonstrating how I approach application architecture: decomposing a real-world domain into structured entities, defining relationships and system boundaries, translating operational requirements into workflows, and preserving traceability between source information, automated analysis, human decisions, and resulting work.

The application is built with React, Vite, Supabase, and server-side AI workflows.

---

## 1. What Turnover Tracker Is

Turnover Tracker is a multi-property rental operations platform for owners, property managers, maintenance teams, and tenants.

It provides a private operational workspace for managing:

* properties and units,
* maintenance requests,
* tasks and work planning,
* materials and shopping lists,
* photos, files, and audio,
* property-specific access,
* public rental listings,
* and AI-assisted walkthrough analysis.

The system is designed around a simple principle:

> Operational information should remain connected to the property, source, decision, and work it represents.

A maintenance issue may begin as a tenant request, an administrator walkthrough, dictated audio, a photograph, or typed notes. Turnover Tracker preserves that source information while progressively turning it into structured, reviewable operational work.

AI assists with that process, but does not automatically create authoritative work orders or publish content.

---

## 2. System Model

The primary operational hierarchy is:

```text
Workspace
└── Property
    ├── Property-level work
    └── Unit
        ├── Maintenance requests
        ├── Tasks
        ├── Materials
        └── Attachments
```

### Workspace

A workspace represents the organizational boundary for a group managing properties.

Workspace members may have roles such as:

* owner,
* editor,
* viewer.

Workspace-wide permissions are separate from property-specific permissions.

### Property

A property represents a physical asset.

Work that affects the property as a whole can exist directly at this level, including:

* roofing,
* siding,
* grounds,
* utilities,
* exterior systems,
* shared mechanical systems.

This prevents shared work from being artificially assigned to one unit simply because the application needs somewhere to store it.

### Unit

A unit represents an independently managed portion of a property.

Unit-level work includes issues such as:

* interior repairs,
* fixtures,
* appliances,
* unit-specific maintenance,
* tenant-reported problems.

Existing flat unit records can be migrated into the hierarchical model without incorrectly moving their existing tasks into property-level scope.

### Maintenance Case

A maintenance request acts as a case file around an observed problem.

A case may include:

```text
Maintenance Request
├── Original description
├── Request source
├── Photos / files / audio
├── Analysis snapshots
├── Follow-up information
├── Proposed tasks
├── Proposed materials
└── Resulting operational work
```

The case remains distinct from the work eventually approved to resolve it.

This allows the system to preserve both:

* **what was originally observed**, and
* **what was eventually decided**.

---

## 3. Architecture & Design Principles

### Model the domain, not just the interface

The application is structured around the real relationships between properties, units, people, observations, and work.

These relationships exist in the underlying data model rather than being inferred solely from where something appears in the UI.

Examples include:

```text
Workspace -> Property
Property -> Unit
Property -> Property-level Task
Unit -> Unit-level Task
Unit -> Maintenance Request
Request -> Attachment
Request -> Analysis
Analysis -> Work Proposal
Proposal -> Approved Task
User -> Authorized Scope
```

The interface is one representation of this underlying operational model.

### Hierarchical decomposition

Large operational scopes are broken into smaller, meaningful parts while preserving their relationship to the whole.

A workspace contains properties.

A property may contain units.

Work belongs to the narrowest physical scope that accurately represents what it affects.

This allows the application to reason about an entire property while still supporting independent unit-level operations.

### Explicit boundaries

Different parts of the system have intentionally different responsibilities.

For example:

```text
React client
    ↓
Authentication / session
    ↓
Supabase API
    ↓
Postgres + Row Level Security
    ↓
Edge Functions
    ↓
Privileged integrations
```

The browser is not treated as a trusted security boundary.

Operations requiring elevated privileges occur server-side only after the request's identity, scope, or capability has been validated.

### Traceability and provenance

A central design requirement is preserving how operational work came into existence.

For maintenance intake:

```text
Source observation
      ↓
Maintenance request
      ↓
Analysis snapshot
      ↓
Work proposal
      ↓
Human decision
      ↓
Approved operational task
      ↓
Completion
```

The source information remains available after the work has been created.

This allows the application to answer questions such as:

* Why does this task exist?
* What information led to this recommendation?
* What did the tenant originally report?
* Which analysis produced this proposal?
* Was the proposal accepted, modified, or rejected?
* What work ultimately resulted from the issue?

### Explicit state transitions

Operational records move through defined states rather than being silently transformed.

A simplified maintenance lifecycle is:

```text
Observation
    ↓
Request created
    ↓
Analysis
    ↓
Pending review
    ↓
Approved / rejected
    ↓
Operational work
    ↓
Completed
```

Separating states makes it possible for authorization, automation, UI behavior, and reporting to operate against the same lifecycle.

### Human authority over automation

AI-generated information is treated as analysis or a proposal.

It is not automatically considered an operational fact.

The system therefore distinguishes between:

* source evidence,
* automated interpretation,
* proposed work,
* human-approved work.

This is intentional.

Automation should reduce the effort required to understand and organize information without hiding where conclusions came from or removing human judgment from operational decisions.

### Idempotent server operations

Where server-side workflows may be retried, the application is designed to avoid producing duplicate operational work.

AI analysis and proposal generation therefore use persistent records and idempotent processing patterns rather than assuming every function executes exactly once.

---

## 4. Core Workflows

### Property and unit work

Users can:

* track approved, pending-review, and completed work,
* assign work to a property or specific unit,
* reorder active tasks,
* maintain Shopping List and Collect / Bring material states,
* attach photos, files, and audio,
* preserve completed work as historical state.

On desktop, active tasks support drag-and-drop ordering.

Touch and keyboard users can use explicit **Up** and **Down** controls.

Completed tasks remain at the bottom of the task list.

### Maintenance intake

Maintenance information can originate from:

* tenant-submitted requests,
* administrator walkthroughs,
* typed descriptions,
* photographs,
* uploaded files,
* dictated audio.

The system can preserve those inputs and transform them into structured maintenance cases.

### Tenant maintenance requests

Authenticated tenants can submit and access maintenance information only for the unit associated with their active tenant membership.

Tenant memberships are tied to:

```text
workspace
property
unit
email
authenticated user
```

Tenant accounts are intentionally separate from normal workspace membership.

### Public QR maintenance intake

A unit may also have a printed maintenance QR code.

Scanning the code opens a public maintenance-request flow without requiring tenant authentication.

The QR represents a narrowly scoped capability:

> Possession of the capability permits creation of a new maintenance request for one specific unit.

It does **not** grant access to:

* property records,
* unit records,
* tenant memberships,
* request history,
* internal notes,
* AI analyses,
* tasks,
* materials,
* attachment URLs.

### Administrator walkthroughs

Internal users can submit longer property walkthroughs containing multiple observations.

The AI processing layer may split a walkthrough into multiple maintenance cases when appropriate.

Those cases remain pending human review before proposed work becomes normal operational work.

### Public rental listings

Public rental listings are separated from the private operational workspace.

Listing information may include:

* availability,
* descriptions,
* amenities,
* photos,
* public-facing property information.

AI can generate editable listing copy based on known facts.

It never automatically publishes or modifies a listing.

---

## 5. Security Model

Turnover Tracker uses multiple layers of authorization rather than relying on UI visibility.

### Authentication

Administrative users authenticate using Google OAuth through Supabase Auth.

The React application listens for Supabase authentication-state changes and uses the resulting session/JWT for database and Edge Function requests.

Signing out clears the Supabase session.

### Authorization

Authorization is enforced primarily through Supabase Row Level Security.

The application supports multiple authorization scopes.

```text
Workspace Owner
    broad workspace access

Workspace Editor
    operational editing access

Workspace Viewer
    read-only workspace access

Property Admin
    assigned properties only

Tenant
    permitted maintenance operations
    for their own unit

Public QR Capability
    submit one new maintenance request
    for one specific unit
```

Client-side route protection and hidden controls are treated as usability features, not security boundaries.

### Property administrators

A property-level administrator can access maintenance operations for authorized properties.

They do not automatically receive access to workspace-wide administration or membership controls.

### Tenant isolation

Tenants are represented by `tenant_memberships`.

A membership is tied to an exact:

* workspace,
* property,
* unit,
* email,
* authenticated user ID.

Server-side database policies and validation prevent a tenant from changing request payloads to target another unit.

### Capability-based QR access

Public maintenance QR codes use random capability tokens.

The server creates a 256-bit URL-safe capability.

Only its SHA-256 hash is stored.

The plaintext token is returned only when the card is generated so it can be copied or printed.

The public route uses:

```text
/maintenance/q/:long-random-token/
```

Rotating a code:

1. creates a new secret,
2. replaces the stored hash,
3. immediately invalidates the previous card.

Disabling a code invalidates it without retaining a usable route back into operational data.

### Server-side validation

The public maintenance page communicates only with:

```text
submit-maintenance-request
```

The Edge Function:

1. receives the supplied capability,
2. hashes it server-side,
3. validates the hash,
4. resolves the authorized workspace/property/unit,
5. validates attachments,
6. performs privileged writes only after successful validation.

The browser does not select the target unit and cannot write directly to maintenance tables.

### Attachment security

The maintenance storage bucket remains private.

Photos and audio are:

* MIME validated,
* count limited,
* size limited,
* stored using server-generated paths.

Public QR possession does not provide direct access to stored attachment URLs.

### Service-role isolation

`SUPABASE_SERVICE_ROLE_KEY` is used only in trusted server-side environments.

It must never appear in:

```text
VITE_*
```

variables or other browser-exposed configuration.

---

## 6. AI / Human Review Architecture

Turnover Tracker uses AI to convert unstructured observations into structured operational proposals.

The intended pipeline is:

```text
Tenant Request / Admin Walkthrough
              ↓
       Source preserved
              ↓
      Audio transcription
              ↓
      Structured analysis
              ↓
 Immutable analysis snapshot
              ↓
 Tasks + materials proposed
              ↓
         Human review
          ↙       ↘
      Reject      Approve / Edit
                       ↓
                 Operational work
```

### Source preservation

Original input is retained rather than replaced by an AI summary.

This may include:

* text,
* audio,
* photographs,
* uploaded files.

### Immutable analyses

AI analyses are stored as immutable snapshots.

If additional information later changes the understanding of a request, the system can create another analysis rather than rewriting the previous one.

This preserves the history of what was known and inferred at each stage.

### Structured proposals

AI may propose:

* likely issues,
* missing information,
* follow-up questions,
* tasks,
* materials,
* possible causes.

These remain proposals until reviewed.

### Human review

AI-generated work does not automatically enter the active task system.

An administrator can:

* approve,
* reject,
* modify,
* or independently create work.

Approved items then enter the normal operational workflow.

### Walkthrough decomposition

A long walkthrough may contain multiple independent maintenance issues.

The processing pipeline can safely decompose that input into separate maintenance cases while preserving their relationship to the original walkthrough.

### Server-side processing

Sensitive AI operations occur through Supabase Edge Functions.

Current functions include:

```text
draft-tasks
draft-listing-copy
process-maintenance-request
submit-maintenance-request
```

`draft-tasks` supports legacy dictation.

`process-maintenance-request` handles the current maintenance-analysis pipeline.

It:

* preserves request audio,
* transcribes voice entries,
* writes immutable analysis snapshots,
* separates walkthrough observations when necessary,
* creates idempotent pending-review proposals.

`draft-listing-copy` creates editable, fact-grounded listing suggestions.

It does not save or publish listings automatically.

---

## 7. Technology

### Client

* React
* Vite
* JavaScript
* responsive browser UI
* keyboard- and touch-accessible task controls

### Platform

* Supabase Auth
* PostgreSQL
* Row Level Security
* Supabase Storage
* Supabase Edge Functions

### AI

* OpenAI API
* speech transcription
* structured maintenance analysis
* task and material proposal generation
* listing-copy assistance

### Authentication

* Google OAuth
* Supabase sessions/JWTs

### Hosting and delivery

* GitHub
* GitHub Actions
* GitHub Pages
* Supabase-hosted backend services

---

## 8. Local Development

Install dependencies:

```bash
npm install
```

Create the local environment file:

```bash
cp .env.example .env.local
```

Add the Supabase project URL and anon/publishable key to `.env.local`.

Start Vite:

```bash
npm run dev
```

### Local Supabase functions

Create the function environment file:

```bash
cp supabase/.env.example supabase/.env
```

Replace the placeholder values with local development credentials.

Server-only credentials such as:

```text
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
```

belong only in the Edge Function environment.

They must never be exposed through Vite.

### Public app URL

When generating printable QR cards locally that should point to production, set:

```text
VITE_PUBLIC_APP_URL
```

to the hosted application URL.

---

## 9. Supabase Setup

Supabase project:

```text
Turnover Tracker
https://gholbnyvijfyqdwqgjan.supabase.co
```

### Database

For a new installation, run:

```text
supabase/schema.sql
```

in the Supabase SQL Editor.

The bootstrap schema includes alignment with later migrations for:

* property access,
* public listings,
* maintenance workflows,
* current Phase 4 functionality.

For an existing project, apply the versioned files in:

```text
supabase/migrations/
```

instead.

### Authentication URL configuration

Set the Site URL to:

```text
https://sethtipton.github.io/turnover-tracker
```

Add these redirect URLs:

```text
http://localhost:5173/
http://localhost:5173/turnover-tracker/
http://127.0.0.1:5173/turnover-tracker/
https://sethtipton.github.io/turnover-tracker/
```

### Google OAuth

Enable Google in:

```text
Authentication
→ Sign In / Providers
→ Google
```

Create Google OAuth credentials.

Authorized redirect URI:

```text
https://gholbnyvijfyqdwqgjan.supabase.co/auth/v1/callback
```

Authorized JavaScript origins:

```text
http://localhost:5173
http://127.0.0.1:5173
https://sethtipton.github.io
```

Copy the Supabase project URL and publishable key into `.env.local`.

While the Google OAuth application is in testing mode, authorized family accounts must be added as Google test users.

### Workspace membership

Workspace access is stored in:

```text
public.workspace_members
```

The initial Tipton Rentals members are seeded by the schema and membership migration.

Roles currently include:

**Owners**

Can manage workspace membership and operational data.

**Editors**

Can update units, tasks, materials, and attachments.

**Viewers**

Have read-only access.

### OpenAI server credentials

Do not put an OpenAI key into a `VITE_` environment variable.

Required server-side values include:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_TRANSCRIPTION_MODEL
```

For hosted Supabase:

```bash
supabase secrets set \
  OPENAI_API_KEY="your-real-key" \
  OPENAI_MODEL="gpt-4.1-mini" \
  OPENAI_TRANSCRIPTION_MODEL="gpt-4o-transcribe" \
  --project-ref gholbnyvijfyqdwqgjan
```

Deploy functions with:

```bash
supabase functions deploy \
  draft-tasks \
  draft-listing-copy \
  process-maintenance-request \
  --project-ref gholbnyvijfyqdwqgjan
```

Deploy the public maintenance submission function with:

```bash
supabase functions deploy \
  submit-maintenance-request \
  --no-verify-jwt \
  --project-ref gholbnyvijfyqdwqgjan
```

`submit-maintenance-request` intentionally permits unauthenticated invocation because authorization is performed through the maintenance capability itself.

---

## 10. Deployment

The hosted application is available at:

```text
https://sethtipton.github.io/turnover-tracker/
```

Build locally with:

```bash
npm run build
```

Push the main branch:

```bash
git push origin main
```

GitHub Actions builds and deploys the application to GitHub Pages after pushes to `main`.

### GitHub-managed Supabase deployment

Add the following repository secrets under:

```text
GitHub
→ Settings
→ Secrets and variables
→ Actions
```

Required secrets:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_REF
OPENAI_API_KEY
```

Optional repository variables:

```text
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
```

The manual **Deploy Supabase Functions** workflow can then deploy the server-side functions.

---

## 11. Detailed Migrations / Operational Notes

### Maintenance case model

Apply:

```text
supabase/migrations/20260806160000_maintenance_requests.sql
```

before deploying the current maintenance processing pipeline.

This migration adds:

* unit-scoped tenant memberships,
* maintenance case files,
* immutable analyses,
* request-specific media,
* Row Level Security policies.

Tenant accounts are intentionally not normal workspace or property members.

Create an active:

```text
tenant_memberships
```

row for each tenant/unit relationship.

Internal users can open **Maintenance requests** and use the **Tenant view preview** without weakening tenant Row Level Security.

### Property administrator access

Apply:

```text
supabase/migrations/20260806170000_property_admin_maintenance_access.sql
```

A property-level `admin` can then access the maintenance console for authorized properties.

Property administrators see only their permitted:

* properties,
* units,
* maintenance requests.

Workspace-wide people and access controls remain unavailable.

### QR maintenance capabilities

Apply:

```text
supabase/migrations/20260807090000_maintenance_qr_codes.sql
supabase/migrations/20260807100000_maintenance_qr_function_grants.sql
supabase/migrations/20260813100000_public_maintenance_capabilities.sql
```

The final migration replaces the original plaintext maintenance-token implementation.

Legacy URLs such as:

```text
/m/:token/
```

are intentionally retired.

Existing printed cards therefore stop working and must be replaced.

The current route is:

```text
/maintenance/q/:long-random-token/
```

### QR generation and rotation

An administrator can generate or rotate a unit's code from **Maintenance requests**.

Generation:

1. creates a new 256-bit URL-safe secret,
2. hashes it with SHA-256,
3. stores only the hash,
4. returns the plaintext once to the current browser session.

Rotation invalidates the previous capability immediately.

Disabling a capability invalidates it without exposing operational records.

### QR request submission

The public page calls only:

```text
submit-maintenance-request
```

The server:

1. validates the capability,
2. resolves the property and unit,
3. validates incoming media,
4. generates trusted storage paths,
5. performs privileged writes.

The browser cannot directly select another unit or write to the protected maintenance tables.

### Tenant authentication

Authenticated tenant memberships remain supported for the signed-in tenant portal.

They are not required for QR-based intake.

Google OAuth remains the authentication mechanism for administrative accounts.

Possession of a QR capability does not create or imply a tenant identity.

### Current design constraints

The initial QR workflow intentionally does not provide a public request-status capability.

A QR capability permits submission of a new maintenance request for its assigned unit and nothing more.

This keeps the public authorization surface intentionally narrow.

---

## Project Goals

Turnover Tracker is intentionally built around more than CRUD screens.

The project explores how a modern web application can represent a real operational domain while keeping:

* system structure explicit,
* relationships queryable,
* authorization tied to scope,
* source information traceable,
* state transitions understandable,
* automated decisions reviewable,
* and the user interface separated from the underlying operational model.

The result is still a practical rental-management application, but the architecture is intended to remain understandable as the number of properties, users, workflows, and automated processes grows.
