import { LogIn, LogOut, Sparkles, UsersRound } from "lucide-react";

export function AppFooter({
  authenticated = false,
  onAuthAction,
  authActionLabel,
  isWorkspaceOwner = false,
  peopleAccessOpen = false,
  onTogglePeopleAccess,
  maintenanceOpen = false,
  onToggleMaintenance,
  canOpenMaintenance = false,
}) {
  const label = authActionLabel || (authenticated ? "Sign out" : "Sign in");
  const Icon = authenticated ? LogOut : LogIn;

  return (
    <footer className={authenticated ? "app-footer" : "public-footer"}>
      {authenticated && isWorkspaceOwner && (
        <button
          className={peopleAccessOpen ? "people-access-button active" : "people-access-button"}
          type="button"
          onClick={onTogglePeopleAccess}
          aria-pressed={peopleAccessOpen}
        >
          <UsersRound size={17} aria-hidden="true" />
          People &amp; Access
        </button>
      )}
      {authenticated && canOpenMaintenance && (
        <button
          className={maintenanceOpen ? "people-access-button active" : "people-access-button"}
          type="button"
          onClick={onToggleMaintenance}
          aria-pressed={maintenanceOpen}
        >
          <Sparkles size={17} aria-hidden="true" />
          Maintenance requests
        </button>
      )}
      <button type="button" className="footer-auth-button" onClick={onAuthAction}>
        <Icon size={17} aria-hidden="true" />
        {label}
      </button>
    </footer>
  );
}
