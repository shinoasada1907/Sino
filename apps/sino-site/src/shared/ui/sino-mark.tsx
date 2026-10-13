// The Sino logo mark ("S và ô", chosen by the user on 2026-10-02); it takes the text colour.
function SinoMark({ className }: { className?: string }) {
  return (
    <svg data-slot="sino-mark" viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path d="M21 6A9 9 0 0 0 21 24H27A9 9 0 1 1 18 33" fill="none" stroke="currentColor" strokeWidth="7" />
      <rect x="24" y="1.5" width="9" height="9" rx="2.5" fill="currentColor" />
    </svg>
  )
}

export { SinoMark }
