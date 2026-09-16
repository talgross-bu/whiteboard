/*
 * The board the student draws on.  It is a transparent canvas over a white
 * panel, so the eraser can cut holes in the ink without cutting a hole in
 * the background.  Pointer positions are converted straight into board
 * coordinates, which is why a resize or a rotation changes nothing.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BoardPoint } from '../drawing/drawing-types.ts'
import type { DrawingBoard } from '../drawing/use-drawing-board.ts'
import { render_strokes, LABEL_FONT_SIZE_MULTIPLIER } from '../drawing/drawing-renderer.ts'
import { BOARD_WIDTH_IN_PIXELS, BOARD_HEIGHT_IN_PIXELS } from '../whiteboard-configuration.ts'

const MAXIMUM_LABEL_CHARACTERS = 80

interface DrawingCanvasProperties {
  board: DrawingBoard
}

export function DrawingCanvas({ board }: DrawingCanvasProperties) {
  const canvas_ref = useRef<HTMLCanvasElement | null>(null)
  const [canvas_size, set_canvas_size] = useState({ width: 0, height: 0 })
  const [label_anchor, set_label_anchor] = useState<BoardPoint | null>(null)
  const [label_text, set_label_text] = useState('')

  /* Keep the canvas backing store matched to its displayed size.
   *
   * A ResizeObserver catches the layout changing underneath the board, but
   * it stops being delivered while a tab is in the background, so a phone
   * rotated with the page hidden would come back mismatched.  Listening for
   * window resize and orientation changes as well covers that. */
  useLayoutEffect(() => {
    function measure() {
      const canvas = canvas_ref.current
      if (!canvas) return
      const box = canvas.getBoundingClientRect()
      set_canvas_size((previous) =>
        previous.width === box.width && previous.height === box.height
          ? previous
          : { width: box.width, height: box.height },
      )
    }

    measure()

    const observer = new ResizeObserver(measure)
    if (canvas_ref.current) observer.observe(canvas_ref.current)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  /* Redraw whenever the strokes or the size change. */
  useEffect(() => {
    const canvas = canvas_ref.current
    if (!canvas || canvas_size.width === 0) return

    // Assigning width or height wipes the canvas and reallocates its
    // backing store, so only do it when the size has actually changed.
    const device_pixel_ratio = window.devicePixelRatio || 1
    const wanted_width = Math.round(canvas_size.width * device_pixel_ratio)
    const wanted_height = Math.round(canvas_size.height * device_pixel_ratio)
    if (canvas.width !== wanted_width) canvas.width = wanted_width
    if (canvas.height !== wanted_height) canvas.height = wanted_height

    const context = canvas.getContext('2d')
    if (!context) return

    context.clearRect(0, 0, canvas.width, canvas.height)

    const visible_strokes = board.stroke_in_progress
      ? [...board.strokes, board.stroke_in_progress]
      : board.strokes

    render_strokes(context, visible_strokes, canvas.width / BOARD_WIDTH_IN_PIXELS)
  }, [board.strokes, board.stroke_in_progress, canvas_size])

  const board_point_from_event = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - box.left) / box.width) * BOARD_WIDTH_IN_PIXELS,
      y: ((event.clientY - box.top) / box.height) * BOARD_HEIGHT_IN_PIXELS,
    }
  }, [])

  const commit_label = useCallback(() => {
    if (label_anchor) board.add_label(label_anchor, label_text)
    set_label_anchor(null)
    set_label_text('')
  }, [board, label_anchor, label_text])

  function handle_pointer_down(event: React.PointerEvent<HTMLCanvasElement>) {
    // Only the primary contact draws, so a resting palm or a second finger
    // cannot start a second stroke.
    if (!event.isPrimary) return
    event.preventDefault()

    // A label being typed is committed by tapping elsewhere on the board.
    if (label_anchor) {
      commit_label()
      return
    }

    const point = board_point_from_event(event)

    if (board.tool === 'label') {
      set_label_anchor(point)
      set_label_text('')
      return
    }

    // Capture keeps the stroke alive if the finger strays off the board.
    // Some browsers throw if the pointer has already gone; losing capture
    // is survivable, so it must not take the stroke down with it.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* Drawing continues without capture. */
    }

    board.begin_stroke(point)
  }

  function handle_pointer_move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!event.isPrimary) return
    // extend_stroke ignores moves when no stroke is under way. Asking it
    // rather than asking React state matters: the first moves of a quick
    // flick arrive before the state from pointerdown has been applied, and
    // gating on state would drop the start of the stroke.
    event.preventDefault()
    board.extend_stroke(board_point_from_event(event))
  }

  function handle_pointer_up(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!event.isPrimary) return
    event.preventDefault()
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      /* The pointer was already gone. */
    }
    board.finish_stroke()
  }

  /* Where to float the text box, in the canvas's own percentage terms. */
  const label_box_style: React.CSSProperties | undefined = label_anchor
    ? {
        left: `${(label_anchor.x / BOARD_WIDTH_IN_PIXELS) * 100}%`,
        top: `${(label_anchor.y / BOARD_HEIGHT_IN_PIXELS) * 100}%`,
        fontSize: `${((board.thickness * LABEL_FONT_SIZE_MULTIPLIER) / BOARD_HEIGHT_IN_PIXELS) * canvas_size.height}px`,
        color: board.color,
      }
    : undefined

  return (
    <div className="drawing-board">
      <canvas
        ref={canvas_ref}
        className="drawing-board__canvas"
        role="img"
        aria-label={`Drawing board, ${board.strokes.length} marks so far`}
        onPointerDown={handle_pointer_down}
        onPointerMove={handle_pointer_move}
        onPointerUp={handle_pointer_up}
        onPointerCancel={() => board.cancel_stroke()}
        onContextMenu={(event) => event.preventDefault()}
      />

      {label_anchor && (
        <input
          className="drawing-board__label-input"
          style={label_box_style}
          autoFocus
          value={label_text}
          maxLength={MAXIMUM_LABEL_CHARACTERS}
          aria-label="Label text. Press Enter to place it on the board."
          placeholder="Type a label"
          onChange={(event) => set_label_text(event.target.value)}
          onBlur={commit_label}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit_label()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              set_label_anchor(null)
              set_label_text('')
            }
          }}
        />
      )}
    </div>
  )
}
