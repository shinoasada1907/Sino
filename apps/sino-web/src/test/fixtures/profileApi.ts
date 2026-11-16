import { http, HttpResponse } from 'msw'
import { formDataOf } from '../nodeFile'
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
let avatars: File[] = []
let avatarVersion = 0
let avatarDeletes = 0

export function resetProfileBackend(profile: UserProfile = PROFILE) {
  saved = { ...profile }
  patches = []
  avatars = []
  avatarVersion = 0
  avatarDeletes = 0
}

/** The profile as saved now, and every `PATCH` body received, in order. */
export const profileBackend = {
  saved: () => saved,
  patches: () => patches,
  /** Every file received by `PUT /api/profile/avatar`, in order, and how many `DELETE`s came. */
  avatars: () => avatars,
  avatarDeletes: () => avatarDeletes,
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
  // The picture (D-481): the part `file` must be an image; the answer is the whole profile with a new `avatarUrl`.
  http.put('/api/profile/avatar', async ({ request }) => {
    const file = (await formDataOf(request)).get('file')
    // Not `instanceof File`: the parsed file is Node's, the global one is jsdom's (see test/nodeFile.ts).
    if (typeof file === 'string' || file === null || !file.type.startsWith('image/')) {
      return problem([{ field: 'file', message: 'Not an image.' }])
    }
    avatars.push(file as File)
    saved = { ...saved, avatarUrl: `/api/profile/avatar?v=${String(++avatarVersion).padStart(8, '0')}` }
    return HttpResponse.json(saved)
  }),
  http.delete('/api/profile/avatar', () => {
    avatarDeletes++
    saved = { ...saved, avatarUrl: null }
    return new HttpResponse(null, { status: 204 })
  }),
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
