import { LogOut, Mic, UsersRound, Wrench } from "lucide-react";
import {
  getPropertyImage,
  getPropertyImageTransitionName,
  getPropertyTitleTransitionName,
} from "../lib/propertyImages";

export function AppHeader({
  property,
  scopeTitle,
  hasSelectedProperty,
  workMode,
  onToggleWorkMode,
  dictationState,
  audioLevel,
  onStartDictation,
  onStopDictation,
  onSignOut,
  isWorkspaceOwner,
  peopleAccessOpen,
  onTogglePeopleAccess,
  scopeSelector,
}) {
  const isRecording = dictationState === "recording";
  const propertyImage = getPropertyImage(property?.name);
  const headerClassName = [
    "app-header",
    propertyImage && "has-property-image",
    scopeSelector && "has-scope-selector",
  ].filter(Boolean).join(" ");

  return (
    <header className={headerClassName}>
      {propertyImage && (
        <div
          className="app-header-property-image"
          style={{ viewTransitionName: getPropertyImageTransitionName(property.id) }}
        >
          <img src={propertyImage} alt="" width="1024" height="768" />
        </div>
      )}
      <div className="app-header-identity">
        <h1
          id="app-title"
          tabIndex="-1"
          style={{ viewTransitionName: getPropertyTitleTransitionName(property?.id) }}
        >
          {scopeTitle || "Turnover Tracker"}
        </h1>
      </div>
      <div className="header-actions" aria-label="Workspace actions">
        {isWorkspaceOwner && !workMode && !hasSelectedProperty && (
          <button
            className={peopleAccessOpen ? "people-access-button active" : "people-access-button"}
            type="button"
            onClick={onTogglePeopleAccess}
            aria-pressed={peopleAccessOpen}
          >
            <UsersRound size={18} aria-hidden="true" />
            <span className="action-label">People &amp; Access</span>
          </button>
        )}
        {!workMode && hasSelectedProperty && (
          <div className="dictation-control">
            <button
              className={isRecording ? "recording" : ""}
              type="button"
              onClick={isRecording ? onStopDictation : onStartDictation}
              aria-describedby={isRecording ? "recording-status" : undefined}
            >
              <Mic size={18} aria-hidden="true" />
              <span className="action-label">{isRecording ? "Stop recording" : "Dictate Tasks"}</span>
            </button>
            {isRecording && (
              <div
                className="audio-meter"
                role="progressbar"
                aria-label="Microphone input level"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={Math.round(audioLevel * 100)}
              >
                <span style={{ transform: `scaleX(${Math.max(0.04, audioLevel)})` }} />
              </div>
            )}
            {isRecording && <span className="visually-hidden" id="recording-status">Recording is in progress.</span>}
          </div>
        )}
        {hasSelectedProperty && (
          <button
            className={workMode ? "work-mode-button active" : "work-mode-button"}
            type="button"
            onClick={onToggleWorkMode}
            aria-pressed={workMode}
          >
            <Wrench size={18} aria-hidden="true" />
            <span className="action-label">Work Mode</span>
          </button>
        )}
        {!workMode && (
          <button className="ghost sign-out-button" type="button" onClick={onSignOut} aria-label="Sign out">
            <LogOut size={17} aria-hidden="true" />
            <span className="action-label">Sign out</span>
          </button>
        )}
      </div>
      {scopeSelector}
    </header>
  );
}
