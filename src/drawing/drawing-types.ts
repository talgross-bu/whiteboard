/*
 * The board is a list of strokes, and the canvas is nothing more than a
 * picture of that list.  Every coordinate below is in board space --
 * 1200 by 900 -- never in screen pixels, which is what lets a drawing
 * survive a resize, a rotation, and the jump to export resolution.
 */

export interface BoardPoint {
  x: number
  y: number
}

/** Freehand ink, and the eraser, which is freehand ink that removes. */
export interface FreehandStroke {
  kind: 'pen' | 'eraser'
  points: BoardPoint[]
  color: string
  width: number
}

/** A straight line or an arrow, both defined by where the drag began and ended. */
export interface StraightStroke {
  kind: 'line' | 'arrow'
  from: BoardPoint
  to: BoardPoint
  color: string
  width: number
}

/** A typed label, anchored at its left baseline. */
export interface LabelStroke {
  kind: 'label'
  anchor: BoardPoint
  text: string
  color: string
  width: number
}

export type Stroke = FreehandStroke | StraightStroke | LabelStroke

export type ToolName = Stroke['kind']

export function is_board_empty(strokes: Stroke[]): boolean {
  return strokes.length === 0
}
