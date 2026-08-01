# Turnover Tracker

Turnover Tracker is a small rental turnover app built as a public portfolio/demo project with a private family workspace behind Google sign-in.

## Stack

- Vite + React
- Supabase Auth, Postgres, and Storage
- GitHub Pages for static hosting

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with the Supabase project URL and anon/publishable key.

## Supabase Setup

1. Create a Supabase project named `Turnover Tracker`.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. Enable Google auth in Authentication > Providers.
4. Add these redirect URLs in Authentication > URL Configuration:
   - `http://localhost:5173/`
   - `https://sethtipton.github.io/turnover-tracker/`
5. Copy the project URL and anon/publishable key into `.env.local`.

## Deploy

The app is configured for GitHub Pages at:

```text
https://sethtipton.github.io/turnover-tracker/
```

```bash
npm run build
npm run deploy
```
