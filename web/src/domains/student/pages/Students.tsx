import { useEffect, useMemo, useRef } from 'react'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  CloseButton,
  Group,
  Highlight,
  Kbd,
  Loader,
  Pagination,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDebouncedValue, useDisclosure, useHotkeys, useMediaQuery } from '@mantine/hooks'
import {
  ArrowsClockwiseIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UsersThreeIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { createColumnHelper, FlexRender, tableFeatures, useTable } from '@tanstack/react-table'
import { ApiError } from '@/api/client'
import { useStudents, type Student } from '@/domains/student/api'
import { StudentFormDrawer } from '@/domains/student/components/FormDrawer'
import { PAGE_SIZES } from '@/lib/constants'
import { formatDate, statusColor } from '@/lib/format'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { useGsapEffect } from '@/lib/motion'
import gsap from 'gsap'

const features = tableFeatures({})
const columnHelper = createColumnHelper<typeof features, Student>()

const NO_STUDENTS: Student[] = []

// Desktop table columns (hidden on mobile card view)
const DESKTOP_HIDDEN_COLUMNS = new Set(['studentNo', 'phone', 'dateRegistered', 'open'])

export function StudentsPage() {
  const { search, page, pageSize } = useSearch({ from: '/' })
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [creating, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const narrow = useMediaQuery('(max-width: 760px)')

  // Debounced search for instant input feel, but URL is source of truth
  const [debounced] = useDebouncedValue(search, 300)
  const effectiveSearch = debounced.trim().length >= 2 ? debounced.trim() : ''

  // Sync debounced search to URL (replace to keep history clean)
  useEffect(() => {
    if (effectiveSearch !== search) {
      void navigate({
        to: '/',
        search: { search: effectiveSearch, page: 1, pageSize },
        replace: true,
      })
    }
  }, [effectiveSearch, search, pageSize, navigate])

  // Press "/" anywhere to jump to the search box
  useHotkeys([['/', () => inputRef.current?.focus()]])

  const { data, isLoading, isFetching, isError, error, refetch } = useStudents({ search, page, pageSize })

  const goToStudent = (studentNo: string) =>
    void navigate({ to: '/students/$studentNo', params: { studentNo } })

  // Handle row keyboard navigation
  const handleRowKeyDown = (event: React.KeyboardEvent, studentNo: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      goToStudent(studentNo)
    }
  }

  // Columns depend on search text for highlighting
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: 'student',
          header: 'Student',
          cell: ({ row }) => (
            <Group gap="sm" wrap="nowrap">
              <Avatar name={row.original.fullName} color="initials" variant="filled" size={34} />
              <div style={{ minWidth: 0 }}>
                <Link
                  to="/students/$studentNo"
                  params={{ studentNo: row.original.studentNo }}
                  className="student-link"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Highlight span highlight={search} fw={600}>
                    {row.original.fullName || '—'}
                  </Highlight>
                </Link>
                <Text size="xs" c="dimmed" truncate>
                  <Highlight span highlight={search} fz="xs" c="dimmed">
                    {row.original.email || row.original.universityEmail || 'No email on file'}
                  </Highlight>
                </Text>
                <Text size="xs" c="dimmed" className="show-narrow tnum">
                  {row.original.studentNo}
                </Text>
              </div>
            </Group>
          ),
        }),
        columnHelper.accessor('studentNo', {
          header: 'Student no.',
          cell: (info) => (
            <Highlight span highlight={search} ff="monospace" fw={600} fz="sm">
              {info.getValue()}
            </Highlight>
          ),
        }),
        columnHelper.accessor('phone', {
          header: 'Phone',
          cell: (info) =>
            info.getValue() ? (
              <Highlight span highlight={search} fz="sm">
                {info.getValue()}
              </Highlight>
            ) : (
              <Text span c="dimmed" fz="sm">
                —
              </Text>
            ),
        }),
        columnHelper.accessor('dateRegistered', {
          header: 'Registered',
          cell: (info) => formatDate(info.getValue()),
        }),
        columnHelper.accessor('status', {
          header: 'Status',
          cell: (info) =>
            info.getValue() ? (
              <Badge color={statusColor(info.getValue())} size="sm">
                {info.getValue()}
              </Badge>
            ) : (
              <Text span c="dimmed" fz="sm">
                —
              </Text>
            ),
        }),
        columnHelper.display({
          id: 'open',
          header: '',
          cell: () => <CaretRightIcon className="row-chevron" size={16} aria-hidden="true" />,
        }),
      ]),
    [search],
  )

  const table = useTable({
    features,
    columns,
    data: data?.items ?? NO_STUDENTS,
  })

  // Staggered row entrance animation
  useGsapEffect(
    listRef,
    ({ el, reduced }) => {
      const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-row]'))
      if (rows.length === 0) return
      gsap.from(rows, {
        opacity: 0,
        y: reduced ? 0 : 8,
        duration: reduced ? 0.12 : 0.26,
        ease: 'power3.out',
        stagger: { amount: reduced ? 0 : Math.min(0.22, rows.length * 0.02) },
        clearProps: 'opacity,transform',
      })
    },
    [data?.items],
  )

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  // Stale page fallback
  useEffect(() => {
    if (data && data.items.length === 0 && data.total > 0 && page > 1) {
      void navigate({ to: '/', search: { search, page: 1, pageSize }, replace: true })
    }
  }, [data, page, search, pageSize, navigate])

  // Mobile student card component
  const StudentCard = ({ student }: { student: Student }) => (
    <Link
      to="/students/$studentNo"
      params={{ studentNo: student.studentNo }}
      className="student-card"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
        }
      }}
    >
      <div className="student-card-header">
        <Avatar name={student.fullName} color="ink" size={40} />
        <div className="student-card-main">
          <Group gap="xs" wrap="wrap">
            <Highlight span highlight={search} fw={600}>
              {student.fullName || '—'}
            </Highlight>
            <Badge color={statusColor(student.status)} size="sm">
              {student.status}
            </Badge>
          </Group>
          <Group gap="xs" wrap="wrap" className="student-card-meta">
            <Text size="xs" c="dimmed" ff="monospace" fw={500}>
              <Highlight span highlight={search} fz="xs" c="dimmed" ff="monospace" fw={500}>
                {student.studentNo}
              </Highlight>
            </Text>
            {student.phone && (
              <Text size="xs" c="dimmed">
                <Highlight span highlight={search} fz="xs" c="dimmed">
                  {student.phone}
                </Highlight>
              </Text>
            )}
            <Text size="xs" c="dimmed" className="tnum">
              {formatDate(student.dateRegistered)}
            </Text>
          </Group>
          <Text size="xs" c="dimmed" truncate className="student-card-email">
            <Highlight span highlight={search} fz="xs" c="dimmed">
              {student.email || student.universityEmail || 'No email on file'}
            </Highlight>
          </Text>
        </div>
      </div>
      <CaretRightIcon className="student-card-chevron" size={16} aria-hidden="true" />
    </Link>
  )

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap" className="page-header">
        <div>
          <Title order={1} className="page-title">
            Students
          </Title>
          <Text c="dimmed" size="sm" mt={4} component="div">
            {!data ? (
              <Skeleton h={14} w={230} mt={4} />
            ) : search ? (
              <>
                <AnimatedNumber value={total} /> {total === 1 ? 'student matches' : 'students match'} “{search}”
              </>
            ) : (
              <>
                <AnimatedNumber value={total} /> active students in Business Central
              </>
            )}
          </Text>
        </div>
        <Button data-premium="true" leftSection={<PlusIcon size={16} weight="bold" />} onClick={openCreate}>
          Register student
        </Button>
      </Group>

      <div className="search-wrap">
        <TextInput
          ref={inputRef}
          size="md"
          aria-label="Search students"
          placeholder={narrow ? 'Search students' : 'Search by name, student number, ID, phone or email'}
          leftSection={<MagnifyingGlassIcon size={18} />}
          rightSectionPointerEvents="all"
          rightSection={
            isFetching ? (
              <Loader size="xs" />
            ) : search ? (
              <CloseButton aria-label="Clear search" onClick={() => void navigate({ to: '/', search: { search: '', page: 1, pageSize }, replace: true })} />
            ) : (
              <Kbd size="xs">/</Kbd>
            )
          }
          value={search}
          onChange={(e) => {
            const value = e.currentTarget.value
            void navigate({ to: '/', search: { search: value, page: 1, pageSize }, replace: true })
          }}
        />
        <Text className="search-hint" size="xs" c="dimmed" mt={6}>
          {search.trim().length === 1 ? 'Type at least 2 characters to search.' : ''}
        </Text>
      </div>

      {isError && (
        <Alert
          color="red"
          icon={<WarningCircleIcon size={18} />}
          title="Couldn't load students"
          role="alert"
        >
          <Text size="sm">{error instanceof Error ? error.message : 'Unexpected error.'}</Text>
          {error instanceof ApiError && error.requestId && (
            <Text size="xs" c="dimmed" mt={4}>
              Reference: {error.requestId}
            </Text>
          )}
          <Button
            mt="sm"
            size="xs"
            color="red"
            leftSection={<ArrowsClockwiseIcon size={14} />}
            onClick={() => void refetch()}
          >
            Try again
          </Button>
        </Alert>
      )}

      {!isError && (
        <Paper ref={listRef} className="panel" withBorder={false} style={{ overflow: 'hidden' }}>
          {/* Desktop Table */}
          <div className="desktop-table" style={{ display: narrow ? 'none' : 'block' }}>
            <Table.ScrollContainer minWidth={760} type="native">
              <Table className="student-table" verticalSpacing="xs">
                {(isLoading || table.getRowModel().rows.length > 0) && (
                  <Table.Thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <Table.Tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <Table.Th
                            key={header.id}
                            className={DESKTOP_HIDDEN_COLUMNS.has(header.column.id) ? 'hide-narrow' : undefined}
                          >
                            <FlexRender header={header} />
                          </Table.Th>
                        ))}
                      </Table.Tr>
                    ))}
                  </Table.Thead>
                )}
                <Table.Tbody>
                  {isLoading &&
                    Array.from({ length: 8 }).map((_row, i) => (
                      <Table.Tr key={i}>
                        {columns.map((col, j) => (
                          <Table.Td key={j} className={col.id && DESKTOP_HIDDEN_COLUMNS.has(col.id) ? 'hide-narrow' : undefined}>
                            <Skeleton h={18} />
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))}

                  {!isLoading &&
                    table.getRowModel().rows.map((row) => (
                      <Table.Tr
                        key={row.id}
                        data-row
                        className="student-row"
                        tabIndex={0}
                        role="button"
                        aria-label={`View ${row.original.fullName || row.original.studentNo}`}
                        onClick={() => goToStudent(row.original.studentNo)}
                        onKeyDown={(e) => handleRowKeyDown(e, row.original.studentNo)}
                      >
                        {row.getAllCells().map((cell) => (
                          <Table.Td
                            key={cell.id}
                            className={DESKTOP_HIDDEN_COLUMNS.has(cell.column.id) ? 'hide-narrow' : undefined}
                          >
                            <FlexRender cell={cell} />
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </div>

          {/* Mobile Card Stack */}
          <div className="mobile-cards" style={{ display: narrow ? 'flex' : 'none' }} role="list" aria-label="Students">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="student-card-skeleton">
                    <Skeleton height={40} width="40" radius="xl" />
                    <Skeleton height={16} width="60%" />
                    <Skeleton height={12} width="40%" />
                    <Skeleton height={12} width="80%" />
                  </div>
                ))
              : data?.items.map((student) => (
                  <div key={student.studentNo} role="listitem">
                    <StudentCard student={student} />
                  </div>
                ))}

            {!isLoading && data && data.items.length === 0 && (
              <div className="empty-state" style={{ width: '100%' }}>
                <Stack align="center" gap="xs" py={56} px="md">
                  {search ? <MagnifyingGlassIcon size={40} /> : <UsersThreeIcon size={40} />}
                  <Text fw={600} ta="center">
                    {search ? `No students match “${search}”` : 'No students yet'}
                  </Text>
                  <Text c="dimmed" size="sm" ta="center" maw={420}>
                    {search
                      ? 'Search looks at student number, name, ID number, phone and email. Try fewer letters, or part of a number.'
                      : 'Register the first student to see them here.'}
                  </Text>
                  {search ? (
                    <Button data-premium="secondary" onClick={() => void navigate({ to: '/', search: { search: '', page: 1, pageSize }, replace: true })}>
                      Clear search
                    </Button>
                  ) : (
                    <Button data-premium="true" onClick={openCreate}>
                      Register student
                    </Button>
                  )}
                </Stack>
              </div>
            )}
          </div>
        </Paper>
      )}

      {!isError && total > 0 && (
        <Group justify="space-between" wrap="wrap" className="pagination-bar">
          <Text size="sm" c="dimmed" className="tnum">
            Showing {from}–{to} of {total.toLocaleString()}
          </Text>
          <Group gap="md">
            <Select
              size="xs"
              w={112}
              aria-label="Rows per page"
              allowDeselect={false}
              data={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} / page` }))}
              value={String(pageSize)}
              onChange={(value) => {
                if (!value) return
                void navigate({ to: '/', search: { search, page: 1, pageSize: Number(value) } })
              }}
            />
            <Pagination
              total={totalPages}
              value={page}
              size="sm"
              onChange={(p) => void navigate({ to: '/', search: { search, page: p, pageSize } })}
            />
          </Group>
        </Group>
      )}

      <StudentFormDrawer opened={creating} onClose={closeCreate} />
    </Stack>
  )
}