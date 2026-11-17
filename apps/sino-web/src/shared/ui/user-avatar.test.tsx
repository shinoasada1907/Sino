import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UserAvatar } from './user-avatar'

describe('UserAvatar (profile-info PI-05)', () => {
  it('shows the first letter of the name when there is no picture', () => {
    render(<UserAvatar name="an Nguyễn" src={null} />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('shows no letter under a picture, so a transparent PNG shows the circle only', () => {
    const { container } = render(<UserAvatar name="An" src="/api/profile/avatar?v=00000001" />)
    expect(container.querySelector('img')).toBeInTheDocument()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
  })

  it('shows the letter when the picture fails to load', () => {
    const { container } = render(<UserAvatar name="An" src="/api/profile/avatar?v=00000001" />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })
})
