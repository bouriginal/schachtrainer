import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Chessboard, type Arrow } from 'react-chessboard'
import { isPromotionMove, legalTargets, type Color } from '../core/chess/game'
import { detectMoveEvent } from '../core/chess/moveEvent'
import { playMoveSound } from './feedback'
import { PromotionDialog } from './PromotionDialog'

export interface BoardArrow {
  from: string
  to: string
  color?: string
}

export type BoardHighlight = 'danger' | 'good' | 'plan'

export interface BoardProps {
  fen: string
  orientation: 'white' | 'black'
  /** Welche Farbe darf der Nutzer bewegen? null = keine Eingabe */
  movableColor: Color | null
  /** gibt true zurück, wenn der Zug angenommen wurde */
  onMove: (from: string, to: string, promotion?: string) => boolean
  lastMove?: { from: string; to: string } | null
  checkSquare?: string | null
  arrows?: BoardArrow[]
  /** zusätzliche Feldmarkierungen, z. B. vom Coach */
  highlights?: Record<string, BoardHighlight>
  /** Zuggeräusche abspielen (Standard: ja; global abschaltbar in den Einstellungen) */
  sound?: boolean
}

const COLORS = {
  light: '#eeeed2',
  dark: '#769656',
  lastMove: 'rgba(255, 213, 0, 0.42)',
  selected: 'rgba(20, 85, 200, 0.45)',
  danger: 'rgba(220, 38, 38, 0.5)',
  good: 'rgba(22, 163, 74, 0.45)',
  plan: 'rgba(37, 99, 235, 0.38)',
  check: 'radial-gradient(circle, rgba(230,0,0,0.85) 0%, rgba(230,0,0,0.35) 45%, transparent 75%)',
}

/**
 * Adapter um react-chessboard. Der Rest der App kennt nur diese Schnittstelle,
 * damit die Brett-Bibliothek austauschbar bleibt.
 * Unterstützt Ziehen sowie Tippen–Tippen (wichtig fürs Handy).
 */
export function Board({ fen, orientation, movableColor, onMove, lastMove, checkSquare, arrows = [], highlights = {}, sound = true }: BoardProps) {
  // Geräusch, wenn sich die Stellung um genau einen Zug ändert
  const soundFen = useRef(fen)
  useEffect(() => {
    const prev = soundFen.current
    soundFen.current = fen
    if (!sound || prev === fen) return
    const ev = detectMoveEvent(prev, fen)
    if (ev) playMoveSound(ev)
  }, [fen, sound])

  const [selected, setSelected] = useState<string | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null)
  const turn = fen.split(' ')[1] as Color
  const canMove = movableColor !== null && movableColor === turn

  // Auswahl zurücksetzen, wenn sich die Stellung ändert (React-Muster: State während des Renderns anpassen)
  const [prevFen, setPrevFen] = useState(fen)
  if (prevFen !== fen) {
    setPrevFen(fen)
    setSelected(null)
    setPendingPromotion(null)
  }

  const targets = useMemo(() => (selected ? legalTargets(fen, selected) : []), [fen, selected])

  const tryMove = (from: string, to: string): boolean => {
    if (!canMove) return false
    if (isPromotionMove(fen, from, to)) {
      setPendingPromotion({ from, to })
      setSelected(null)
      return false
    }
    const ok = onMove(from, to)
    setSelected(null)
    return ok
  }

  const ownPieceOn = (pieceType: string | undefined) => !!pieceType && pieceType[0] === turn

  const squareStyles: Record<string, CSSProperties> = {}
  const add = (sq: string, style: CSSProperties) => {
    squareStyles[sq] = { ...squareStyles[sq], ...style }
  }
  if (lastMove) {
    add(lastMove.from, { backgroundColor: COLORS.lastMove })
    add(lastMove.to, { backgroundColor: COLORS.lastMove })
  }
  for (const [sq, kind] of Object.entries(highlights)) add(sq, { backgroundColor: COLORS[kind] })
  if (checkSquare) add(checkSquare, { background: COLORS.check })
  if (selected) add(selected, { backgroundColor: COLORS.selected })
  for (const t of targets) {
    add(t, {
      backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.22) 22%, transparent 24%)',
      cursor: 'pointer',
    })
  }

  const boardArrows: Arrow[] = arrows.map((a) => ({
    startSquare: a.from,
    endSquare: a.to,
    color: a.color ?? 'rgba(0, 120, 255, 0.7)',
  }))

  return (
    <div className="board-wrap">
      <Chessboard
        options={{
          id: 'trainer-board',
          position: fen,
          boardOrientation: orientation,
          lightSquareStyle: { backgroundColor: COLORS.light },
          darkSquareStyle: { backgroundColor: COLORS.dark },
          squareStyles,
          arrows: boardArrows,
          allowDrawingArrows: true,
          clearArrowsOnPositionChange: true,
          animationDurationInMs: 180,
          allowDragging: canMove,
          canDragPiece: ({ piece }) => canMove && ownPieceOn(piece.pieceType),
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            targetSquare ? tryMove(sourceSquare, targetSquare) : false,
          onSquareClick: ({ square, piece }) => {
            if (!canMove) return
            if (selected && targets.includes(square as never)) {
              tryMove(selected, square)
            } else if (ownPieceOn(piece?.pieceType)) {
              setSelected(square === selected ? null : square)
            } else {
              setSelected(null)
            }
          },
        }}
      />
      {pendingPromotion && (
        <PromotionDialog
          color={turn}
          onSelect={(p) => {
            const { from, to } = pendingPromotion
            setPendingPromotion(null)
            onMove(from, to, p)
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </div>
  )
}
