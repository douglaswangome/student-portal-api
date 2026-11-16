import dayjs from 'dayjs'

export function formatDate(iso: string): string {
  return iso ? dayjs(iso).format('D MMM YYYY') : '—'
}

export function ageFrom(iso: string): number | null {
  if (!iso) return null
  const years = dayjs().diff(dayjs(iso), 'year')
  return Number.isFinite(years) ? years : null
}

export function statusColor(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('current') || s.includes('active')) return 'green'
  if (s.includes('registration')) return 'blue'
  if (s.includes('alumn') || s.includes('graduat') || s.includes('complet')) return 'violet'
  if (s.includes('discontinu') || s.includes('suspend') || s.includes('expel')) return 'red'
  if (s.includes('defer') || s.includes('dormant')) return 'orange'
  return 'gray'
}