import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SETTINGS_SAMPLE, type SettingsSample } from './settings.sample'

const SETTINGS_KEY = ['settings', 'sample'] as const

/**
 * The sample settings and a way to change them (fe-ui-settings, D-394). They live in the query cache, so a change stays
 * while moving between the settings page and its sub-pages, and goes with a reload; nothing is sent or saved.
 */
export function useSettingsSample() {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => structuredClone(SETTINGS_SAMPLE),
    initialData: () => structuredClone(SETTINGS_SAMPLE),
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return {
    settings: data,
    update: (change: Partial<SettingsSample>) => queryClient.setQueryData<SettingsSample>(SETTINGS_KEY, (current) => ({ ...(current ?? data), ...change })),
  }
}
