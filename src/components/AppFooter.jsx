import { LogIn, LogOut } from "lucide-react";

export function AppFooter({ authenticated = false, onAuthAction }) {
  const label = authenticated ? "Sign out" : "Sign in";
  const Icon = authenticated ? LogOut : LogIn;

  return (
    <footer className={authenticated ? "app-footer" : "public-footer"}>
      <button type="button" className="footer-auth-button" onClick={onAuthAction}>
        <Icon size={17} aria-hidden="true" />
        {label}
      </button>
    </footer>
  );
}
