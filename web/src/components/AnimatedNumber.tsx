import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { prefersReducedMotion } from '@/lib/motion'

// A count that rolls to its new value, so a changed search result total is noticed
// without being announced by a flashing badge. Under reduced motion it just updates.
export function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(value)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    if (prefersReducedMotion() || shown.current === value) {
      shown.current = value
      el.textContent = value.toLocaleString()
      return
    }

    // React has already written the new value; put the old one back so the roll
    // starts from where the reader's eye last saw it.
    el.textContent = shown.current.toLocaleString()
    const state = { n: shown.current }
    const tween = gsap.to(state, {
      n: value,
      duration: 0.45,
      ease: 'power3.out',
      onUpdate: () => {
        shown.current = Math.round(state.n)
        el.textContent = shown.current.toLocaleString()
      },
      onComplete: () => {
        shown.current = value
      },
    })
    return () => {
      tween.kill()
    }
  }, [value])

  return (
    <span ref={ref} className="tnum">
      {value.toLocaleString()}
    </span>
  )
}