import { LogIn, LogOut, UsersRound } from "lucide-react";

export function AppFooter({
  authenticated = false,
  onAuthAction,
  isWorkspaceOwner = false,
  peopleAccessOpen = false,
  onTogglePeopleAccess,
}) {
  const label = authenticated ? "Sign out" : "Sign in";
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
      <button type="button" className="footer-auth-button" onClick={onAuthAction}>
        <Icon size={17} aria-hidden="true" />
        {label}
      </button>
    </footer>
  );
}
