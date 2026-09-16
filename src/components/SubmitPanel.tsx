/*
 * The name field and the Submit button, plus whatever the database last
 * had to say about the attempt.
 */

export type SubmissionPhase = 'idle' | 'saving' | 'saved' | 'error'

interface SubmitPanelProperties {
  spokesperson_name: string
  on_spokesperson_name_change: (name: string) => void
  phase: SubmissionPhase
  message: string
  has_unsent_changes: boolean
  has_submitted_before: boolean
  on_submit: () => void
}

export function SubmitPanel({
  spokesperson_name,
  on_spokesperson_name_change,
  phase,
  message,
  has_unsent_changes,
  has_submitted_before,
  on_submit,
}: SubmitPanelProperties) {
  const button_label = phase === 'saving'
    ? 'Sending…'
    : phase === 'error'
      ? 'Retry'
      : has_submitted_before
        ? 'Update submission'
        : 'Submit'

  return (
    <div className="submit-panel">
      <label className="submit-panel__name">
        <span className="submit-panel__name-label">Spokesperson name</span>
        <input
          type="text"
          value={spokesperson_name}
          maxLength={100}
          required
          autoComplete="name"
          placeholder="Who is presenting?"
          onChange={(event) => on_spokesperson_name_change(event.target.value)}
        />
      </label>

      <button
        type="button"
        className="submit-panel__button"
        disabled={phase === 'saving'}
        onClick={on_submit}
      >
        {button_label}
      </button>

      {message && (
        <p
          className={`submit-panel__message submit-panel__message--${phase}`}
          role={phase === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      )}

      {phase === 'saved' && has_unsent_changes && (
        <p className="submit-panel__message submit-panel__message--idle" role="status">
          You have drawn more since then. Press Update submission to send the changes.
        </p>
      )}
    </div>
  )
}
