import type { ProviderInfo, ProviderKind, ProviderType } from '@/shared/domain'

/** The fields of one provider of `GET /api/providers` every screen reads; `kind` is absent on a backend before f05c. */
export interface ProviderEntry {
  type: ProviderType
  displayName: string
  kind?: ProviderKind
}

/** A provider without a kind counts as email, as the backend counts one it has no connector for (f05c, D-308). */
export function toProviderInfo({ type, displayName, kind }: ProviderEntry): ProviderInfo {
  return { type, displayName, kind: kind ?? 'EMAIL' }
}
