import { cn } from '@/shared/lib/utils'

// Provider marks of the "Sino UI" canvas (stroke icons that follow the text colour).
const PATHS: Record<string, string[]> = {
  gmail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
  zalo: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  messenger: ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z', 'm8 13 3-3 2.5 2L16 9.5'],
}
const FALLBACK = ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z']

function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  return (
    <svg
      data-slot="provider-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('size-4.5 shrink-0', className)}
    >
      {(PATHS[provider] ?? FALLBACK).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

export { ProviderIcon }
