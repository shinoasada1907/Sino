// Copied from apps/sino-site/src/shared/ui/text.ts and icon.ts (web-public-pages, D-312); the only copy since sino-site was removed (tag sino-site-v0).

/** Canvas text styles the public pages repeat (`lp-h2`, `lp-lead`, `t-mono c-muted`, `micro-label`, `spec`). */
export const heading2 =
  'text-[30px] leading-9 font-bold tracking-[-0.03em] text-foreground md:text-[44px] md:leading-[52px]'
export const lead = 'max-w-140 text-base leading-[26px] text-muted-foreground md:text-[19px] md:leading-[30px]'
export const eyebrow = 'font-mono text-xs leading-4 font-medium text-muted-foreground tabular-nums'
export const microLabel = 'text-xs leading-4 font-semibold text-muted-foreground'
export const spec = 'font-mono text-[11px] leading-4 font-medium text-muted-foreground tabular-nums'

/** The page column (`lp-wrap`): 1312 px wide at most, 64 px gutters, 16 px on phones. */
export const wrap = 'mx-auto w-full max-w-[1312px] px-4 md:px-16'

/** Lucide icons as the canvas draws them: 1.6 px strokes, hidden from screen readers next to their label. */
export const ICON = { strokeWidth: 1.6, 'aria-hidden': true } as const
