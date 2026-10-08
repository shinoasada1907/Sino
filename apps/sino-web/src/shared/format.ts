// Text helpers shared by the screens.
import type { ProviderInfo } from './domain'

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "1.284" */
export function formatCount(value: number): string {
  return value.toLocaleString('vi-VN')
}

/** Lower case without Vietnamese marks, for searching: "Nguyễn Đức" → "nguyen duc". */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}

export type ProviderNameOf = (type: string) => string

/** Looks up a provider name in the catalog; an unknown code is shown capitalized. */
export function providerNameOf(providers: ProviderInfo[]): ProviderNameOf {
  const names = new Map(providers.map((provider) => [provider.type, provider.displayName]))
  return (type) => names.get(type) ?? capitalize(type)
}

const METHOD_LABELS: Record<string, string> = {
  google: 'Google',
  email: 'Email',
  facebook: 'Facebook',
  zalo: 'Zalo',
  apple: 'Apple',
  github: 'GitHub',
}

/** A sign-in method of a registration: "google" → "Google". */
export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? capitalize(method)
}
