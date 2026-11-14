import { SERVER_URL } from './transport'

export interface Record {
  played: number
  wins: number
  losses: number
  draws: number
}

/** Online win/loss record saved by the server. null when there is no server or it can't be reached. */
export async function fetchRecord(pid: string): Promise<Record | null> {
  if (!SERVER_URL) return null
  try {
    const r = await fetch(`${SERVER_URL}/api/stats/${encodeURIComponent(pid)}`)
    return r.ok ? ((await r.json()) as Record) : null
  } catch {
    return null
  }
}
