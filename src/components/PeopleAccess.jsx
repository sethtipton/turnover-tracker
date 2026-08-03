import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, Save, ShieldCheck, UsersRound } from "lucide-react";

export function PeopleAccess({ members, properties, propertyMembers, busy, onClose, onSave }) {
  const [selectedEmail, setSelectedEmail] = useState("");
  const [selectedPropertyIds, setSelectedPropertyIds] = useState([]);

  useEffect(() => {
    if (!members.some((member) => member.email === selectedEmail)) {
      setSelectedEmail(members[0]?.email || "");
    }
  }, [members, selectedEmail]);

  useEffect(() => {
    const nextIds = propertyMembers
      .filter((member) => member.email === selectedEmail)
      .map((member) => member.property_id);
    setSelectedPropertyIds(nextIds);
  }, [propertyMembers, selectedEmail]);

  const selectedMember = members.find((member) => member.email === selectedEmail) || null;
  const assignedPropertyIds = useMemo(() => new Set(selectedPropertyIds), [selectedPropertyIds]);
  const isOwner = selectedMember?.role === "owner";

  function toggleProperty(propertyId) {
    setSelectedPropertyIds((current) => (
      current.includes(propertyId)
        ? current.filter((id) => id !== propertyId)
        : [...current, propertyId]
    ));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedMember) return;
    await onSave(selectedMember.email, selectedPropertyIds);
  }

  return (
    <section className="people-access" aria-labelledby="people-access-title">
      <header className="people-access-header">
        <div>
          <p className="eyebrow">Workspace administration</p>
          <h2 id="people-access-title"><UsersRound size={24} aria-hidden="true" /> People &amp; Access</h2>
        </div>
        <button className="ghost" type="button" onClick={onClose}>
          <ArrowLeft size={17} aria-hidden="true" /> Back to properties
        </button>
      </header>

      <div className="people-access-layout">
        <nav className="member-list" aria-label="Workspace members">
          {members.map((member) => (
            <button
              className={member.email === selectedEmail ? "active" : ""}
              type="button"
              key={member.id}
              aria-pressed={member.email === selectedEmail}
              onClick={() => setSelectedEmail(member.email)}
            >
              <span>{getMemberName(member.email)}</span>
              <small>{member.email}</small>
              <em>{member.role}</em>
            </button>
          ))}
        </nav>

        <form className="access-editor" onSubmit={handleSubmit}>
          {selectedMember ? (
            <>
              <div className="access-editor-heading">
                <div>
                  <h3>{getMemberName(selectedMember.email)}</h3>
                  <p>{selectedMember.email}</p>
                </div>
                {isOwner && <span className="owner-badge"><ShieldCheck size={16} aria-hidden="true" /> Workspace owner</span>}
              </div>

              <fieldset disabled={busy || isOwner}>
                <legend>Property access</legend>
                {isOwner && <p className="access-note">The workspace owner always retains access to every property.</p>}
                <div className="property-access-list">
                  {properties.map((property) => {
                    const isAssigned = isOwner || assignedPropertyIds.has(property.id);
                    return (
                      <label key={property.id} className={isAssigned ? "assigned" : ""}>
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          onChange={() => toggleProperty(property.id)}
                        />
                        <span>{property.name}</span>
                        <Check size={17} aria-hidden="true" />
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {!isOwner && (
                <div className="access-editor-actions">
                  <button type="submit" disabled={busy}>
                    {busy ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
                    Save access
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="empty">No workspace members are available.</p>
          )}
        </form>
      </div>
    </section>
  );
}

function getMemberName(email) {
  const username = email.split("@")[0] || email;
  return username
    .split(/[._-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
