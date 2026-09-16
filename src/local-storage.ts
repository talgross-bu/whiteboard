/*
 * Everything this app keeps in the browser, in one place.  The draft and
 * the name survive a refresh; the instructor's unlocked state deliberately
 * does not outlive the tab.
 *
 * Private browsing modes can make storage throw, so every read and write
 * is guarded.  Losing a draft is a nuisance; a blank page is worse.
 */

import type { Stroke } from './drawing/drawing-types.ts'

const SPOKESPERSON_NAME_KEY = 'whiteboard.spokesperson_name'
const DRAFT_STROKES_KEY = 'whiteboard.draft_strokes'
const BROWSER_SUBMISSION_ID_KEY = 'whiteboard.browser_submission_id'
const LAST_SUBMITTED_GENERATION_KEY = 'whiteboard.last_submitted_generation'
const INSTRUCTOR_UNLOCKED_KEY = 'whiteboard.instructor_unlocked'

function read_local(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write_local(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* Storage is full or blocked; the drawing still works. */
  }
}

/* ---------- The spokesperson's name ---------- */

export function load_spokesperson_name(): string {
  return read_local(SPOKESPERSON_NAME_KEY) ?? ''
}

export function save_spokesperson_name(name: string): void {
  write_local(SPOKESPERSON_NAME_KEY, name)
}

/* ---------- The editable draft ---------- */

export function load_draft_strokes(): Stroke[] {
  const stored = read_local(DRAFT_STROKES_KEY)
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? (parsed as Stroke[]) : []
  } catch {
    return []
  }
}

export function save_draft_strokes(strokes: Stroke[]): void {
  write_local(DRAFT_STROKES_KEY, JSON.stringify(strokes))
}

/* ---------- This browser's identity in the gallery ---------- */

/**
 * A random identifier minted once and kept forever.  It is what makes
 * "Update submission" replace this browser's drawing and nobody else's,
 * and what keeps two students called Sam in two separate entries.
 */
export function load_or_create_browser_submission_id(): string {
  const existing = read_local(BROWSER_SUBMISSION_ID_KEY)
  if (existing) return existing

  const minted = crypto.randomUUID()
  write_local(BROWSER_SUBMISSION_ID_KEY, minted)
  return minted
}

/* ---------- Which gallery the last submission belonged to ---------- */

export function load_last_submitted_generation(): number | null {
  const stored = read_local(LAST_SUBMITTED_GENERATION_KEY)
  if (stored === null) return null
  const parsed = Number(stored)
  return Number.isFinite(parsed) ? parsed : null
}

export function save_last_submitted_generation(generation: number): void {
  write_local(LAST_SUBMITTED_GENERATION_KEY, String(generation))
}

export function forget_last_submitted_generation(): void {
  try {
    window.localStorage.removeItem(LAST_SUBMITTED_GENERATION_KEY)
  } catch {
    /* Nothing to do. */
  }
}

/* ---------- The instructor's unlocked state, for this tab only ---------- */

export function is_instructor_unlocked(): boolean {
  try {
    return window.sessionStorage.getItem(INSTRUCTOR_UNLOCKED_KEY) === 'yes'
  } catch {
    return false
  }
}

export function set_instructor_unlocked(unlocked: boolean): void {
  try {
    if (unlocked) window.sessionStorage.setItem(INSTRUCTOR_UNLOCKED_KEY, 'yes')
    else window.sessionStorage.removeItem(INSTRUCTOR_UNLOCKED_KEY)
  } catch {
    /* Nothing to do. */
  }
}
