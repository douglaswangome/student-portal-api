import { useRef } from 'react'
import { ActionIcon, Avatar, Badge, Button, CopyButton, Group, Title, Tooltip, VisuallyHidden } from '@mantine/core'
import { CheckIcon, CopyIcon, PencilSimpleIcon } from '@phosphor-icons/react'
import gsap from 'gsap'
import type { Student } from '@/domains/student/api'
import { consumeRegistered, useGsapEffect, useTilt } from '@/lib/motion'
import { formatDate, statusColor } from '@/lib/format'

type Props = {
  student: Student
  onEdit: () => void
}

export function IdCard({ student, onEdit }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const numberRef = useRef<HTMLDivElement>(null)
  const sweepRef = useRef<HTMLDivElement>(null)
  const sealRef = useRef<SVGSVGElement>(null)
  const ringRef = useRef<SVGCircleElement>(null)
  const checkRef = useRef<SVGPathElement>(null)

  useTilt(wrapRef, faceRef)

  useGsapEffect(
    wrapRef,
    ({ reduced }) => {
      if (!consumeRegistered(student.studentNo)) return

      const seal = sealRef.current
      const ring = ringRef.current
      const check = checkRef.current
      const sweep = sweepRef.current
      const chars = numberRef.current?.querySelectorAll<HTMLElement>('.roll-char')
      if (!seal || !ring || !check) return

      // Reduced motion: the seal simply fades in and out. Same message, no movement.
      if (reduced) {
        gsap.set([ring, check], { strokeDashoffset: 0 })
        gsap
          .timeline()
          .fromTo(seal, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 })
          .to(seal, { autoAlpha: 0, duration: 0.3 }, '+=1.4')
        return
      }

      const ringLength = ring.getTotalLength()
      const checkLength = check.getTotalLength()
      gsap.set(ring, { strokeDasharray: ringLength, strokeDashoffset: ringLength })
      gsap.set(check, { strokeDasharray: checkLength, strokeDashoffset: checkLength })

      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
      if (chars && chars.length > 0) {
        tl.from(chars, { yPercent: 120, duration: 0.7, stagger: 0.04 }, 0)
      }
      tl.set(seal, { autoAlpha: 1 }, 0.2)
        .fromTo(seal, { scale: 0.86 }, { scale: 1, duration: 0.6 }, 0.2)
        .to(ring, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut' }, 0.2)
        .to(check, { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' }, 0.8)
      if (sweep) {
        tl.fromTo(sweep, { xPercent: -130 }, { xPercent: 130, duration: 0.95, ease: 'power2.inOut' }, 0.35)
      }
      tl.to(seal, { autoAlpha: 0, duration: 0.45, ease: 'power2.in' }, '+=1.1')
    },
    [student.studentNo],
  )

  return (
    <div ref={wrapRef} className="idcard-wrap">
      <div ref={faceRef} className="idcard">
        <div ref={sweepRef} className="idcard-sweep" aria-hidden="true" />

        <div className="idcard-main">
          <Avatar
            name={student.fullName}
            variant="filled"
            size={72}
            radius="md"
          />
          <div style={{ minWidth: 0 }}>
            <Title order={2} className="idcard-name">
              {student.fullName || student.studentNo}
            </Title>
            <Group gap={4} wrap="nowrap">
              <div ref={numberRef} className="idcard-no">
                <VisuallyHidden>Student number {student.studentNo}</VisuallyHidden>
                {Array.from(student.studentNo).map((char, index) => (
                  <span key={index} className="roll" aria-hidden="true">
                    <span className="roll-char" style={{ display: 'inline-block' }}>
                      {char === ' ' ? '\u00a0' : char}
                    </span>
                  </span>
                ))}
              </div>
              <CopyButton value={student.studentNo}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Copied' : 'Copy student number'}>
                    <ActionIcon
                      variant="subtle"
                      color={copied ? 'green' : 'gray'}
                      c="#f3efe4"
                      size="sm"
                      onClick={copy}
                      aria-label="Copy student number"
                    >
                      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
            <Group gap="sm" mt={10}>
              {student.status && (
                <Badge variant="filled" color={statusColor(student.status)} size="sm">
                  {student.status}
                </Badge>
              )}
              <span className="idcard-meta">Registered {formatDate(student.dateRegistered)}</span>
            </Group>
          </div>
        </div>

        <div className="idcard-actions">
          <Button
            variant="default"
            color="ink"
            leftSection={<PencilSimpleIcon size={16} />}
            onClick={onEdit}
          >
            Edit
          </Button>
        </div>

        <svg ref={sealRef} className="idcard-seal" viewBox="0 0 88 88" aria-hidden="true" fill="none">
          <circle ref={ringRef} cx="44" cy="44" r="38" stroke="#e5a81e" strokeWidth="3" strokeLinecap="round" />
          <path
            ref={checkRef}
            d="M27 45 L39 57 L62 32"
            stroke="#f3d58a"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}