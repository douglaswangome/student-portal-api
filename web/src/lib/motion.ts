import { useLayoutEffect, type DependencyList, type RefObject } from 'react'
import gsap from 'gsap'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface EffectContext {
  el: HTMLElement
  reduced: boolean
}

export function useGsapEffect(
  scope: RefObject<HTMLElement | null>,
  effect: (ctx: EffectContext) => void,
  deps: DependencyList,
): void {
  useLayoutEffect(() => {
    const el = scope.current
    if (!el) return
    const reduced = prefersReducedMotion()
    const ctx = gsap.context(() => effect({ el, reduced }), el)
    return () => ctx.revert()
  }, deps)
}

const pendingStamp = new Set<string>()
const clearTimers = new Map<string, number>()

export function markRegistered(studentNo: string): void {
  pendingStamp.add(studentNo)
}

export function consumeRegistered(studentNo: string): boolean {
  const pending = pendingStamp.has(studentNo)
  if (pending && !clearTimers.has(studentNo)) {
    clearTimers.set(
      studentNo,
      window.setTimeout(() => {
        pendingStamp.delete(studentNo)
        clearTimers.delete(studentNo)
      }, 2000),
    )
  }
  return pending
}

export function revealFormErrors(root: HTMLElement | null): void {
  if (!root) return
  // Wait one frame so React has rendered the error state first.
  requestAnimationFrame(() => {
    const invalid = Array.from(root.querySelectorAll<HTMLElement>('[aria-invalid="true"]'))
    const first = invalid[0]
    if (!first) return
    first.focus()
    if (prefersReducedMotion()) return
    const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } })
    tl.to(invalid, { x: -5, duration: 0.06 })
      .to(invalid, { x: 5, duration: 0.08 })
      .to(invalid, { x: -3, duration: 0.07 })
      .to(invalid, { x: 3, duration: 0.07 })
      .to(invalid, { x: 0, duration: 0.06, clearProps: 'x' })
  })
}

export function useTilt(wrap: RefObject<HTMLElement | null>, face: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const w = wrap.current
    const f = face.current
    if (!w || !f) return

    const mm = gsap.matchMedia()
    mm.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
      gsap.set(f, { transformPerspective: 900 })
      const rotateX = gsap.quickTo(f, 'rotationX', { duration: 0.5, ease: 'power3.out' })
      const rotateY = gsap.quickTo(f, 'rotationY', { duration: 0.5, ease: 'power3.out' })

      const onMove = (event: PointerEvent) => {
        const rect = w.getBoundingClientRect()
        const px = (event.clientX - rect.left) / rect.width
        const py = (event.clientY - rect.top) / rect.height
        rotateY((px - 0.5) * 7)
        rotateX((0.5 - py) * 5)
        f.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
        f.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
      }
      const onLeave = () => {
        rotateX(0)
        rotateY(0)
      }

      w.addEventListener('pointermove', onMove)
      w.addEventListener('pointerleave', onLeave)
      return () => {
        w.removeEventListener('pointermove', onMove)
        w.removeEventListener('pointerleave', onLeave)
      }
    })
    return () => mm.revert()
  }, [wrap, face])
}