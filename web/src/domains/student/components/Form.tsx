import type { FieldKey, LookupItem, Student, StudentInput } from '@/domains/student/api'
import dayjs from 'dayjs'
import { useMemo, useRef, useState, useEffect } from 'react'
import { Alert, Button, Group, Radio, Select, SimpleGrid, Stack, TextInput } from '@mantine/core'
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
  dateOfBirth: Date | null
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
    dateOfBirth: student?.dateOfBirth ? dayjs(student.dateOfBirth).toDate() : null,
    idNumber: student?.idNumber ?? '',
    nationality: student?.nationality || null,
    county: student?.county || null,
    phone: student?.phone ?? '',
    alternatePhone: student?.alternatePhone ?? '',
    email: student?.email ?? '',
    postalAddress: student?.postalAddress ?? '',
  }
}

function toStrings(v: FormValues): Record<FieldKey, string> {
  return {
    firstName: v.firstName.trim(),
    middleName: v.middleName.trim(),
    lastName: v.lastName.trim(),
    gender: v.gender,
    dateOfBirth: v.dateOfBirth ? dayjs(v.dateOfBirth).format('YYYY-MM-DD') : '',
    idNumber: v.idNumber.trim(),
    nationality: v.nationality ?? '',
    county: v.county ?? '',
    phone: v.phone.trim(),
    alternatePhone: v.alternatePhone.trim(),
    email: v.email.trim(),
    postalAddress: v.postalAddress.trim(),
  }
}

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
  const firstErrorRef = useRef<HTMLElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)

  const initial = useMemo(() => initialValues(student), [student])
  const initialStrings = useMemo(() => toStrings(initial), [initial])

  const mustCheck = (key: FieldKey, current: string) =>
    mode === 'create' || current !== initialStrings[key]

  const form = useForm<FormValues>({
    mode: 'controlled',
    initialValues: initial,
    validate: {
      firstName: (v) => (mustCheck('firstName', v.trim()) && !v.trim() ? 'First name is required' : null),
      lastName: (v) => (mustCheck('lastName', v.trim()) && !v.trim() ? 'Last name is required' : null),
      gender: (v) => (mustCheck('gender', v) && !v ? 'Choose a gender' : null),
      dateOfBirth: (v) => (mustCheck('dateOfBirth', v ? dayjs(v).format('YYYY-MM-DD') : '') && !v ? 'Date of birth is required' : null),
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

  // Focus first invalid field on validation error
  useEffect(() => {
    if (firstErrorRef.current) {
      firstErrorRef.current.focus()
      firstErrorRef.current = null
    }
  }, [form.errors])

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

  const handleInvalid = () => {
    setFormError(null)
    revealFormErrors(formRef.current)
  }

  const getErrorId = (field: string) => `${field}-error`
  const getHelperId = (field: string) => `${field}-helper`

  return (
    <form ref={formRef} onSubmit={form.onSubmit(handleValid, handleInvalid)} noValidate>
      <Stack >
        {conflict && (
          <Alert
            color="orange"
            icon={<WarningCircleIcon size={18} />}
            title="Someone else changed this student"
            role="alert"
          >
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
          <Alert color="red" icon={<WarningCircleIcon size={18} />} role="alert">
            {formError}
          </Alert>
        )}

        <fieldset className="form-section">
          <legend className="form-section-title">Identity</legend>
          <SimpleGrid cols={{ base: 1, sm: 2 }} >
            <TextInput
              label="First name"
              required
              aria-required="true"
              aria-describedby={getHelperId('firstName')}
              aria-invalid={form.errors.firstName ? 'true' : 'false'}
              aria-errormessage={form.errors.firstName ? getErrorId('firstName') : undefined}
              {...form.getInputProps('firstName')}
            />
            <TextInput
              label="Middle name"
              aria-describedby={getHelperId('middleName')}
              {...form.getInputProps('middleName')}
            />
          </SimpleGrid>
          <TextInput
            label="Last name"
            required
            aria-required="true"
            aria-describedby={getHelperId('lastName')}
            aria-invalid={form.errors.lastName ? 'true' : 'false'}
            aria-errormessage={form.errors.lastName ? getErrorId('lastName') : undefined}
            {...form.getInputProps('lastName')}
          />

          <Radio.Group
            label="Gender"
            required
            aria-required="true"
            aria-describedby={getHelperId('gender')}
            aria-invalid={form.errors.gender ? 'true' : 'false'}
            aria-errormessage={form.errors.gender ? getErrorId('gender') : undefined}
            {...form.getInputProps('gender')}
          >
            <Group mt="xs" role="radiogroup" aria-label="Gender">
              <Radio value="Male" label="Male" />
              <Radio value="Female" label="Female" />
            </Group>
          </Radio.Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }} >
            <DateInput
              label="Date of birth"
              placeholder="YYYY-MM-DD"
              valueFormat="YYYY-MM-DD"
              required
              aria-required="true"
              aria-describedby={getHelperId('dateOfBirth')}
              aria-invalid={form.errors.dateOfBirth ? 'true' : 'false'}
              aria-errormessage={form.errors.dateOfBirth ? getErrorId('dateOfBirth') : undefined}
              clearable
              maxDate={dayjs().format('YYYY-MM-DD')}
              minDate="1900-01-01"
              {...form.getInputProps('dateOfBirth')}
            />
            <TextInput
              label="ID number"
              required
              aria-required="true"
              leftSection={<IdentificationCardIcon size={16} aria-hidden="true" />}
              aria-describedby={getHelperId('idNumber')}
              aria-invalid={form.errors.idNumber ? 'true' : 'false'}
              aria-errormessage={form.errors.idNumber ? getErrorId('idNumber') : undefined}
              {...form.getInputProps('idNumber')}
            />
          </SimpleGrid>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">Origin</legend>
          <SimpleGrid cols={{ base: 1, sm: 2 }} >
            <Select
              label="Nationality"
              placeholder={lookupsLoading ? 'Loading…' : 'Select'}
              searchable
              clearable
              disabled={lookupsLoading}
              data={toOptions(nationalities, student?.nationality, student?.nationalityName)}
              aria-describedby={getHelperId('nationality')}
              aria-invalid={form.errors.nationality ? 'true' : 'false'}
              aria-errormessage={form.errors.nationality ? getErrorId('nationality') : undefined}
              {...form.getInputProps('nationality')}
            />
            <Select
              label="County"
              placeholder={lookupsLoading ? 'Loading…' : 'Select'}
              searchable
              clearable
              disabled={lookupsLoading}
              data={toOptions(counties, student?.county, student?.countyName)}
              aria-describedby={getHelperId('county')}
              aria-invalid={form.errors.county ? 'true' : 'false'}
              aria-errormessage={form.errors.county ? getErrorId('county') : undefined}
              {...form.getInputProps('county')}
            />
          </SimpleGrid>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">Contact</legend>
          <SimpleGrid cols={{ base: 1, sm: 2 }} >
            <TextInput
              label="Phone"
              placeholder="0712345678"
              required
              aria-required="true"
              leftSection={<PhoneIcon size={16} aria-hidden="true" />}
              aria-describedby={getHelperId('phone')}
              aria-invalid={form.errors.phone ? 'true' : 'false'}
              aria-errormessage={form.errors.phone ? getErrorId('phone') : undefined}
              {...form.getInputProps('phone')}
            />
            <TextInput
              label="Alternate phone"
              leftSection={<PhoneIcon size={16} aria-hidden="true" />}
              aria-describedby={getHelperId('alternatePhone')}
              aria-invalid={form.errors.alternatePhone ? 'true' : 'false'}
              aria-errormessage={form.errors.alternatePhone ? getErrorId('alternatePhone') : undefined}
              {...form.getInputProps('alternatePhone')}
            />
          </SimpleGrid>
          <TextInput
            label="Email"
            type="email"
            leftSection={<EnvelopeSimpleIcon size={16} aria-hidden="true" />}
            aria-describedby={getHelperId('email')}
            aria-invalid={form.errors.email ? 'true' : 'false'}
            aria-errormessage={form.errors.email ? getErrorId('email') : undefined}
            {...form.getInputProps('email')}
          />
          <TextInput
            label="Postal address"
            leftSection={<MapPinIcon size={16} aria-hidden="true" />}
            aria-describedby={getHelperId('postalAddress')}
            {...form.getInputProps('postalAddress')}
          />
        </fieldset>

        <div className="form-actions" role="group" aria-label="Form actions">
          <Button
            variant="default"
            data-premium="secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            data-premium="true"
            loading={saving}
            disabled={conflict}
          >
            {mode === 'create' ? 'Register student' : 'Save changes'}
          </Button>
        </div>
      </Stack>
    </form>
  )
}