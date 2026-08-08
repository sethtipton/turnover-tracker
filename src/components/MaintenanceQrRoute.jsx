import { useEffect, useState } from "react";
import { LogIn, ShieldAlert, Wrench } from "lucide-react";
import { submitMaintenanceRequest } from "../lib/maintenance";
import {
  getMyMaintenanceQrContext,
  isMaintenanceQrToken,
  resolvePublicMaintenanceQr,
} from "../lib/maintenanceQr";
import { getMaintenancePath } from "../lib/routing";
import { AppFooter } from "./AppFooter";
import { TenantRequestComposer } from "./TenantMaintenanceApp";

export function MaintenanceQrRoute({ token, user, onSignIn, onSignOut }) {
  const [state, setState] = useState({ kind: "loading", scope: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setState({ kind: "loading", scope: null });
    setMessage("");

    async function resolve() {
      if (!isMaintenanceQrToken(token)) {
        if (active) setState({ kind: "invalid", scope: null });
        return;
      }

      try {
        if (!user) {
          const valid = await resolvePublicMaintenanceQr(token);
          if (active) setState({ kind: valid ? "sign-in" : "invalid", scope: null });
          return;
        }

        const scope = await getMyMaintenanceQrContext(token);
        if (active) setState({ kind: scope ? "ready" : "not-authorized", scope });
      } catch {
        if (active) setState({ kind: "error", scope: null });
      }
    }

    resolve();
    return () => { active = false; };
  }, [token, user]);

  useEffect(() => {
    document.title = "Maintenance request | Tree City Rentals";
  }, []);

  async function handleSubmit({ description, audioFile, photoFiles }) {
    const scope = state.scope;
    if (!scope || !user) return;

    const isTenant = scope.access_role === "tenant";
    setBusy(true);
    setMessage("");
    try {
      await submitMaintenanceRequest({
        workspaceId: scope.workspace_id,
        propertyId: scope.property_id,
        unitId: scope.unit_id,
        tenantMembershipId: isTenant ? scope.tenant_membership_id : null,
        user,
        description,
        audioFile,
        photoFiles,
        sourceType: isTenant ? "tenant-qr" : "admin-qr",
        visibility: isTenant ? "tenant" : "admin",
      });
      setMessage("Request received. We’ll review it and keep you updated.");
    } catch (error) {
      setMessage(error.message?.startsWith("Request saved")
        ? error.message
        : "We couldn’t send that request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <a className="skip-link" href="#maintenance-qr-content">Skip to maintenance request</a>
      <main className="tenant-qr-shell" id="maintenance-qr-content" tabIndex="-1">
        <header className="tenant-qr-header">
          <p className="eyebrow">Tree City Rentals</p>
          <h1><Wrench size={25} aria-hidden="true" /> Submit a maintenance request</h1>
        </header>

        {state.kind === "loading" && <section className="tenant-qr-card"><p>Checking this maintenance link…</p></section>}

        {state.kind === "invalid" && (
          <section className="tenant-qr-card tenant-qr-empty">
            <ShieldAlert size={28} aria-hidden="true" />
            <h2>This maintenance QR code is no longer valid.</h2>
            <p>If you need to submit a maintenance request, sign in to your tenant account.</p>
            {!user && <button type="button" onClick={onSignIn}><LogIn size={17} aria-hidden="true" /> Sign in</button>}
          </section>
        )}

        {state.kind === "sign-in" && (
          <section className="tenant-qr-card tenant-qr-empty">
            <h2>Sign in to continue</h2>
            <p>Use the Google account connected to your rental home. We’ll bring you back to this maintenance request after sign-in.</p>
            <button type="button" onClick={onSignIn}><LogIn size={17} aria-hidden="true" /> Sign in</button>
          </section>
        )}

        {state.kind === "not-authorized" && (
          <section className="tenant-qr-card tenant-qr-empty">
            <ShieldAlert size={28} aria-hidden="true" />
            <h2>This isn’t your rental home.</h2>
            <p>For privacy, a maintenance request can only be submitted by the active tenant for this unit.</p>
            <a className="ghost" href={getMaintenancePath()}>Open my maintenance requests</a>
          </section>
        )}

        {state.kind === "error" && (
          <section className="tenant-qr-card tenant-qr-empty">
            <ShieldAlert size={28} aria-hidden="true" />
            <h2>We couldn’t open this maintenance request.</h2>
            <p>Please try scanning the code again. If the problem continues, sign in to your tenant account.</p>
          </section>
        )}

        {state.kind === "ready" && state.scope && (
          <>
            <section className="tenant-qr-card tenant-qr-scope" aria-labelledby="maintenance-qr-unit">
              <p className="eyebrow">{state.scope.access_role === "admin" ? "Property admin" : "Your rental home"}</p>
              <h2 id="maintenance-qr-unit">{state.scope.property_name} · {state.scope.unit_name}</h2>
              <p>This request will be sent directly to the team responsible for this unit.</p>
            </section>
            <TenantRequestComposer
              title="Describe the issue"
              propertyId={state.scope.property_id}
              unitId={state.scope.unit_id}
              busy={busy}
              onSubmit={handleSubmit}
              submitLabel="Submit request"
            />
            {message && <p className="message" role="status">{message}</p>}
            {state.scope.access_role === "tenant" && <p className="tenant-qr-alternate"><a href={getMaintenancePath()}>Not your unit? Open your maintenance requests.</a></p>}
          </>
        )}
      </main>
      {user && <AppFooter authenticated onAuthAction={onSignOut} />}
    </>
  );
}
