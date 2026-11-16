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
  // Pass a student to edit it; leave it out to register a new one.
  student?: Student
}

export function StudentFormDrawer({ opened, onClose, student }: Props) {
  const mode = student ? 'edit' : 'create'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const lookups = useLookups()
  const create = useCreateStudent()
  const update = useUpdateStudent(student?.studentNo ?? '')

  const handleSaved = (saved: Student) => {
    notifications.show({
      color: 'teal',
      icon: <CheckCircleIcon size={18} />,
      title: mode === 'create' ? 'Student registered' : 'Changes saved',
      message: `${saved.fullName} · ${saved.studentNo}`,
    })
    onClose()
    if (mode === 'create') {
      // The new student's ID card plays the registration stamp when it appears.
      markRegistered(saved.studentNo)
      void navigate({ to: '/students/$studentNo', params: { studentNo: saved.studentNo } })
    }
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      padding="lg"
      overlayProps={{ backgroundOpacity: 0.4 }}
      transitionProps={{ transition: 'slide-left', duration: 240, timingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      title={mode === 'create' ? 'Register a new student' : `Edit ${student?.fullName ?? 'student'}`}
    >
      {/* The key makes the form start fresh whenever the student's version changes */}
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