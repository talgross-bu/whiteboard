/*
 * The padlock at the foot of the student page.
 *
 * The password is compared against a constant compiled into the site, so
 * anyone who reads the source can find it.  That is understood: this keeps
 * students from wandering into the gallery, and nothing more.
 */

import { useState } from 'react'
import { INSTRUCTOR_PASSWORD } from '../whiteboard-configuration.ts'

interface InstructorPadlockProperties {
  on_unlock: () => void
}

export function InstructorPadlock({ on_unlock }: InstructorPadlockProperties) {
  const [is_asking, set_is_asking] = useState(false)
  const [entered_password, set_entered_password] = useState('')
  const [error, set_error] = useState('')

  function attempt_unlock(event: React.FormEvent) {
    event.preventDefault()
    if (entered_password === INSTRUCTOR_PASSWORD) {
      on_unlock()
      return
    }
    set_error('That is not the password.')
    set_entered_password('')
  }

  if (!is_asking) {
    return (
      <div className="padlock">
        <button
          type="button"
          className="padlock__button"
          aria-label="Instructor view"
          onClick={() => set_is_asking(true)}
        >
          <span aria-hidden="true">🔒</span>
        </button>
      </div>
    )
  }

  return (
    <div className="padlock">
      <form className="padlock__form" onSubmit={attempt_unlock}>
        <label className="padlock__label" htmlFor="instructor-password">
          Instructor password
        </label>
        <input
          id="instructor-password"
          type="password"
          autoFocus
          autoComplete="off"
          value={entered_password}
          onChange={(event) => {
            set_entered_password(event.target.value)
            set_error('')
          }}
        />
        <button type="submit" className="padlock__submit">
          Unlock
        </button>
        <button
          type="button"
          className="padlock__submit"
          onClick={() => {
            set_is_asking(false)
            set_entered_password('')
            set_error('')
          }}
        >
          Cancel
        </button>
        {error && (
          <p className="padlock__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
