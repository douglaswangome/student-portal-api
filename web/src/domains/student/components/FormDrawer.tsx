import { useEffect, useRef } from 'react'
import { Drawer } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  studentKeys,
  useCreateStudent,
  useLookups,
  useUpdateStudent,
  type Student,
} from '@/domains/student/api'
import { StudentForm } from '@/domains/student/components/Form'
import { markRegistered } from '@/lib/motion'

type Props = {
  opened: boolean
  onClose: () => void
  student?: Student
}

export function StudentFormDrawer({ opened, onClose, student }: Props) {
  const mode = student ? 'edit' : 'create'
  const drawerRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const lookups = useLookups()
  const create = useCreateStudent()
  const update = useUpdateStudent(student?.studentNo ?? '')

  // Store the previously focused element when drawer opens
  useEffect(() => {
    if (opened) {
      previousActiveElement.current = document.activeElement as HTMLElement
    }
  }, [opened])

  // Focus management: trap focus in drawer, restore on close
  useEffect(() => {
    if (!opened || !drawerRef.current) return

    const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'Tab') {
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault()
          lastElement?.focus()
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault()
          firstElement?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    firstElement?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Restore focus to trigger element
      previousActiveElement.current?.focus()
    }
  }, [opened, onClose])

  const handleSaved = (saved: Student) => {
    notifications.show({
      color: 'green',
      icon: <CheckCircleIcon size={18} />,
      title: mode === 'create' ? 'Student registered' : 'Changes saved',
      message: `${saved.fullName} · ${saved.studentNo}`,
    })
    onClose()
    if (mode === 'create') {
      markRegistered(saved.studentNo)
      void navigate({ to: '/students/$studentNo', params: { studentNo: saved.studentNo } })
    }
  }

  return (
    <Drawer
      ref={drawerRef}
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      padding="lg"
      overlayProps={{ backgroundOpacity: 0.5, blur: 2 }}
      transitionProps={{ transition: 'slide-left', duration: 240, timingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      title={mode === 'create' ? 'Register a new student' : `Edit ${student?.fullName ?? 'student'}`}
      aria-label={mode === 'create' ? 'Register a new student' : `Edit ${student?.fullName ?? 'student'}`}
      trapFocus
    >
      <StudentForm
        key={student?.version ?? 'new'}
        mode={mode}
        student={student}
        nationalities={lookups.data?.nationalities ?? []}
        counties={lookups.data?.counties ?? []}
        lookupsLoading={lookups.isLoading}
        onSubmit={(input) => (student ? update.mutateAsync(input) : create.mutateAsync(input))}
        onSaved={handleSaved}
        onCancel={onClose}
        onReload={
          student
            ? () => void queryClient.invalidateQueries({ queryKey: studentKeys.detail(student.studentNo) })
            : undefined
        }
      />
    </Drawer>
  )
}