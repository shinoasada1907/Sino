import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { cancelQrConnect, fetchQrStatus, startInitialSync, startQrConnect, withFirstImport } from './accounts.api'
import type { AccountsData } from './accounts.types'
import { DEFAULT_SYNC_OPTIONS, type QrChallenge, type QrConnectStatus } from './connect.types'
import { ACCOUNTS_QUERY_KEY } from './useAccounts'

interface ActiveQrLogin {
  provider: string
  accountId: string | null
  challenge: QrChallenge
}

export interface QrDoneEvent {
  accountId: string
  reconnected: boolean
  provider: string
  displayName?: string
}

/**
 * Drives the QR connect flow (ZL-11, D-275, D-288): starts a QR login, polls every 2 s while `WAITING` or `SCANNED`,
 * starts the initial sync with `range: 'ALL'` when a new account finishes (`reconnected: false`), and cancels the
 * pending login with `DELETE` if the dialog closes before completion.
 */
export function useQrConnect(onDone: (event: QrDoneEvent) => void) {
  const queryClient = useQueryClient()
  const [active, setActive] = useState<ActiveQrLogin | null>(null)
  const lastScannedNameRef = useRef<string | undefined>(undefined)
  const handledRef = useRef<string | null>(null)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  })

  const startMutation = useMutation({
    mutationFn: ({ provider, accountId }: { provider: string; accountId: string | null }) => startQrConnect(provider, accountId),
    onMutate: () => {
      setActive(null)
      lastScannedNameRef.current = undefined
    },
    onSuccess: (challenge, { provider, accountId }) => {
      setActive({ provider, accountId, challenge })
    },
  })

  const statusQuery = useQuery<QrConnectStatus>({
    queryKey: ['qr-connect', active?.provider, active?.challenge.loginId],
    queryFn: () => fetchQrStatus(active!.provider, active!.challenge.loginId),
    enabled: active !== null,
    refetchInterval: (query) => {
      const state = query.state.data?.state
      return !state || state === 'WAITING' || state === 'SCANNED' ? 2000 : false
    },
  })

  const status = statusQuery.data

  useEffect(() => {
    if (status?.displayName) {
      lastScannedNameRef.current = status.displayName
    }
    if (!active || status?.state !== 'DONE' || !status.accountId) {
      return
    }
    const { loginId } = active.challenge
    if (handledRef.current === loginId) {
      return
    }
    handledRef.current = loginId
    const { provider } = active
    const accountId = status.accountId
    const reconnected = Boolean(status.reconnected)
    const displayName = status.displayName ?? lastScannedNameRef.current
    setActive(null)

    void (async () => {
      if (!reconnected) {
        const importStatus = await startInitialSync(accountId, { ...DEFAULT_SYNC_OPTIONS, range: 'ALL' }).catch(() => null)
        if (importStatus) {
          queryClient.setQueryData<AccountsData>(ACCOUNTS_QUERY_KEY, (list) =>
            list && {
              ...list,
              accounts: list.accounts.map((account) => (account.id === accountId ? withFirstImport(account, importStatus) : account)),
            },
          )
        }
      }
      await queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY })
      onDoneRef.current({ accountId, reconnected, provider, displayName })
    })()
  }, [active, queryClient, status])

  const cancel = () => {
    if (active && status?.state !== 'DONE') {
      const { provider, challenge } = active
      setActive(null)
      startMutation.reset()
      void cancelQrConnect(provider, challenge.loginId).catch(() => {})
      return
    }
    setActive(null)
    startMutation.reset()
  }

  return {
    challenge: active?.challenge ?? null,
    status: status ?? (active ? { state: 'WAITING' as const } : null),
    starting: startMutation.isPending,
    startFailed: startMutation.isError,
    start: (provider: string, accountId: string | null) => startMutation.mutate({ provider, accountId }),
    cancel,
  }
}
