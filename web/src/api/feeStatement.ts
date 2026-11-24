import { useMutation } from '@tanstack/react-query'
import { ApiError, requestBlob } from './client'

// Dates are 'YYYY-MM-DD'. An empty string means "no limit on that side".
export interface FeeStatementRange {
  from: string
  to: string
}

export type FeeStatementMode = 'download' | 'preview'

interface FeeStatementRequest {
  mode: FeeStatementMode
  range: FeeStatementRange
  // For 'preview': the tab, opened by the click handler (see FeeStatementSection).
  tab: Window | null
}

export interface FeeStatementResult {
  mode: FeeStatementMode
  fileName: string
  fellBackToDownload: boolean
}

export function feeStatementFileName(studentNo: string, range: FeeStatementRange): string {
  const safeNo = studentNo.replace(/[^A-Za-z0-9._-]+/g, '-')
  const dates = range.from || range.to ? `-${range.from || 'start'}_to_${range.to || 'today'}` : ''
  return `fee-statement-${safeNo}${dates}.pdf`
}

async function fetchFeeStatement(studentNo: string, range: FeeStatementRange): Promise<Blob> {
  const params: Record<string, string> = {}
  if (range.from) params.from = range.from
  if (range.to) params.to = range.to

  const blob = await requestBlob(`/students/${encodeURIComponent(studentNo)}/fee-statement`, params)

  if (!blob.type.toLowerCase().includes('pdf')) {
    throw new ApiError(502, 'NOT_A_PDF', 'The server did not return a PDF. Please try again.')
  }
  return blob
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser time to start the save before releasing the file from memory.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function showInTab(blob: Blob, tab: Window): void {
  const url = URL.createObjectURL(blob)
  tab.location.href = url
  // Keep the address alive long enough for the PDF viewer, including a reload.
  window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
}

export function useFeeStatement(studentNo: string) {
  return useMutation<FeeStatementResult, ApiError, FeeStatementRequest>({
    mutationFn: async ({ mode, range, tab }) => {
      const fileName = feeStatementFileName(studentNo, range)
      try {
        const blob = await fetchFeeStatement(studentNo, range)
        if (mode === 'preview' && tab && !tab.closed) {
          showInTab(blob, tab)
          return { mode, fileName, fellBackToDownload: false }
        }
        saveBlob(blob, fileName)
        return { mode, fileName, fellBackToDownload: mode === 'preview' }
      } catch (error) {
        tab?.close()
        throw error
      }
    },
  })
}