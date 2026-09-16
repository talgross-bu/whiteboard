/*
 * One drawing, filling the screen, for talking through in class.
 *
 * The overlay already covers the whole viewport on its own, so the browser
 * refusing to go truly full screen -- which iPhone Safari always does --
 * costs nothing but the browser's own toolbars.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GalleryEntry } from '../neon-client.ts'
import { fetch_full_image } from '../neon-client.ts'

interface PresentationViewProperties {
  entries: GalleryEntry[]
  selected_id: string
  on_select: (browser_submission_id: string) => void
  on_close: () => void
}

export function PresentationView({
  entries,
  selected_id,
  on_select,
  on_close,
}: PresentationViewProperties) {
  const overlay_ref = useRef<HTMLDivElement | null>(null)
  const [full_png_base64, set_full_png_base64] = useState<string | null>(null)
  const [loading_problem, set_loading_problem] = useState('')
  const [fullscreen_is_unavailable, set_fullscreen_is_unavailable] = useState(false)

  const selected_index = entries.findIndex((entry) => entry.browser_submission_id === selected_id)
  const selected_entry = selected_index >= 0 ? entries[selected_index] : undefined

  const show_neighbour = useCallback(
    (step: number) => {
      if (entries.length === 0 || selected_index < 0) return
      const next_index = (selected_index + step + entries.length) % entries.length
      on_select(entries[next_index].browser_submission_id)
    },
    [entries, selected_index, on_select],
  )

  /* Fetch the full-size image only when one is actually being shown. */
  useEffect(() => {
    let this_request_is_current = true
    set_full_png_base64(null)
    set_loading_problem('')

    fetch_full_image(selected_id)
      .then((result) => {
        if (!this_request_is_current) return
        if (result.result_status === 'found') set_full_png_base64(result.full_png_base64)
        else set_loading_problem('That drawing is no longer in the gallery.')
      })
      .catch(() => {
        if (this_request_is_current) set_loading_problem('Could not load that drawing.')
      })

    return () => {
      this_request_is_current = false
    }
  }, [selected_id])

  /* Keyboard navigation. */
  useEffect(() => {
    function handle_key(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        on_close()
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        show_neighbour(1)
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        show_neighbour(-1)
      }
    }

    window.addEventListener('keydown', handle_key)
    return () => window.removeEventListener('keydown', handle_key)
  }, [on_close, show_neighbour])

  async function request_fullscreen() {
    const overlay = overlay_ref.current
    if (!overlay || typeof overlay.requestFullscreen !== 'function') {
      set_fullscreen_is_unavailable(true)
      return
    }
    try {
      await overlay.requestFullscreen()
    } catch {
      set_fullscreen_is_unavailable(true)
    }
  }

  return (
    <div className="presentation" ref={overlay_ref} role="dialog" aria-modal="true" aria-label="Presenting a drawing">
      <div className="presentation__bar">
        <h2 className="presentation__name">{selected_entry?.spokesperson_name ?? 'Drawing'}</h2>
        <span className="presentation__counter">
          {selected_index >= 0 ? `${selected_index + 1} of ${entries.length}` : ''}
        </span>

        <div className="presentation__controls">
          <button type="button" onClick={() => show_neighbour(-1)} aria-label="Previous drawing">
            ‹ Previous
          </button>
          <button type="button" onClick={() => show_neighbour(1)} aria-label="Next drawing">
            Next ›
          </button>
          {fullscreen_is_unavailable ? (
            <span className="presentation__note">
              This browser will not go full screen; the drawing already fills the window.
            </span>
          ) : (
            <button type="button" onClick={request_fullscreen} aria-label="Full screen">
              Full screen
            </button>
          )}
          <button type="button" onClick={on_close} aria-label="Close presentation">
            Close
          </button>
        </div>
      </div>

      <div className="presentation__stage">
        {full_png_base64 && (
          <img
            className="presentation__image"
            src={`data:image/png;base64,${full_png_base64}`}
            alt={`Drawing by ${selected_entry?.spokesperson_name ?? 'a group'}`}
          />
        )}
        {!full_png_base64 && !loading_problem && <p className="presentation__note">Loading…</p>}
        {loading_problem && (
          <p className="presentation__note" role="alert">
            {loading_problem}
          </p>
        )}
      </div>
    </div>
  )
}
