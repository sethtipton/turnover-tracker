import { Check, Mic, ShieldCheck } from "lucide-react";

export function LandingPage({ onSignIn, setupMissing = false }) {
  return (
    <main className="landing" id="main-content" tabIndex="-1">
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Rental turnover command center</p>
          <h1>Walk the unit. Dictate the mess. Leave with a plan.</h1>
          <p>
            A simple family workspace for rental flips: tasks, shopping, collect/bring reminders,
            photos, audio, and a pending-review flow for AI-created work.
          </p>
          <button type="button" onClick={onSignIn} disabled={setupMissing}>Sign in with Google</button>
          {setupMissing && <p className="setup-note" role="status">Supabase environment variables are not configured yet.</p>}
        </div>
        <div className="hero-board" aria-label="Product preview">
          <div className="board-topline">
            <span>No property selected</span>
            <span>Pick a unit</span>
          </div>
          <div className="preview-row done"><Check size={16} aria-hidden="true" /> Patch hallway wall</div>
          <div className="preview-row">Buy white silicone caulk</div>
          <div className="preview-row">Collect drill, ladder, hinge jig</div>
          <div className="dictate-preview"><Mic size={18} aria-hidden="true" /> Dictate Tasks</div>
        </div>
      </section>
    </main>
  );
}

export function AccessGate({ email, onSignOut, message }) {
  return (
    <main className="gate" id="main-content" tabIndex="-1">
      <ShieldCheck size={34} aria-hidden="true" />
      <h1>Access is limited</h1>
      <p>{email} is signed in, but this account does not have access to the Tipton Rentals workspace.</p>
      {message && <p className="message" role="alert">{message}</p>}
      <button type="button" onClick={onSignOut}>Sign out</button>
    </main>
  );
}
