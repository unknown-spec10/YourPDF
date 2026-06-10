import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export interface JobStatusResponse {
  job_id: string
  status: 'queued' | 'processing' | 'done' | 'error'
  progress: number
  message: string
  result?: {
    status: string
    original_size_bytes?: number
    compressed_size_bytes?: number
    download_url: string
    text_snippet?: string
    extracted_text?: string
    width?: number
    height?: number
  }
}

export function useJobPolling(jobId: string | null, onDone?: (data: JobStatusResponse) => void) {
  return useQuery<JobStatusResponse>({
    queryKey: ['jobStatus', jobId],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/api/status/${jobId}`)
      const data = response.data
      
      if (data.status === 'done' && onDone) {
        onDone(data)
      }
      
      return data
    },
    enabled: !!jobId,
    // Poll every 2 seconds until the status is 'done' or 'error'
    refetchInterval: (query) => {
      const state = query.state.data?.status
      if (state === 'done' || state === 'error') {
        return false
      }
      return 2000
    },
  })
}
