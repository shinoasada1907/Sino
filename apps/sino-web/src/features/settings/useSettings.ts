import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_SETTINGS, fetchSettings, fetchStorage, patchSettings, withChange, type SettingsChange, type UserSettings } from './settings.api'

export const SETTINGS_QUERY_KEY = ['settings'] as const
const STORAGE_QUERY_KEY = ['settings', 'storage'] as const
/** Which setting the last refused change was about; shared by every row, so the right one says so. */
const FAILURE_KEY = ['settings', 'failure'] as const

/** A setting as the rows name it: a field of the settings, or `notifications.<switch>` for one switch. */
export type SettingKey = Exclude<keyof SettingsChange, 'notifications'> | `notifications.${keyof UserSettings['notifications']}`

// The setting a change is about: its first field, or its first switch.
function keyOf(change: SettingsChange): SettingKey | null {
  const [switchName] = Object.keys(change.notifications ?? {})
  if (switchName) {
    return `notifications.${switchName}` as SettingKey
  }
  return (Object.keys(change)[0] as SettingKey | undefined) ?? null
}

/** The user's saved settings (settings-backend, D-405); `failed` while they cannot be read. */
export function useSettings() {
  const { data, isError, refetch } = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: fetchSettings, staleTime: Infinity })
  return { settings: data, failed: isError, retry: () => void refetch() }
}

/** The setting whose last change the server refused, until the next change. */
export function useSettingsFailure(): SettingKey | null {
  const { data } = useQuery<SettingKey | null>({ queryKey: FAILURE_KEY, queryFn: () => null, initialData: null, staleTime: Infinity })
  return data
}

/**
 * Saves a change (D-405): the screen shows it at once; the server's answer then stands, and a refusal puts the
 * settings back as they were and says which setting it was. Changes go one after another, in the order made.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient()
  const { mutate } = useMutation({
    scope: { id: 'settings' },
    mutationFn: patchSettings,
    onMutate: async (change: SettingsChange) => {
      queryClient.setQueryData(FAILURE_KEY, null)
      await queryClient.cancelQueries({ queryKey: SETTINGS_QUERY_KEY, exact: true })
      const before = queryClient.getQueryData<UserSettings>(SETTINGS_QUERY_KEY)
      if (before) {
        queryClient.setQueryData(SETTINGS_QUERY_KEY, withChange(before, change))
      }
      return { before }
    },
    onSuccess: (saved) => queryClient.setQueryData(SETTINGS_QUERY_KEY, saved),
    onError: (_error, change, context) => {
      if (context?.before) {
        queryClient.setQueryData(SETTINGS_QUERY_KEY, context.before)
      }
      queryClient.setQueryData(FAILURE_KEY, keyOf(change))
    },
  })
  return mutate
}

const NOT_SAVED = 'Không lưu được. Hãy thử lại.'

/**
 * What a section needs: the values (the defaults, locked, until the saved ones have come), a way to save a change, and
 * for a setting the sentence of its last refused change.
 */
export function useSettingValues() {
  const { settings } = useSettings()
  const update = useUpdateSettings()
  const failure = useSettingsFailure()
  return {
    values: settings ?? DEFAULT_SETTINGS,
    disabled: settings === undefined,
    update,
    errorOf: (key: SettingKey) => (failure === key ? NOT_SAVED : null),
  }
}

/** How much Sino keeps for the user (D-406). */
export function useStorageUse() {
  const { data, isError } = useQuery({ queryKey: STORAGE_QUERY_KEY, queryFn: fetchStorage, staleTime: 60_000 })
  return { storage: data, failed: isError }
}
