import type { Color } from '../core/chess/game'

const PIECES = [
  { p: 'q', name: 'Dame', w: '♕', b: '♛' },
  { p: 'r', name: 'Turm', w: '♖', b: '♜' },
  { p: 'b', name: 'Läufer', w: '♗', b: '♝' },
  { p: 'n', name: 'Springer', w: '♘', b: '♞' },
]

export function PromotionDialog({ color, onSelect, onCancel }: { color: Color; onSelect: (p: string) => void; onCancel: () => void }) {
  return (
    <div className="promotion-backdrop" onClick={onCancel}>
      <div className="promotion-dialog" role="dialog" aria-label="Umwandlung wählen" onClick={(e) => e.stopPropagation()}>
        <p>Umwandeln in:</p>
        <div className="promotion-options">
          {PIECES.map(({ p, name, w, b }) => (
            <button key={p} type="button" aria-label={name} title={name} onClick={() => onSelect(p)}>
              {color === 'w' ? w : b}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
