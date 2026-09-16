/*
 * What a student sees: a title, a name, a blank board, the tools, and
 * Submit.  Nothing is drawn on the board to begin with -- no grid, no
 * axes, no instructions.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { DrawingCanvas } from './DrawingCanvas.tsx'
import { ToolPalette } from './ToolPalette.tsx'
import { SubmitPanel, type SubmissionPhase } from './SubmitPanel.tsx'
import { use_drawing_board } from '../drawing/use-drawing-board.ts'
import { render_strokes_to_png_base64 } from '../drawing/drawing-renderer.ts'
import type { Stroke } from '../drawing/drawing-types.ts'
import { fetch_whiteboard_status, submit_drawing } from '../neon-client.ts'
import {
  load_draft_strokes,
  load_last_submitted_generation,
  load_or_create_browser_submission_id,
  load_spokesperson_name,
  save_draft_strokes,
  save_last_submitted_generation,
  save_spokesperson_name,
} from '../local-storage.ts'
import {
  BOARD_HEIGHT_IN_PIXELS,
  BOARD_WIDTH_IN_PIXELS,
  MAXIMUM_FULL_PNG_BASE64_CHARACTERS,
  MAXIMUM_THUMBNAIL_PNG_BASE64_CHARACTERS,
  THUMBNAIL_HEIGHT_IN_PIXELS,
  THUMBNAIL_WIDTH_IN_PIXELS,
} from '../whiteboard-configuration.ts'

/* Often enough that the board opening mid-class is noticed, rarely enough
 * that a full lecture hall does not hammer the database. */
const STATUS_POLL_INTERVAL_IN_MILLISECONDS = 15_000

const DRAFT_SAVE_DELAY_IN_MILLISECONDS = 400

export function StudentPage() {
  const board = use_drawing_board()

  const [spokesperson_name, set_spokesperson_name] = useState(load_spokesperson_name)
  const [phase, set_phase] = useState<SubmissionPhase>('idle')
  const [message, set_message] = useState('')
  const [submissions_are_open, set_submissions_are_open] = useState<boolean | null>(null)
  const [confirming_clear, set_confirming_clear] = useState(false)

  const browser_submission_id = useRef(load_or_create_browser_submission_id()).current

  /* The generation the gallery was on when this browser last looked. */
  const gallery_generation = useRef<number | null>(null)

  /* The exact stroke list that was last sent, so "unsent changes" is a
   * question of identity rather than a deep comparison. */
  const [submitted_strokes, set_submitted_strokes] = useState<Stroke[] | null>(null)

  const [has_submitted_before, set_has_submitted_before] = useState(false)

  /* ---------- Restore the draft once, on first render ---------- */

  const draft_has_been_restored = useRef(false)
  useEffect(() => {
    if (draft_has_been_restored.current) return
    draft_has_been_restored.current = true

    const draft = load_draft_strokes()
    if (draft.length > 0) board.replace_all_strokes(draft)
  }, [board])

  /* ---------- Keep the draft and the name saved ---------- */

  useEffect(() => {
    if (!draft_has_been_restored.current) return
    const timer = window.setTimeout(
      () => save_draft_strokes(board.strokes),
      DRAFT_SAVE_DELAY_IN_MILLISECONDS,
    )
    return () => window.clearTimeout(timer)
  }, [board.strokes])

  useEffect(() => {
    save_spokesperson_name(spokesperson_name)
  }, [spokesperson_name])

  /* ---------- Follow the open/closed setting ---------- */

  const refresh_status = useCallback(async () => {
    try {
      const status = await fetch_whiteboard_status()
      set_submissions_are_open(status.submissions_are_open)
      gallery_generation.current = status.gallery_generation

      // A submission from an earlier gallery is no longer on display.
      const last_submitted = load_last_submitted_generation()
      set_has_submitted_before(last_submitted === status.gallery_generation)
    } catch {
      /* Leave the last known state alone; Submit will report the truth. */
    }
  }, [])

  useEffect(() => {
    void refresh_status()

    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh_status()
    }, STATUS_POLL_INTERVAL_IN_MILLISECONDS)

    const on_visible = () => {
      if (!document.hidden) void refresh_status()
    }
    document.addEventListener('visibilitychange', on_visible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', on_visible)
    }
  }, [refresh_status])

  /* ---------- Submitting ---------- */

  const submitting_now = useRef(false)

  async function handle_submit() {
    // Two fast clicks should send one drawing, not two.
    if (submitting_now.current) return

    const trimmed_name = spokesperson_name.trim()
    if (trimmed_name.length === 0) {
      set_phase('error')
      set_message('Please type the spokesperson’s name before submitting.')
      return
    }

    submitting_now.current = true
    set_phase('saving')
    set_message('')

    // Hold on to exactly what is being sent, so later edits are detectable
    // even if the student keeps drawing while the request is in flight.
    const strokes_being_sent = board.strokes

    try {
      const full_png_base64 = render_strokes_to_png_base64(
        strokes_being_sent,
        BOARD_WIDTH_IN_PIXELS,
        BOARD_HEIGHT_IN_PIXELS,
      )
      const thumbnail_png_base64 = render_strokes_to_png_base64(
        strokes_being_sent,
        THUMBNAIL_WIDTH_IN_PIXELS,
        THUMBNAIL_HEIGHT_IN_PIXELS,
      )

      if (
        full_png_base64.length > MAXIMUM_FULL_PNG_BASE64_CHARACTERS ||
        thumbnail_png_base64.length > MAXIMUM_THUMBNAIL_PNG_BASE64_CHARACTERS
      ) {
        throw new Error(
          'This drawing is too large to send. Erasing some of it and trying again should fix it.',
        )
      }

      if (gallery_generation.current === null) await refresh_status()
      if (gallery_generation.current === null) {
        throw new Error('Could not reach the whiteboard. Check the connection and press Retry.')
      }

      const result = await submit_drawing({
        browser_submission_id,
        spokesperson_name: trimmed_name,
        full_png_base64,
        thumbnail_png_base64,
        gallery_generation: gallery_generation.current,
      })

      if (result.result_status === 'saved') {
        gallery_generation.current = result.gallery_generation
        save_last_submitted_generation(result.gallery_generation)
        set_has_submitted_before(true)
        set_submitted_strokes(strokes_being_sent)
        set_submissions_are_open(true)
        set_phase('saved')
        set_message(
          result.revision_number === 1
            ? 'Submitted. Your drawing is in the gallery.'
            : 'Updated. Your drawing in the gallery has been replaced.',
        )
        return
      }

      if (result.result_status === 'submissions_closed') {
        gallery_generation.current = result.gallery_generation
        set_submissions_are_open(false)
        set_phase('error')
        set_message('Submissions are closed right now. Your drawing is safe; try again when they reopen.')
        return
      }

      // The gallery was cleared while this drawing was being made, so the
      // save is deliberately refused rather than silently restoring it.
      gallery_generation.current = result.gallery_generation
      set_has_submitted_before(false)
      set_submitted_strokes(null)
      set_phase('error')
      set_message('The board was cleared for a new activity. Your drawing is still here — press Retry to send it to the new gallery.')
    } catch (problem) {
      set_phase('error')
      set_message(
        problem instanceof Error
          ? `${problem.message} Your drawing has not been lost.`
          : 'Something went wrong sending the drawing. Your drawing has not been lost.',
      )
    } finally {
      submitting_now.current = false
    }
  }

  /* ---------- Clearing the board ---------- */

  function handle_clear_request() {
    if (board.strokes.length === 0) {
      board.clear_board()
      return
    }
    set_confirming_clear(true)
  }

  const has_unsent_changes = submitted_strokes !== null && board.strokes !== submitted_strokes

  return (
    <div className="student-page">
      <header className="student-page__header">
        <h1>Tal’s Whiteboard</h1>
        {submissions_are_open === false && (
          <p className="student-page__status" role="status">
            Submissions are closed.
          </p>
        )}
      </header>

      <SubmitPanel
        spokesperson_name={spokesperson_name}
        on_spokesperson_name_change={set_spokesperson_name}
        phase={phase}
        message={message}
        has_unsent_changes={has_unsent_changes}
        has_submitted_before={has_submitted_before}
        on_submit={handle_submit}
      />

      <DrawingCanvas board={board} />

      <ToolPalette board={board} on_request_clear={handle_clear_request} />

      {confirming_clear && (
        <div className="confirm-bar" role="alertdialog" aria-label="Clear the board?">
          <p>Clear the whole board? Undo will bring it back.</p>
          <button
            type="button"
            className="confirm-bar__button confirm-bar__button--danger"
            onClick={() => {
              board.clear_board()
              set_confirming_clear(false)
            }}
          >
            Clear board
          </button>
          <button
            type="button"
            className="confirm-bar__button"
            onClick={() => set_confirming_clear(false)}
          >
            Keep drawing
          </button>
        </div>
      )}
    </div>
  )
}
