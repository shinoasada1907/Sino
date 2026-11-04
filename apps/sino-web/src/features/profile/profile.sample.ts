import type { ActiveSessionItem, UserProfileData } from './profile.types'

export const SAMPLE_PROFILE: UserProfileData = {
  displayName: 'Đại Quản Gia',
  email: 'admin@daiquangia.io.vn',
  phoneNumber: '0901 234 567',
  jobTitle: 'Quản trị viên hệ thống',
  bio: 'Quản trị và điều phối các luồng tin nhắn, tài khoản liên kết và lịch làm việc tập trung trên Sino.',
  avatarUrl: '',
  joinedAt: 'Tháng 10, 2026',
  location: 'Hà Nội, Việt Nam',
  role: 'Chủ sở hữu hệ thống (Owner)',
  twoFactorEnabled: true,
}

export const SAMPLE_SESSIONS: ActiveSessionItem[] = [
  {
    id: 'sess-1',
    device: 'Máy tính để bàn Windows',
    browser: 'Google Chrome 130.0',
    ip: '113.190.234.12',
    location: 'Hà Nội, Việt Nam',
    lastActive: 'Đang hoạt động',
    isCurrent: true,
  },
  {
    id: 'sess-2',
    device: 'iPhone 15 Pro Max',
    browser: 'Sino Mobile App 1.2',
    ip: '14.238.102.55',
    location: 'Hà Nội, Việt Nam',
    lastActive: '2 giờ trước',
    isCurrent: false,
  },
  {
    id: 'sess-3',
    device: 'MacBook Air M2',
    browser: 'Safari 18.1',
    ip: '171.244.89.201',
    location: 'Đà Nẵng, Việt Nam',
    lastActive: '3 ngày trước',
    isCurrent: false,
  },
]

