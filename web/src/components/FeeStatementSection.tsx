import { useState } from 'react'
import { Alert, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import { ArrowSquareOutIcon, DownloadSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import dayjs from 'dayjs'
import { ApiError } from '../api/client'
import { useFeeStatement, type FeeStatementMode } from '../api/feeStatement'

const DATE_FORMAT = 'YYYY-MM-DD'

interface Props {
  studentNo: string
}

export function FeeStatementSection({ studentNo }: Props) {
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [serverFields, setServerFields] = useState<Record<string, string>>({})
  const statement = useFeeStatement(studentNo)

  const rangeError = from && to && dayjs(from).isAfter(dayjs(to)) ? 'The start date must not be after the end date.' : null

  const applyPreset = (preset: 'all' | 'year' | 'sixMonths') => {
    setError(null)
    setServerFields({})
    if (preset === 'all') {
      setFrom(null)
      setTo(null)
    } else if (preset === 'year') {
      setFrom(dayjs().startOf('year').format(DATE_FORMAT))
      setTo(dayjs().format(DATE_FORMAT))
    } else {
      setFrom(dayjs().subtract(6, 'month').format(DATE_FORMAT))
      setTo(dayjs().format(DATE_FORMAT))
    }
  }

  const run = (mode: FeeStatementMode) => {
    if (rangeError) return
    setError(null)
    setServerFields({})

    let tab: Window | null = null
    if (mode === 'preview') {
      tab = window.open('', '_blank')
      if (tab) {
        tab.document.title = 'Fee statement'
        tab.document.body.textContent = 'Preparing the fee statement…'
        tab.document.body.style.cssText = 'font-family: system-ui, sans-serif; padding: 2rem; color: #334;'
      }
    }

    statement.mutate(
      { mode, range: { from: from ?? '', to: to ?? '' }, tab },
      {
        onSuccess: (result) => {
          notifications.show({
            color: 'teal',
            title: result.mode === 'download' || result.fellBackToDownload ? 'Fee statement downloaded' : 'Fee statement opened',
            message: result.fellBackToDownload
              ? 'Your browser blocked the new tab, so the PDF was saved instead.'
              : result.fileName,
          })
        },
        onError: (err) => {
          setError(err)
          setServerFields(err.fields)
        },
      },
    )
  }

  const busyMode = statement.isPending ? statement.variables?.mode : undefined

  return (
    <section className="detail-section">
      <div>
        <Text fw={600}>Fee statement</Text>
        <Text size="sm" c="dimmed" mt={2}>
          Built live in Business Central. Leave the dates empty for the full history.
        </Text>
      </div>

      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DateInput
            label="From"
            placeholder="Start of record"
            valueFormat="D MMM YYYY"
            clearable
            value={from}
            onChange={setFrom}
            error={rangeError ?? serverFields.from}
          />
          <DateInput
            label="To"
            placeholder="Today"
            valueFormat="D MMM YYYY"
            clearable
            value={to}
            onChange={setTo}
            error={serverFields.to}
          />
        </SimpleGrid>

        <Group gap="xs">
          <Button variant="subtle" size="compact-sm" onClick={() => applyPreset('all')}>
            All dates
          </Button>
          <Button variant="subtle" size="compact-sm" onClick={() => applyPreset('year')}>
            This year
          </Button>
          <Button variant="subtle" size="compact-sm" onClick={() => applyPreset('sixMonths')}>
            Last 6 months
          </Button>
        </Group>

        {error && (
          <Alert color="red" variant="light" icon={<WarningCircleIcon size={18} />} title="Couldn't get the fee statement">
            <Text size="sm">{error.message}</Text>
            {error.requestId && (
              <Text size="xs" c="dimmed" mt={4}>
                Reference: {error.requestId}
              </Text>
            )}
          </Alert>
        )}

        <Group>
          <Button
            leftSection={<DownloadSimpleIcon size={16} />}
            loading={busyMode === 'download'}
            disabled={statement.isPending || rangeError !== null}
            onClick={() => run('download')}
          >
            Download PDF
          </Button>
          <Button
            variant="default"
            leftSection={<ArrowSquareOutIcon size={16} />}
            loading={busyMode === 'preview'}
            disabled={statement.isPending || rangeError !== null}
            onClick={() => run('preview')}
          >
            Open in new tab
          </Button>
        </Group>
      </Stack>
    </section>
  )
}