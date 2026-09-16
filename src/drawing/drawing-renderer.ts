/*
 * Draws a list of strokes onto a canvas.  This one function is used both
 * for the board the student is looking at and for the 1200 by 900 PNG
 * that gets submitted, which is why the two always agree.
 */

import type { Stroke } from './drawing-types.ts'
import { BOARD_WIDTH_IN_PIXELS, BOARD_HEIGHT_IN_PIXELS } from '../whiteboard-configuration.ts'

/** A label's stored width is its thickness setting; this turns it into a font size. */
export const LABEL_FONT_SIZE_MULTIPLIER = 4

const ARROW_HEAD_ANGLE_IN_RADIANS = Math.PI / 7

export function render_strokes(
  context: CanvasRenderingContext2D,
  strokes: Stroke[],
  scale: number,
): void {
  context.save()
  context.scale(scale, scale)
  context.lineCap = 'round'
  context.lineJoin = 'round'

  for (const stroke of strokes) {
    // The eraser takes ink away rather than adding white, so that a board
    // exported onto a white background still looks rubbed out rather than
    // painted over.
    context.globalCompositeOperation = stroke.kind === 'eraser' ? 'destination-out' : 'source-over'

    switch (stroke.kind) {
      case 'pen':
      case 'eraser':
        draw_freehand(context, stroke.points, stroke.color, stroke.width)
        break
      case 'line':
        draw_straight_line(context, stroke.from, stroke.to, stroke.color, stroke.width)
        break
      case 'arrow':
        draw_straight_line(context, stroke.from, stroke.to, stroke.color, stroke.width)
        draw_arrow_head(context, stroke.from, stroke.to, stroke.color, stroke.width)
        break
      case 'label':
        draw_label(context, stroke.anchor, stroke.text, stroke.color, stroke.width)
        break
    }
  }

  context.globalCompositeOperation = 'source-over'
  context.restore()
}

function draw_freehand(
  context: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  color: string,
  width: number,
): void {
  if (points.length === 0) return

  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = width

  // A single tap should still leave a dot.
  if (points.length === 1) {
    context.beginPath()
    context.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2)
    context.fill()
    return
  }

  // Quadratic segments through the midpoints round off the corners that
  // raw pointer samples would otherwise leave behind.
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length - 1; index += 1) {
    const midpoint_x = (points[index].x + points[index + 1].x) / 2
    const midpoint_y = (points[index].y + points[index + 1].y) / 2
    context.quadraticCurveTo(points[index].x, points[index].y, midpoint_x, midpoint_y)
  }
  const last_point = points[points.length - 1]
  context.lineTo(last_point.x, last_point.y)
  context.stroke()
}

function draw_straight_line(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  width: number,
): void {
  context.strokeStyle = color
  context.lineWidth = width
  context.beginPath()
  context.moveTo(from.x, from.y)
  context.lineTo(to.x, to.y)
  context.stroke()
}

function draw_arrow_head(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  width: number,
): void {
  const direction = Math.atan2(to.y - from.y, to.x - from.x)
  const head_length = Math.max(width * 3.5, 16)

  context.strokeStyle = color
  context.lineWidth = width
  context.beginPath()
  context.moveTo(to.x, to.y)
  context.lineTo(
    to.x - head_length * Math.cos(direction - ARROW_HEAD_ANGLE_IN_RADIANS),
    to.y - head_length * Math.sin(direction - ARROW_HEAD_ANGLE_IN_RADIANS),
  )
  context.moveTo(to.x, to.y)
  context.lineTo(
    to.x - head_length * Math.cos(direction + ARROW_HEAD_ANGLE_IN_RADIANS),
    to.y - head_length * Math.sin(direction + ARROW_HEAD_ANGLE_IN_RADIANS),
  )
  context.stroke()
}

function draw_label(
  context: CanvasRenderingContext2D,
  anchor: { x: number; y: number },
  text: string,
  color: string,
  width: number,
): void {
  // fillText draws characters, never markup, so label text cannot become
  // anything other than the literal characters the student typed.
  context.fillStyle = color
  context.font = `${width * LABEL_FONT_SIZE_MULTIPLIER}px system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillText(text, anchor.x, anchor.y)
}

function new_canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser did not provide a 2D drawing context.')
  return [canvas, context]
}

/**
 * Replays the strokes at full export resolution onto a white background
 * and hands back the PNG as base64, without the data-URL prefix.
 *
 * The ink goes on a transparent layer first.  Erasing works by cutting
 * holes out of what is already drawn, so if the white background shared
 * that layer the eraser would cut holes in the background too and the
 * exported PNG would come out see-through.
 */
export function render_strokes_to_png_base64(
  strokes: Stroke[],
  output_width: number,
  output_height: number,
): string {
  const [ink_layer, ink_context] = new_canvas(output_width, output_height)
  render_strokes(ink_context, strokes, output_width / BOARD_WIDTH_IN_PIXELS)

  const [output_canvas, output_context] = new_canvas(output_width, output_height)
  output_context.fillStyle = '#FFFFFF'
  output_context.fillRect(0, 0, output_width, output_height)
  output_context.drawImage(ink_layer, 0, 0)

  return output_canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
}

export const BOARD_ASPECT_RATIO = BOARD_WIDTH_IN_PIXELS / BOARD_HEIGHT_IN_PIXELS
