// Adapted from React Bits FadeContent (https://reactbits.dev, MIT + Commons Clause), cut to the canvas Motion map (D-252).
import { gsap } from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef, type ReactNode } from 'react'
import { fadeMotion } from './motion-values'
import { prefersReducedMotion } from './reduced-motion'

let easeOut: string | undefined

/** Registers the plugins on first use in the browser; the server bundle never runs gsap. */
function sinoEaseOut(): string {
  if (!easeOut) {
    gsap.registerPlugin(ScrollTrigger, CustomEase)
    CustomEase.create('sino-out', '.2,.8,.2,1')
    easeOut = 'sino-out'
  }
  return easeOut
}

/**
 * Fades its content in once, when it is scrolled to. Content already on screen (or above it) when the page hydrates is
 * left alone: the prerendered HTML shows it before any script runs, and hiding it then would make it blink.
 */
export function FadeContent({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || el.getBoundingClientRect().top < window.innerHeight) return

    const ease = sinoEaseOut()
    const { y, duration } = fadeMotion(prefersReducedMotion())
    gsap.set(el, { autoAlpha: 0, y })
    const tween = gsap.to(el, { autoAlpha: 1, y: 0, duration, ease, paused: true })
    const trigger = ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => tween.play() })

    return () => {
      trigger.kill()
      tween.kill()
      gsap.set(el, { clearProps: 'all' })
    }
  }, [])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
