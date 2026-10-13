import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { stubReducedMotion } from './matchMedia'

// jsdom has no matchMedia; every test starts with motion allowed unless it says otherwise.
beforeEach(() => stubReducedMotion(false))

afterEach(() => cleanup())
