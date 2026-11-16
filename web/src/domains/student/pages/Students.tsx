import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  CloseButton,
  Group, Highlight, Kbd,
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
} from '@mantine/core';
import { useDebouncedValue, useDisclosure, useHotkeys, useMediaQuery } from '@mantine/hooks';
import {
  ArrowsClockwiseIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UsersThreeIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { createColumnHelper, FlexRender, tableFeatures, useTable } from '@tanstack/react-table';
import { ApiError } from '@/api/client';
import { useStudents, type Student } from '@/domains/student/api';
import { StudentFormDrawer } from '@/domains/student/components/FormDrawer';
import { PAGE_SIZES } from '@/lib/constants';
import { formatDate, statusColor } from '@/lib/format';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { useGsapEffect } from '@/lib/motion';
import gsap from 'gsap';

const features = tableFeatures({})
const columnHelper = createColumnHelper<typeof features, Student>()

const NO_STUDENTS: Student[] = []

const HIDE_ON_NARROW = new Set(['studentNo', 'phone', 'dateRegistered', 'open'])

export function StudentsPage() {
  const { search, page, pageSize } = useSearch({ from: '/' })
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [creating, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const narrow = useMediaQuery('(max-width: 760px)')

  // The input is local state; after a short pause it is copied into the URL.
  const [term, setTerm] = useState(search)
  const [debounced] = useDebouncedValue(term, 350)
  // BC needs at least 2 characters to search.
  const effectiveSearch = debounced.trim().length >= 2 ? debounced.trim() : ''

  useEffect(() => {
    if (effectiveSearch !== search) {
      void navigate({
        to: '/',
        search: { search: effectiveSearch, page: 1, pageSize },
        replace: true,
      })
    }
  }, [effectiveSearch, search, pageSize, navigate])

  // Press "/" anywhere to jump to the search box.
  useHotkeys([['/', () => inputRef.current?.focus()]])

  const { data, isLoading, isFetching, isError, error, refetch } = useStudents({ search, page, pageSize })

  const goToStudent = (studentNo: string) =>
    void navigate({ to: '/students/$studentNo', params: { studentNo } })

  // Columns depend on the search text so matches can be highlighted inside cells.
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: 'student',
          header: 'Student',
          cell: ({ row }) => (
            <Group gap="sm" wrap="nowrap">
              <Avatar name={row.original.fullName} color="ink" size={34} />
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

  // A stale link (page too high) falls back to page 1.
  useEffect(() => {
    if (data && data.items.length === 0 && data.total > 0 && page > 1) {
      void navigate({ to: '/', search: { search, page: 1, pageSize }, replace: true })
    }
  }, [data, page, search, pageSize, navigate])

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
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
        <Button leftSection={<PlusIcon size={16} weight="bold" />} onClick={openCreate}>
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
            ) : term ? (
              <CloseButton aria-label="Clear search" onClick={() => setTerm('')} />
            ) : (
              <Kbd size="xs">/</Kbd>
            )
          }
          value={term}
          onChange={(e) => setTerm(e.currentTarget.value)}
        />
        <Text className="search-hint" size="xs" c="dimmed" mt={6}>
          {term.trim().length === 1 ? 'Type at least 2 characters to search.' : ''}
        </Text>
      </div>

      {isError && (
        <Alert
          color="red"
          icon={<WarningCircleIcon size={18} />}
          title="Couldn't load students"
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
          <Table.ScrollContainer minWidth={narrow ? 0 : 760} type="native">
            <Table className="student-table" verticalSpacing="xs">
              {(isLoading || table.getRowModel().rows.length > 0) && (
                <Table.Thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <Table.Tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <Table.Th
                          key={header.id}
                          className={HIDE_ON_NARROW.has(header.column.id) ? 'hide-narrow' : undefined}
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
                        <Table.Td key={j} className={col.id && HIDE_ON_NARROW.has(col.id) ? 'hide-narrow' : undefined}>
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
                      onClick={() => goToStudent(row.original.studentNo)}
                    >
                      {row.getAllCells().map((cell) => (
                        <Table.Td
                          key={cell.id}
                          className={HIDE_ON_NARROW.has(cell.column.id) ? 'hide-narrow' : undefined}
                        >
                          <FlexRender cell={cell} />
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          {!isLoading && data && data.items.length === 0 && (
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
                <Button onClick={() => setTerm('')}>
                  Clear search
                </Button>
              ) : (
                <Button onClick={openCreate}>
                  Register student
                </Button>
              )}
            </Stack>
          )}
        </Paper>
      )}

      {!isError && total > 0 && (
        <Group justify="space-between" wrap="wrap">
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