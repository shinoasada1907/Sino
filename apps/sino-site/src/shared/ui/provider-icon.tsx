import { cn } from '@/shared/lib/utils'

// Provider marks of the "Sino UI" canvas (stroke icons that follow the text colour).
const PATHS: Record<string, string[]> = {
  gmail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
  zalo: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  messenger: ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z', 'm8 13 3-3 2.5 2L16 9.5'],
  google: [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    'm9 12 2 2 4-4',
  ],
  telegram: [
    'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z',
    'm21.854 2.147-10.94 10.939',
  ],
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
