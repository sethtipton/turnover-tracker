import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Printer, QrCode, RefreshCw } from "lucide-react";
import { getMaintenanceQrUrl, isMaintenanceQrToken, regenerateUnitMaintenanceQr } from "../lib/maintenanceQr";

export function MaintenanceQrControls({ property, selectedUnit, propertyUnits }) {
  const dialogRef = useRef(null);
  const [overriddenTokens, setOverriddenTokens] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [printUnits, setPrintUnits] = useState([]);

  const unitsWithTokens = useMemo(() => propertyUnits
    .map((unit) => ({ ...unit, maintenance_qr_token: overriddenTokens[unit.id] || unit.maintenance_qr_token }))
    .filter((unit) => isMaintenanceQrToken(unit.maintenance_qr_token)), [overriddenTokens, propertyUnits]);
  const unit = selectedUnit
    ? { ...selectedUnit, maintenance_qr_token: overriddenTokens[selectedUnit.id] || selectedUnit.maintenance_qr_token }
    : null;
  const hasUnitCode = isMaintenanceQrToken(unit?.maintenance_qr_token);

  useEffect(() => {
    if (printUnits.length === 0) return undefined;
    const frame = window.requestAnimationFrame(() => window.print());
    function clearPrintSheet() {
      setPrintUnits([]);
    }
    window.addEventListener("afterprint", clearPrintSheet, { once: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", clearPrintSheet);
    };
  }, [printUnits]);

  async function copyUnitUrl() {
    if (!unit || !hasUnitCode) return;
    try {
      await navigator.clipboard.writeText(getMaintenanceQrUrl(unit.maintenance_qr_token));
      setMessage("Maintenance link copied.");
    } catch {
      setMessage("We couldn’t copy the link. Select it from the QR card instead.");
    }
  }

  async function regenerate() {
    if (!unit) return;
    setBusy(true);
    setMessage("");
    try {
      const token = await regenerateUnitMaintenanceQr(unit.id);
      setOverriddenTokens((current) => ({ ...current, [unit.id]: token }));
      setMessage("A new QR code is ready. Replace any printed copies of the old code.");
      dialogRef.current?.close();
    } catch (error) {
      setMessage(error.message || "We couldn’t regenerate this QR code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="maintenance-qr-controls" aria-labelledby="maintenance-qr-controls-title">
      <div className="maintenance-qr-controls-heading">
        <div>
          <p className="eyebrow">Unit access</p>
          <h3 id="maintenance-qr-controls-title"><QrCode size={20} aria-hidden="true" /> Maintenance QR codes</h3>
          <p>Each unit has a unique QR link that identifies its unit without exposing unit details. A scan confirms the code is valid, then requires sign-in; Supabase verifies the active tenant or property-admin relationship and locks the request to that property and unit. The token is stored on the unit, is unique, and regeneration immediately invalidates older printed cards. RLS also rejects copied-code or edited-payload requests for another unit.</p>
        </div>
        {unitsWithTokens.length > 0 && <button className="ghost" type="button" onClick={() => setPrintUnits(unitsWithTokens)}><Printer size={17} aria-hidden="true" /> Print all unit cards</button>}
      </div>

      {unit ? (
        hasUnitCode ? (
          <div className="maintenance-qr-unit-layout">
            <QrUnitCard property={property} unit={unit} />
            <div className="maintenance-qr-actions">
              <p><strong>{property.name} · {unit.name}</strong></p>
              <p className="maintenance-qr-url"><code>{getMaintenanceQrUrl(unit.maintenance_qr_token)}</code></p>
              <button type="button" onClick={copyUnitUrl}><Copy size={17} aria-hidden="true" /> Copy link</button>
              <button className="ghost" type="button" onClick={() => setPrintUnits([unit])}><Printer size={17} aria-hidden="true" /> Print this card</button>
              <button className="ghost maintenance-qr-regenerate" type="button" onClick={() => dialogRef.current?.showModal()}><RefreshCw size={17} aria-hidden="true" /> Regenerate QR code</button>
              <p className="maintenance-qr-note">Regeneration immediately invalidates this unit’s old printed code.</p>
            </div>
          </div>
        ) : <p className="maintenance-qr-note">This unit does not have a maintenance QR code yet. Apply the maintenance QR migration, then reload this page.</p>
      ) : (
        unitsWithTokens.length > 0 ? (
          <div className="maintenance-qr-card-list" aria-label={`${property.name} maintenance QR codes`}>
            {unitsWithTokens.map((propertyUnit) => <QrUnitCard key={propertyUnit.id} property={property} unit={propertyUnit} />)}
          </div>
        ) : <p className="maintenance-qr-note">This property does not have a maintenance QR code yet. Apply the maintenance QR migration, then reload this page.</p>
      )}

      {message && <p className="message" role="status">{message}</p>}

      <dialog ref={dialogRef} className="maintenance-qr-dialog" closedby="any" aria-labelledby="maintenance-qr-dialog-title">
        <form method="dialog" onSubmit={(event) => { event.preventDefault(); regenerate(); }}>
          <p className="eyebrow">Replace QR code</p>
          <h2 id="maintenance-qr-dialog-title">Regenerate {unit?.name}’s maintenance QR code?</h2>
          <p>The existing printed code will stop working immediately. Print and post the replacement before discarding the old card.</p>
          <div>
            <button className="ghost" type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
            <button type="submit" disabled={busy}>{busy ? "Regenerating…" : "Regenerate QR code"}</button>
          </div>
        </form>
      </dialog>

      {printUnits.length > 0 && <section className="maintenance-qr-print-sheet" aria-hidden="true">{printUnits.map((printUnit) => <QrUnitCard key={printUnit.id} property={property} unit={printUnit} printable />)}</section>}
    </section>
  );
}

function QrUnitCard({ property, unit, printable = false }) {
  const url = getMaintenanceQrUrl(unit.maintenance_qr_token);
  return (
    <article className={printable ? "maintenance-qr-card printable" : "maintenance-qr-card"}>
      <p className="maintenance-qr-brand">Tree City Rentals</p>
      <h4>{property.name}</h4>
      <p className="maintenance-qr-unit-name">Unit {unit.name}</p>
      <QRCodeSVG
        value={url}
        size={printable ? 204 : 172}
        level="M"
        marginSize={4}
        bgColor="#ffffff"
        fgColor="#122319"
        title={`Maintenance request QR code for ${property.name}, unit ${unit.name}`}
      />
      <p className="maintenance-qr-instruction">Scan to submit a maintenance request</p>
      <p className="maintenance-qr-path">{url}</p>
    </article>
  );
}
