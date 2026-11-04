export interface UserProfileData {
  displayName: string
  email: string
  phoneNumber: string
  jobTitle: string
  bio: string
  avatarUrl: string
  joinedAt: string
  location: string
  role: string
  twoFactorEnabled: boolean
}

export interface ActiveSessionItem {
  id: string
  device: string
  browser: string
  ip: string
  location: string
  lastActive: string
  isCurrent: boolean
}

