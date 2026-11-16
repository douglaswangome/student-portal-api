import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '@/api/client'

export type FieldKey =
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'gender'
  | 'dateOfBirth'
  | 'idNumber'
  | 'nationality'
  | 'county'
  | 'phone'
  | 'alternatePhone'
  | 'email'
  | 'postalAddress'

export type Student = {
  studentNo: string
  firstName: string
  middleName: string
  lastName: string
  fullName: string
  gender: string
  dateOfBirth: string
  idNumber: string
  nationality: string
  nationalityName: string
  county: string
  countyName: string
  phone: string
  alternatePhone: string
  email: string
  universityEmail: string
  postalAddress: string
  status: string
  dateRegistered: string
  version: string
}

export type StudentList = {
  items: Student[]
  total: number
  page: number
  pageSize: number
}

export type LookupItem = {
  code: string
  name: string
}

export type Lookups = {
  nationalities: LookupItem[]
  counties: LookupItem[]
}

// What we send to the API. On update, only changed fields plus "version".
export type StudentInput = Partial<Record<FieldKey, string>> & { version?: string }

export type ListParams = {
  search: string
  page: number
  pageSize: number
}

export const studentKeys = {
  lists: ['students', 'list'] as const,
  list: (params: ListParams) => ['students', 'list', params] as const,
  detail: (studentNo: string) => ['students', 'detail', studentNo] as const,
  lookups: ['lookups'] as const,
}

export function useStudents(params: ListParams) {
  return useQuery({
    queryKey: studentKeys.list(params),
    queryFn: () => {
      const qs = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
      })
      if (params.search) qs.set('search', params.search)
      return request<StudentList>(`/students?${qs.toString()}`)
    },
    // Keep showing the previous page while the next one loads: no flicker.
    placeholderData: keepPreviousData,
  })
}

export function useStudent(studentNo: string) {
  return useQuery({
    queryKey: studentKeys.detail(studentNo),
    queryFn: () => request<Student>(`/students/${encodeURIComponent(studentNo)}`),
  })
}

export function useLookups() {
  return useQuery({
    queryKey: studentKeys.lookups,
    queryFn: () => request<Lookups>('/lookups'),
    staleTime: 60 * 60 * 1000, // setup data barely changes
  })
}

export function useCreateStudent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: StudentInput) =>
      request<Student>('/students', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (student) => {
      queryClient.setQueryData(studentKeys.detail(student.studentNo), student)
      void queryClient.invalidateQueries({ queryKey: studentKeys.lists })
    },
  })
}

export function useUpdateStudent(studentNo: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: StudentInput) =>
      request<Student>(`/students/${encodeURIComponent(studentNo)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (student) => {
      queryClient.setQueryData(studentKeys.detail(student.studentNo), student)
      void queryClient.invalidateQueries({ queryKey: studentKeys.lists })
    },
  })
}