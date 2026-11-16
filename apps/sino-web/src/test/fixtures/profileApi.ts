import { http, HttpResponse } from 'msw'
import type { ProfileChange, UserProfile } from '@/features/profile/profile.types'

/**
 * The profile API of `sino-api` for the tests (profile-info, D-478, D-480): `GET` and `PATCH /api/profile`. What a test
 * saves is kept until `resetProfileBackend`. The checks are the backend's (name 1-200, phone characters and 30 long,
 * job title and place 100, bio 500; an unknown field is a 400), so a screen test sees the same `errors[].field`.
 * Not always on like the settings: a test adds it with `server.use(...profileHandlers)`.
 */
export const PROFILE: UserProfile = {
  email: 'an.nguyen@gmail.com',
  displayName: 'An Nguyễn',
  phoneNumber: '+84 912 345 678',
  jobTitle: 'Chủ cửa hàng',
  location: null,
  bio: null,
  role: 'OWNER',
  joinedAt: '2026-09-30T08:00:00Z',
  avatarUrl: null,
}

let saved: UserProfile = { ...PROFILE }
let patches: unknown[] = []

export function resetProfileBackend(profile: UserProfile = PROFILE) {
  saved = { ...profile }
  patches = []
}

/** The profile as saved now, and every `PATCH` body received, in order. */
export const profileBackend = {
  saved: () => saved,
  patches: () => patches,
}

const LIMITS: Record<keyof ProfileChange, number> = { displayName: 200, phoneNumber: 30, jobTitle: 100, location: 100, bio: 500 }
const PHONE = /^[-0-9 +().]*$/

function problem(errors: { field: string; message: string }[]) {
  return HttpResponse.json(
    { status: 400, code: 'VALIDATION_FAILED', title: 'Validation failed', errors },
    { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

export const profileHandlers = [
  http.get('/api/profile', () => HttpResponse.json(saved)),
  http.patch('/api/profile', async ({ request }) => {
    const body = (await request.json()) as Record<string, string>
    patches.push(body)
    const errors: { field: string; message: string }[] = []
    const next: Record<string, string | null> = {}
    for (const [field, raw] of Object.entries(body)) {
      if (!(field in LIMITS)) {
        errors.push({ field, message: 'Trường này không sửa được.' })
        continue
      }
      const value = raw.trim()
      const limit = LIMITS[field as keyof ProfileChange]
      if (field === 'displayName' && value === '') {
        errors.push({ field, message: 'Họ và tên không được để trống.' })
      } else if (value.length > limit) {
        errors.push({ field, message: `Tối đa ${limit} ký tự.` })
      } else if (field === 'phoneNumber' && !PHONE.test(value)) {
        errors.push({ field, message: 'Số điện thoại chỉ gồm chữ số, khoảng trắng và + ( ) - .' })
      }
      next[field] = value === '' && field !== 'displayName' ? null : value
    }
    if (errors.length > 0) {
      return problem(errors)
    }
    saved = { ...saved, ...next }
    return HttpResponse.json(saved)
  }),
]
