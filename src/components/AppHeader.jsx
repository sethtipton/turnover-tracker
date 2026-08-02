import { ClipboardList, LogOut, Mic } from "lucide-react";

export function AppHeader({
  scopeTitle,
  hasSelectedProperty,
  workMode,
  onToggleWorkMode,
  dictationState,
  audioLevel,
  onStartDictation,
  onStopDictation,
  onSignOut,
}) {
  const isRecording = dictationState === "recording";

  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Turnover Tracker</p>
        <h1 id="app-title">{scopeTitle || "Turnover Tracker"}</h1>
      </div>
      <div className="header-actions" aria-label="Workspace actions">
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
            <ClipboardList size={17} aria-hidden="true" />
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
    </header>
  );
}
