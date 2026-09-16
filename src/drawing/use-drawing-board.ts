/*
 * Holds everything about the drawing itself: the strokes, the tool
 * settings, and the undo history.  History is kept as whole snapshots of
 * the stroke list, which costs almost nothing here and means Clear board
 * is undoable by exactly the same mechanism as everything else.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { BoardPoint, Stroke, ToolName } from './drawing-types.ts'
import { ERASER_WIDTH_MULTIPLIER, INK_COLORS, INK_THICKNESSES } from '../whiteboard-configuration.ts'

const MAXIMUM_HISTORY_SNAPSHOTS = 50

/** Pointer samples closer together than this add nothing but weight. */
const MINIMUM_POINT_SEPARATION_IN_BOARD_PIXELS = 1.5

export interface DrawingBoard {
  strokes: Stroke[]
  stroke_in_progress: Stroke | null

  tool: ToolName
  color: string
  thickness: number
  set_tool: (tool: ToolName) => void
  set_color: (color: string) => void
  set_thickness: (thickness: number) => void

  can_undo: boolean
  can_redo: boolean
  undo: () => void
  redo: () => void
  clear_board: () => void

  begin_stroke: (point: BoardPoint) => void
  extend_stroke: (point: BoardPoint) => void
  finish_stroke: () => void
  cancel_stroke: () => void
  add_label: (anchor: BoardPoint, text: string) => void

  replace_all_strokes: (strokes: Stroke[]) => void
}

export function use_drawing_board(): DrawingBoard {
  const [history, set_history] = useState<Stroke[][]>([[]])
  const [history_index, set_history_index] = useState(0)
  const [stroke_in_progress, set_stroke_in_progress] = useState<Stroke | null>(null)

  const [tool, set_tool] = useState<ToolName>('pen')
  const [color, set_color] = useState<string>(INK_COLORS[0].value)
  const [thickness, set_thickness] = useState<number>(INK_THICKNESSES[1].value)

  // Read during pointer moves, where waiting for a re-render would drop points.
  const stroke_in_progress_ref = useRef<Stroke | null>(null)

  const strokes = history[history_index]

  // Anything after the current position is a redo branch the student has
  // now abandoned, so it is dropped before the new snapshot is appended.
  const commit = useCallback(
    (next_strokes: Stroke[]) => {
      const kept_and_grown = [...history.slice(0, history_index + 1), next_strokes]
      const trimmed = kept_and_grown.slice(
        Math.max(0, kept_and_grown.length - MAXIMUM_HISTORY_SNAPSHOTS),
      )
      set_history(trimmed)
      set_history_index(trimmed.length - 1)
    },
    [history, history_index],
  )

  const begin_stroke = useCallback(
    (point: BoardPoint) => {
      // A label is typed rather than dragged, so it never becomes a
      // stroke in progress; the canvas opens a text box instead.
      if (tool === 'label') return

      const started: Stroke =
        tool === 'pen' || tool === 'eraser'
          ? {
              kind: tool,
              points: [point],
              color,
              width: tool === 'eraser' ? thickness * ERASER_WIDTH_MULTIPLIER : thickness,
            }
          : { kind: tool, from: point, to: point, color, width: thickness }

      stroke_in_progress_ref.current = started
      set_stroke_in_progress(started)
    },
    [tool, color, thickness],
  )

  const extend_stroke = useCallback((point: BoardPoint) => {
    const current = stroke_in_progress_ref.current
    if (!current) return

    if (current.kind === 'pen' || current.kind === 'eraser') {
      const last_point = current.points[current.points.length - 1]
      const distance = Math.hypot(point.x - last_point.x, point.y - last_point.y)
      if (distance < MINIMUM_POINT_SEPARATION_IN_BOARD_PIXELS) return

      const extended: Stroke = { ...current, points: [...current.points, point] }
      stroke_in_progress_ref.current = extended
      set_stroke_in_progress(extended)
      return
    }

    // A label is never dragged, so only a line or an arrow can be here.
    if (current.kind !== 'line' && current.kind !== 'arrow') return

    const redirected: Stroke = { ...current, to: point }
    stroke_in_progress_ref.current = redirected
    set_stroke_in_progress(redirected)
  }, [])

  const finish_stroke = useCallback(() => {
    const finished = stroke_in_progress_ref.current
    stroke_in_progress_ref.current = null
    set_stroke_in_progress(null)
    if (!finished) return

    // A straight line or arrow that never moved is an accidental tap.
    if (
      (finished.kind === 'line' || finished.kind === 'arrow') &&
      finished.from.x === finished.to.x &&
      finished.from.y === finished.to.y
    ) {
      return
    }

    commit([...strokes, finished])
  }, [commit, strokes])

  const cancel_stroke = useCallback(() => {
    stroke_in_progress_ref.current = null
    set_stroke_in_progress(null)
  }, [])

  const add_label = useCallback(
    (anchor: BoardPoint, text: string) => {
      const trimmed = text.trim()
      if (trimmed.length === 0) return
      commit([...strokes, { kind: 'label', anchor, text: trimmed, color, width: thickness }])
    },
    [commit, strokes, color, thickness],
  )

  const undo = useCallback(() => {
    set_history_index((index) => Math.max(0, index - 1))
  }, [])

  const redo = useCallback(() => {
    set_history_index((index) => Math.min(history.length - 1, index + 1))
  }, [history.length])

  const clear_board = useCallback(() => {
    commit([])
  }, [commit])

  const replace_all_strokes = useCallback((restored: Stroke[]) => {
    set_history([restored])
    set_history_index(0)
  }, [])

  return useMemo(
    () => ({
      strokes,
      stroke_in_progress,
      tool,
      color,
      thickness,
      set_tool,
      set_color,
      set_thickness,
      can_undo: history_index > 0,
      can_redo: history_index < history.length - 1,
      undo,
      redo,
      clear_board,
      begin_stroke,
      extend_stroke,
      finish_stroke,
      cancel_stroke,
      add_label,
      replace_all_strokes,
    }),
    [
      strokes,
      stroke_in_progress,
      tool,
      color,
      thickness,
      history_index,
      history.length,
      undo,
      redo,
      clear_board,
      begin_stroke,
      extend_stroke,
      finish_stroke,
      cancel_stroke,
      add_label,
      replace_all_strokes,
    ],
  )
}
