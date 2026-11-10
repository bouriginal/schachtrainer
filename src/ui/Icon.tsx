/** Schlichte Linien-Icons für die Tab-Leiste (24×24, Strichfarbe = Textfarbe). */
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5',
  play: 'M4 4h16v16H4zM4 12h16M12 4v16M8 8h0M16 16h0',
  book: 'M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5V19',
  bolt: 'M13 3 5 13.5h6L10 21l8-10.5h-6z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.6a7.6 7.6 0 0 1-2 1.2L14.9 21h-3.6l-.4-2a7.6 7.6 0 0 1-2-1.2l-1.9.6-1.8-3.1 1.6-1.2a7.7 7.7 0 0 1 0-2.4L4.6 9.5l1.8-3.1 1.9.6a7.6 7.6 0 0 1 2-1.2l.4-2h3.6l.4 2a7.6 7.6 0 0 1 2 1.2l1.9-.6 1.8 3.1-1.6 1.2a7.7 7.7 0 0 1 0 2.4z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
