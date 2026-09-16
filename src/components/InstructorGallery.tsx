/*
 * Everything the instructor does: watch the drawings arrive, open one up
 * to talk through, open and close submissions, and clear the board.
 *
 * The polling loop fetches only the lightweight index, then asks for the
 * thumbnails that have actually changed, so a gallery of sixty-five
 * drawings costs a few hundred bytes every five seconds once it settles.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { PresentationView } from './PresentationView.tsx'
import {
  clear_all_drawings,
  fetch_gallery_index,
  fetch_thumbnails,
  fetch_whiteboard_status,
  set_submissions_open,
  type GalleryEntry,
} from '../neon-client.ts'
import { GALLERY_REFRESH_INTERVAL_IN_MILLISECONDS } from '../whiteboard-configuration.ts'

interface CachedThumbnail {
  thumbnail_png_base64: string
  last_updated_at: string
}

interface InstructorGalleryProperties {
  on_lock: () => void
}

export function InstructorGallery({ on_lock }: InstructorGalleryProperties) {
  const [entries, set_entries] = useState<GalleryEntry[]>([])
  const [thumbnails, set_thumbnails] = useState<Map<string, CachedThumbnail>>(new Map())
  const [submissions_are_open, set_submissions_are_open] = useState<boolean | null>(null)
  const [selected_id, set_selected_id] = useState<string | null>(null)
  const [problem, set_problem] = useState('')
  const [is_working, set_is_working] = useState(false)
  const [confirming_clear, set_confirming_clear] = useState(false)

  // Read inside the polling callback, which must not be rebuilt on every
  // thumbnail arrival or the interval would restart constantly.
  const thumbnails_ref = useRef(thumbnails)
  thumbnails_ref.current = thumbnails

  const refresh = useCallback(async () => {
    try {
      const [status, index] = await Promise.all([fetch_whiteboard_status(), fetch_gallery_index()])
      set_submissions_are_open(status.submissions_are_open)
      set_entries(index)
      set_problem('')

      const stale_ids = index
        .filter((entry) => {
          const cached = thumbnails_ref.current.get(entry.browser_submission_id)
          return !cached || cached.last_updated_at !== entry.last_updated_at
        })
        .map((entry) => entry.browser_submission_id)

      const live_ids = new Set(index.map((entry) => entry.browser_submission_id))
      const arrived = stale_ids.length > 0 ? await fetch_thumbnails(stale_ids) : []

      set_thumbnails((previous) => {
        const updated = new Map<string, CachedThumbnail>()
        // Drop anything no longer in the gallery, so a clear frees the memory.
        for (const [id, cached] of previous) {
          if (live_ids.has(id)) updated.set(id, cached)
        }
        for (const record of arrived) {
          updated.set(record.browser_submission_id, {
            thumbnail_png_base64: record.thumbnail_png_base64,
            last_updated_at: record.last_updated_at,
          })
        }
        return updated
      })
    } catch (failure) {
      set_problem(failure instanceof Error ? failure.message : 'Could not reach the gallery.')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /* Poll while the gallery is on screen and submissions are open. */
  useEffect(() => {
    if (submissions_are_open !== true) return

    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh()
    }, GALLERY_REFRESH_INTERVAL_IN_MILLISECONDS)

    return () => window.clearInterval(timer)
  }, [submissions_are_open, refresh])

  /* If the drawing being presented disappears, step out of the presentation. */
  useEffect(() => {
    if (selected_id && !entries.some((entry) => entry.browser_submission_id === selected_id)) {
      set_selected_id(null)
    }
  }, [entries, selected_id])

  async function run_operation(operation: () => Promise<unknown>) {
    if (is_working) return
    set_is_working(true)
    try {
      await operation()
      await refresh()
    } catch (failure) {
      set_problem(failure instanceof Error ? failure.message : 'That did not work.')
    } finally {
      set_is_working(false)
    }
  }

  return (
    <div className="instructor-gallery">
      <header className="instructor-gallery__header">
        <h1>Tal’s Whiteboard — gallery</h1>
        <p className="instructor-gallery__count" role="status">
          {entries.length === 1 ? '1 drawing' : `${entries.length} drawings`}
          {submissions_are_open === null
            ? ''
            : submissions_are_open
              ? ' · submissions open'
              : ' · submissions closed'}
        </p>

        <div className="instructor-gallery__controls">
          <button type="button" onClick={() => void refresh()} disabled={is_working}>
            Refresh
          </button>
          <button
            type="button"
            disabled={is_working || submissions_are_open === null}
            onClick={() =>
              void run_operation(() => set_submissions_open(!(submissions_are_open ?? false)))
            }
          >
            {submissions_are_open ? 'Close submissions' : 'Open submissions'}
          </button>
          <button
            type="button"
            disabled={is_working || entries.length === 0}
            onClick={() => set_confirming_clear(true)}
          >
            Clear all drawings
          </button>
          <button type="button" onClick={on_lock}>
            Lock instructor view
          </button>
        </div>

        {problem && (
          <p className="instructor-gallery__problem" role="alert">
            {problem}
          </p>
        )}
      </header>

      {confirming_clear && (
        <div className="confirm-bar" role="alertdialog" aria-label="Clear all drawings?">
          <p>
            Delete {entries.length === 1 ? 'the 1 drawing' : `all ${entries.length} drawings`} in the
            gallery? Students keep their own copies and can submit again.
          </p>
          <button
            type="button"
            className="confirm-bar__button confirm-bar__button--danger"
            onClick={() => {
              set_confirming_clear(false)
              void run_operation(clear_all_drawings)
            }}
          >
            Delete {entries.length}
          </button>
          <button
            type="button"
            className="confirm-bar__button"
            onClick={() => set_confirming_clear(false)}
          >
            Cancel
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="instructor-gallery__empty">No drawings yet.</p>
      ) : (
        <ul className="instructor-gallery__grid">
          {entries.map((entry) => {
            const cached = thumbnails.get(entry.browser_submission_id)
            return (
              <li key={entry.browser_submission_id}>
                <button
                  type="button"
                  className="gallery-card"
                  onClick={() => set_selected_id(entry.browser_submission_id)}
                >
                  <span className="gallery-card__name">{entry.spokesperson_name}</span>
                  {cached ? (
                    <img
                      className="gallery-card__image"
                      src={`data:image/png;base64,${cached.thumbnail_png_base64}`}
                      alt={`Drawing by ${entry.spokesperson_name}`}
                    />
                  ) : (
                    <span className="gallery-card__placeholder">Loading…</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {selected_id && (
        <PresentationView
          entries={entries}
          selected_id={selected_id}
          on_select={set_selected_id}
          on_close={() => set_selected_id(null)}
        />
      )}
    </div>
  )
}
