/*
 * The row of drawing controls.  Every button is a real button with a real
 * label, large enough to hit with a finger.
 */

import type { ToolName } from '../drawing/drawing-types.ts'
import type { DrawingBoard } from '../drawing/use-drawing-board.ts'
import { INK_COLORS, INK_THICKNESSES } from '../whiteboard-configuration.ts'

const TOOLS: { name: ToolName; label: string; symbol: string }[] = [
  { name: 'pen', label: 'Pen', symbol: '✏️' },
  { name: 'line', label: 'Straight line', symbol: '╱' },
  { name: 'arrow', label: 'Arrow', symbol: '↗' },
  { name: 'label', label: 'Typed label', symbol: 'T' },
  { name: 'eraser', label: 'Eraser', symbol: '◻' },
]

interface ToolPaletteProperties {
  board: DrawingBoard
  on_request_clear: () => void
}

export function ToolPalette({ board, on_request_clear }: ToolPaletteProperties) {
  return (
    <div className="tool-palette">
      <div className="tool-palette__group" role="group" aria-label="Drawing tool">
        {TOOLS.map((tool) => (
          <button
            key={tool.name}
            type="button"
            className="tool-button"
            aria-label={tool.label}
            aria-pressed={board.tool === tool.name}
            onClick={() => board.set_tool(tool.name)}
          >
            <span aria-hidden="true">{tool.symbol}</span>
          </button>
        ))}
      </div>

      <div className="tool-palette__group" role="group" aria-label="Ink colour">
        {INK_COLORS.map((ink) => (
          <button
            key={ink.value}
            type="button"
            className="tool-button tool-button--color"
            aria-label={`${ink.name} ink`}
            aria-pressed={board.color === ink.value}
            onClick={() => board.set_color(ink.value)}
          >
            <span className="tool-button__swatch" style={{ background: ink.value }} aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="tool-palette__group" role="group" aria-label="Line thickness">
        {INK_THICKNESSES.map((option) => (
          <button
            key={option.value}
            type="button"
            className="tool-button"
            aria-label={`${option.name} line`}
            aria-pressed={board.thickness === option.value}
            onClick={() => board.set_thickness(option.value)}
          >
            <span
              className="tool-button__thickness"
              style={{ height: `${Math.max(2, option.value / 2)}px`, background: board.color }}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      <div className="tool-palette__group" role="group" aria-label="Board actions">
        <button
          type="button"
          className="tool-button tool-button--wide"
          aria-label="Undo"
          disabled={!board.can_undo}
          onClick={board.undo}
        >
          Undo
        </button>
        <button
          type="button"
          className="tool-button tool-button--wide"
          aria-label="Redo"
          disabled={!board.can_redo}
          onClick={board.redo}
        >
          Redo
        </button>
        <button
          type="button"
          className="tool-button tool-button--wide"
          aria-label="Clear board"
          onClick={on_request_clear}
        >
          Clear board
        </button>
      </div>
    </div>
  )
}
