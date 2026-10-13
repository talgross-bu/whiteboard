/*
 * The pictures a student's board can start from.  A template is not a
 * stroke: it is drawn underneath the ink, on its own layer, so neither
 * the eraser nor Clear board can take it away.  Like strokes, it is
 * drawn in 1200 by 900 board coordinates.
 */

import { draw_arrow_head, draw_straight_line } from './drawing-renderer.ts'

export const BOARD_TEMPLATES = [
  { id: 'blank', name: 'Blank' },
  { id: 'ltch', name: 'LTCH' },
  { id: 'fish', name: 'Fish' },
  { id: 'supply_demand', name: 'Supply & Demand' },
] as const

export type TemplateId = (typeof BOARD_TEMPLATES)[number]['id']

export function is_template_id(value: unknown): value is TemplateId {
  return BOARD_TEMPLATES.some((template) => template.id === value)
}

export function template_name(template_id: TemplateId): string {
  return BOARD_TEMPLATES.find((template) => template.id === template_id)?.name ?? 'Blank'
}

/* Dark gray, so the template reads as the page rather than as ink. */
const TEMPLATE_COLOR = '#444444'
const TEMPLATE_LINE_WIDTH = 4
const TEMPLATE_FONT_SIZE = 34

const ORIGIN = { x: 170, y: 760 }
const HORIZONTAL_AXIS_END = { x: 1110, y: 760 }
const VERTICAL_AXIS_END = { x: 170, y: 150 }
const PLOT_MIDPOINT_X = (ORIGIN.x + HORIZONTAL_AXIS_END.x) / 2

export function render_template(
  context: CanvasRenderingContext2D,
  template_id: TemplateId,
  scale: number,
): void {
  if (template_id === 'blank') return

  context.save()
  context.scale(scale, scale)
  context.lineCap = 'round'
  context.lineJoin = 'round'

  switch (template_id) {
    case 'ltch':
      draw_axes(context, 'Length of stay', 'Total reimbursement')
      break
    case 'fish':
      draw_axes(context, 'Time', 'Average prices')
      draw_dashed_marker(context, 'Cell phones become available')
      break
    case 'supply_demand':
      draw_axes(context, 'Quantity', '$')
      break
  }

  context.restore()
}

/* The vertical-axis label sits level above the axis, so it reads without
 * tilting one's head. */
function draw_axes(
  context: CanvasRenderingContext2D,
  horizontal_label: string,
  vertical_label: string,
): void {
  for (const axis_end of [HORIZONTAL_AXIS_END, VERTICAL_AXIS_END]) {
    draw_straight_line(context, ORIGIN, axis_end, TEMPLATE_COLOR, TEMPLATE_LINE_WIDTH)
    draw_arrow_head(context, ORIGIN, axis_end, TEMPLATE_COLOR, TEMPLATE_LINE_WIDTH)
  }

  draw_text(context, horizontal_label, PLOT_MIDPOINT_X, ORIGIN.y + 60, 'center')
  draw_text(context, vertical_label, VERTICAL_AXIS_END.x - 12, VERTICAL_AXIS_END.y - 35, 'left')
}

/* A dashed vertical line half way along the horizontal axis, labelled at the top. */
function draw_dashed_marker(context: CanvasRenderingContext2D, label: string): void {
  const top_y = VERTICAL_AXIS_END.y + 40

  context.save()
  context.setLineDash([18, 14])
  context.lineCap = 'butt'
  draw_straight_line(
    context,
    { x: PLOT_MIDPOINT_X, y: ORIGIN.y },
    { x: PLOT_MIDPOINT_X, y: top_y },
    TEMPLATE_COLOR,
    TEMPLATE_LINE_WIDTH,
  )
  context.restore()

  draw_text(context, label, PLOT_MIDPOINT_X, top_y - 18, 'center')
}

function draw_text(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  alignment: CanvasTextAlign,
): void {
  context.fillStyle = TEMPLATE_COLOR
  context.font = `${TEMPLATE_FONT_SIZE}px system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`
  context.textAlign = alignment
  context.textBaseline = 'alphabetic'
  context.fillText(text, x, y)
}
