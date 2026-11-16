import type {FieldKey, LookupItem, Student, StudentInput} from '@/domains/student/api'
import dayjs from 'dayjs'
import { useMemo,useRef, useState } from 'react'
import { Alert, Button, Divider, Group, Radio, Select, SimpleGrid, Stack, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import {
  ArrowsClockwiseIcon,
  EnvelopeSimpleIcon,
  IdentificationCardIcon,
  MapPinIcon,
  PhoneIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { ApiError } from '@/api/client'
import { revealFormErrors } from '@/lib/motion'

const PHONE_RE = /^\+?[0-9]{9,15}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const stripPhone = (v: string) => v.replace(/[\s\-()]/g, '')

const FIELD_KEYS: FieldKey[] = [
  'firstName',
  'middleName',
  'lastName',
  'gender',
  'dateOfBirth',
  'idNumber',
  'nationality',
  'county',
  'phone',
  'alternatePhone',
  'email',
  'postalAddress',
]

type FormValues = {
  firstName: string
  middleName: string
  lastName: string
  gender: string
  // Mantine 8+ date inputs use 'YYYY-MM-DD' strings, which is also what BC expects.
  dateOfBirth: string | null
  idNumber: string
  nationality: string | null
  county: string | null
  phone: string
  alternatePhone: string
  email: string
  postalAddress: string
}

function initialValues(student?: Student): FormValues {
  return {
    firstName: student?.firstName ?? '',
    middleName: student?.middleName ?? '',
    lastName: student?.lastName ?? '',
    gender: student?.gender ?? '',
    dateOfBirth: student?.dateOfBirth || null,
    idNumber: student?.idNumber ?? '',
    nationality: student?.nationality || null,
    county: student?.county || null,
    phone: student?.phone ?? '',
    alternatePhone: student?.alternatePhone ?? '',
    email: student?.email ?? '',
    postalAddress: student?.postalAddress ?? '',
  }
}

// Every field as a trimmed string, so "did this change?" is a simple comparison.
function toStrings(v: FormValues): Record<FieldKey, string> {
  return {
    firstName: v.firstName.trim(),
    middleName: v.middleName.trim(),
    lastName: v.lastName.trim(),
    gender: v.gender,
    dateOfBirth: v.dateOfBirth ?? '',
    idNumber: v.idNumber.trim(),
    nationality: v.nationality ?? '',
    county: v.county ?? '',
    phone: v.phone.trim(),
    alternatePhone: v.alternatePhone.trim(),
    email: v.email.trim(),
    postalAddress: v.postalAddress.trim(),
  }
}

// Register: send every filled-in field.
// Edit: send only what changed, plus the version, so nothing else is touched.
function buildPayload(
  values: FormValues,
  initialStrings: Record<FieldKey, string>,
  mode: 'create' | 'edit',
  version?: string,
): StudentInput {
  const current = toStrings(values)
  const payload: StudentInput = {}
  for (const key of FIELD_KEYS) {
    if (mode === 'create') {
      if (current[key]) payload[key] = current[key]
    } else if (current[key] !== initialStrings[key]) {
      payload[key] = current[key]
    }
  }
  if (mode === 'edit' && version) payload.version = version
  return payload
}

function toOptions(items: LookupItem[], currentCode?: string, currentName?: string) {
  const options = items.map((i) => ({ value: i.code, label: `${i.name} (${i.code})` }))
  // Older records may hold a code that is not in the list: keep it selectable.
  if (currentCode && !options.some((o) => o.value === currentCode)) {
    options.unshift({ value: currentCode, label: currentName || currentCode })
  }
  return options
}

interface Props {
  mode: 'create' | 'edit'
  student?: Student
  nationalities: LookupItem[]
  counties: LookupItem[]
  lookupsLoading: boolean
  onSubmit: (input: StudentInput) => Promise<Student>
  onSaved: (student: Student) => void
  onCancel: () => void
  onReload?: () => void
}

export function StudentForm({
  mode,
  student,
  nationalities,
  counties,
  lookupsLoading,
  onSubmit,
  onSaved,
  onCancel,
  onReload,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)

  const initial = useMemo(() => initialValues(student), [student])
  const initialStrings = useMemo(() => toStrings(initial), [initial])

  // On edit we only insist on fields the user actually touched, so an older
  // student with incomplete data can still have just a phone number fixed.
  const mustCheck = (key: FieldKey, current: string) =>
    mode === 'create' || current !== initialStrings[key]

  const form = useForm<FormValues>({
    mode: 'controlled',
    initialValues: initial,
    validate: {
      firstName: (v) => (mustCheck('firstName', v.trim()) && !v.trim() ? 'First name is required' : null),
      lastName: (v) => (mustCheck('lastName', v.trim()) && !v.trim() ? 'Last name is required' : null),
      gender: (v) => (mustCheck('gender', v) && !v ? 'Choose a gender' : null),
      dateOfBirth: (v) => (mustCheck('dateOfBirth', v ?? '') && !v ? 'Date of birth is required' : null),
      idNumber: (v) => (mustCheck('idNumber', v.trim()) && !v.trim() ? 'ID number is required' : null),
      phone: (v) => {
        const t = v.trim()
        if (!mustCheck('phone', t)) return null
        if (!t) return 'Phone number is required'
        return PHONE_RE.test(stripPhone(t)) ? null : 'Enter a valid phone number, e.g. 0712345678'
      },
      alternatePhone: (v) => {
        const t = v.trim()
        return t && !PHONE_RE.test(stripPhone(t)) ? 'Enter a valid phone number' : null
      },
      email: (v) => {
        const t = v.trim()
        return t && !EMAIL_RE.test(t) ? 'Enter a valid email address' : null
      },
    },
  })

  const handleValid = async (values: FormValues) => {
    setFormError(null)
    const payload = buildPayload(values, initialStrings, mode, student?.version)

    if (mode === 'edit' && Object.keys(payload).filter((k) => k !== 'version').length === 0) {
      notifications.show({ color: 'gray', message: 'There are no changes to save.' })
      return
    }

    setSaving(true)
    try {
      const saved = await onSubmit(payload)
      onSaved(saved)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'CONFLICT') {
          setConflict(true)
        } else if (Object.keys(err.fields).length > 0) {
          // Show each BC message under the matching input, and take the user to the first one.
          form.setErrors(err.fields)
          setFormError('Please correct the highlighted fields.')
          revealFormErrors(formRef.current)
        } else {
          setFormError(err.requestId ? `${err.message} (reference ${err.requestId})` : err.message)
        }
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  // Browser-side validation failed: same treatment, so every error feels the same.
  const handleInvalid = () => {
    setFormError(null)
    revealFormErrors(formRef.current)
  }

  return (
    <form ref={formRef} onSubmit={form.onSubmit(handleValid, handleInvalid)} noValidate>
      <Stack gap="md">
        {conflict && (
          <Alert color="orange" icon={<WarningCircleIcon size={18} />} title="Someone else changed this student">
            Your edits were not saved. Load the latest details and apply your changes again.
            {onReload && (
              <Group mt="sm">
                <Button
                  size="xs"
                  color="orange"
                  leftSection={<ArrowsClockwiseIcon size={14} />}
                  onClick={onReload}
                >
                  Load latest
                </Button>
              </Group>
            )}
          </Alert>
        )}

        {formError && !conflict && (
          <Alert color="red" icon={<WarningCircleIcon size={18} />}>
            {formError}
          </Alert>
        )}

        <Divider label="Identity" labelPosition="left" />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="First name" withAsterisk {...form.getInputProps('firstName')} />
          <TextInput label="Middle name" {...form.getInputProps('middleName')} />
        </SimpleGrid>
        <TextInput label="Last name" withAsterisk {...form.getInputProps('lastName')} />

        <Radio.Group label="Gender" withAsterisk {...form.getInputProps('gender')}>
          <Group mt="xs">
            <Radio value="Male" label="Male" />
            <Radio value="Female" label="Female" />
          </Group>
        </Radio.Group>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DateInput
            label="Date of birth"
            placeholder="YYYY-MM-DD"
            valueFormat="YYYY-MM-DD"
            withAsterisk
            clearable
            maxDate={dayjs().format('YYYY-MM-DD')}
            minDate="1900-01-01"
            {...form.getInputProps('dateOfBirth')}
          />
          <TextInput
            label="ID number"
            withAsterisk
            leftSection={<IdentificationCardIcon size={16} />}
            {...form.getInputProps('idNumber')}
          />
        </SimpleGrid>

        <Divider label="Origin" labelPosition="left" mt="sm" />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Nationality"
            placeholder={lookupsLoading ? 'Loading…' : 'Select'}
            searchable
            clearable
            disabled={lookupsLoading}
            data={toOptions(nationalities, student?.nationality, student?.nationalityName)}
            {...form.getInputProps('nationality')}
          />
          <Select
            label="County"
            placeholder={lookupsLoading ? 'Loading…' : 'Select'}
            searchable
            clearable
            disabled={lookupsLoading}
            data={toOptions(counties, student?.county, student?.countyName)}
            {...form.getInputProps('county')}
          />
        </SimpleGrid>

        <Divider label="Contact" labelPosition="left" mt="sm" />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            label="Phone"
            placeholder="0712345678"
            withAsterisk
            leftSection={<PhoneIcon size={16} />}
            {...form.getInputProps('phone')}
          />
          <TextInput
            label="Alternate phone"
            leftSection={<PhoneIcon size={16} />}
            {...form.getInputProps('alternatePhone')}
          />
        </SimpleGrid>

        <TextInput
          label="Email"
          leftSection={<EnvelopeSimpleIcon size={16} />}
          {...form.getInputProps('email')}
        />
        <TextInput
          label="Postal address"
          leftSection={<MapPinIcon size={16} />}
          {...form.getInputProps('postalAddress')}
        />

        <Group justify="flex-end" className="form-actions">
          <Button variant="default" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={conflict}>
            {mode === 'create' ? 'Register student' : 'Save changes'}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}