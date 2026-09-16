/*
 * Chooses between the student page and the instructor gallery.
 *
 * There is no router.  Which view is showing is ordinary state backed by
 * sessionStorage, so a refresh keeps the instructor where they were and
 * GitHub Pages never has to rewrite a URL it does not know about.
 */

import { useState } from 'react'
import { StudentPage } from './components/StudentPage.tsx'
import { InstructorPadlock } from './components/InstructorPadlock.tsx'
import { InstructorGallery } from './components/InstructorGallery.tsx'
import { is_instructor_unlocked, set_instructor_unlocked } from './local-storage.ts'

export function App() {
  const [instructor_unlocked, set_unlocked_state] = useState(is_instructor_unlocked)

  function unlock() {
    set_instructor_unlocked(true)
    set_unlocked_state(true)
  }

  function lock() {
    set_instructor_unlocked(false)
    set_unlocked_state(false)
  }

  if (instructor_unlocked) {
    return <InstructorGallery on_lock={lock} />
  }

  return (
    <>
      <StudentPage />
      <InstructorPadlock on_unlock={unlock} />
    </>
  )
}
