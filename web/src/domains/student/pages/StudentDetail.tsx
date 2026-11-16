import { useRef, type ReactNode } from 'react'
import {
  Alert,
  Button,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useNavigate, useParams, useRouter } from '@tanstack/react-router'
import { ApiError } from '@/api/client'
import { useStudent, type Student } from '@/domains/student/api'
import { StudentFormDrawer } from '@/domains/student/components/FormDrawer'
import { DEFAULT_SEARCH } from '@/lib/constants'
import { ageFrom, formatDate } from '@/lib/format'
import { IdCard } from '@/components/IdCard'
import { prefersReducedMotion, useGsapEffect } from '@/lib/motion'

const WATCHED: (keyof Student)[] = [
  'fullName',
  'gender',
  'dateOfBirth',
  'idNumber',
  'nationalityName',
  'countyName',
  'phone',
  'alternatePhone',
  'email',
  'postalAddress',
]

function Field({ name, label, value }: { name: keyof Student; label: string; value?: ReactNode }) {
  return (
    <div className="detail-field" data-field={name}>
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value || <Text span c="dimmed">Not provided</Text>}</div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="detail-section">
      <div>
        <Text fw={600}>{title}</Text>
        <Text size="sm" c="dimmed" mt={2}>
          {hint}
        </Text>
      </div>
      <div className="detail-grid">{children}</div>
    </section>
  )
}

export function StudentDetailPage() {
  const { studentNo } = useParams({ from: '/students/$studentNo' })
  const navigate = useNavigate()
  const router = useRouter()
  const [editing, { open: openEdit, close: closeEdit }] = useDisclosure(false)
  const { data: student, isLoading, error, refetch } = useStudent(studentNo)

  const panelRef = useRef<HTMLDivElement>(null)
  const previous = useRef<Student | null>(null)

  // After a save, mark the fields that changed with a brass wash that fades out.
  // First load and unrelated refetches do nothing.
  useGsapEffect(
    panelRef,
    ({ el }) => {
      const before = previous.current
      previous.current = student ?? null
      if (!before || !student || before.version === student.version) return

      const changed = WATCHED.filter((key) => before[key] !== student[key])
      const targets = changed
        .map((key) => el.querySelector<HTMLElement>(`[data-field="${key}"]`))
        .filter((node): node is HTMLElement => node !== null)
      if (targets.length === 0) return

      gsap.fromTo(
        targets,
        { backgroundColor: 'rgba(229, 168, 30, 0.38)' },
        {
          backgroundColor: 'rgba(229, 168, 30, 0)',
          duration: prefersReducedMotion() ? 0.6 : 1.3,
          ease: 'power2.out',
          clearProps: 'backgroundColor',
        },
      )
    },
    [student?.version],
  )

  const goBack = () => {
    // Go back to the list exactly as the user left it (search, page); if the
    // page was opened directly, fall back to the plain list.
    if (window.history.length > 1) router.history.back()
    else void navigate({ to: '/', search: DEFAULT_SEARCH })
  }

  const backButton = (
    <Button variant="subtle" leftSection={<ArrowLeftIcon size={16} />} onClick={goBack} w="fit-content">
      Back to students
    </Button>
  )

  if (isLoading) {
    return (
      <Stack gap="lg">
        {backButton}
        <Skeleton h={132} radius="md" />
        <Skeleton h={300} radius="md" />
      </Stack>
    )
  }

  if (error || !student) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <Stack gap="lg">
        {backButton}
        <Alert
          color={notFound ? 'yellow' : 'red'}
          icon={<WarningCircleIcon size={18} />}
          title={notFound ? 'Student not found' : "Couldn't load this student"}
        >
          <Text size="sm">
            {notFound
              ? `There is no active student with number ${studentNo}.`
              : error instanceof Error
                ? error.message
                : 'Unexpected error.'}
          </Text>
          {error instanceof ApiError && error.requestId && (
            <Text size="xs" c="dimmed" mt={4}>
              Reference: {error.requestId}
            </Text>
          )}
          {!notFound && (
            <Button
              mt="sm"
              size="xs"
              color="red"
              leftSection={<ArrowsClockwiseIcon size={14} />}
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          )}
        </Alert>
      </Stack>
    )
  }

  const age = ageFrom(student.dateOfBirth)

  return (
    <Stack gap="lg">
      {backButton}

      <IdCard student={student} onEdit={openEdit} />

      <div ref={panelRef} className="panel">
        <Section title="Personal details" hint="Who the student is, as recorded at registration.">
          <Field name="fullName" label="Full name" value={student.fullName} />
          <Field name="gender" label="Gender" value={student.gender} />
          <Field
            name="dateOfBirth"
            label="Date of birth"
            value={
              student.dateOfBirth
                ? `${formatDate(student.dateOfBirth)}${age !== null ? ` · ${age} years` : ''}`
                : ''
            }
          />
          <Field name="idNumber" label="ID number" value={student.idNumber} />
          <Field name="nationalityName" label="Nationality" value={student.nationalityName || student.nationality} />
          <Field name="countyName" label="County" value={student.countyName || student.county} />
        </Section>

        <Section title="Contact" hint="Where the registry can reach the student.">
          <Field name="phone" label="Phone" value={student.phone} />
          <Field name="alternatePhone" label="Alternate phone" value={student.alternatePhone} />
          <Field name="email" label="Email" value={student.email} />
          <Field name="universityEmail" label="University email" value={student.universityEmail} />
          <Field name="postalAddress" label="Postal address" value={student.postalAddress} />
        </Section>
      </div>

      <StudentFormDrawer opened={editing} onClose={closeEdit} student={student} />
    </Stack>
  )
}