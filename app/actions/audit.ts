'use server'

import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/db-types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditLogRow {
  id:         string
  user_id:    string | null
  user_role:  string | null
  action:     string
  table_name: string | null
  record_id:  string | null
  old_value:  Record<string, unknown> | null
  new_value:  Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
  user_name:  string | null
}

export interface AuditLogPage {
  logs:     AuditLogRow[]
  total:    number
  page:     number
  pageSize: number
}

export interface AuditStats {
  total_actions:   number
  actions_by_type: { action: string; count: number }[]
  actions_by_user: { user_name: string; count: number }[]
  actions_by_day:  { date: string; count: number }[]
}

export interface AuditFilters {
  userId?:    string
  action?:    string
  tableName?: string
  dateFrom?:  string
  dateTo?:    string
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getCallerRole(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; role: UserRole | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, role: null }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return { supabase, role: (profile?.role ?? null) as UserRole | null }
}

// ─── getAuditLogs ─────────────────────────────────────────────────────────────

export async function getAuditLogs(
  filters?: AuditFilters,
  page = 1,
  pageSize = 50,
): Promise<{ data: AuditLogPage | null; error: string | null }> {
  const { supabase, role } = await getCallerRole()
  if (!role || !['superadmin', 'admin'].includes(role)) {
    return { data: null, error: 'Unauthorized' }
  }

  const offset = (page - 1) * pageSize

  let query = supabase
    .from('audit_logs')
    .select('id, user_id, user_role, action, table_name, record_id, old_value, new_value, ip_address, user_agent, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (filters?.userId)    query = query.eq('user_id', filters.userId)
  if (filters?.action)    query = query.eq('action', filters.action)
  if (filters?.tableName) query = query.eq('table_name', filters.tableName)
  if (filters?.dateFrom)  query = query.gte('created_at', filters.dateFrom)
  if (filters?.dateTo)    query = query.lte('created_at', filters.dateTo + 'T23:59:59Z')

  const { data: logs, count, error } = await query
  if (error) return { data: null, error: error.message }

  // Enrich with user names
  const userIds = [...new Set((logs ?? []).map(l => l.user_id).filter(Boolean))] as string[]
  let nameMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds)
    for (const p of (profiles ?? [])) {
      nameMap[p.id] = p.full_name ?? p.id
    }
  }

  return {
    data: {
      logs: (logs ?? []).map(l => ({
        ...l,
        old_value: l.old_value as Record<string, unknown> | null,
        new_value: l.new_value as Record<string, unknown> | null,
        user_name: l.user_id ? (nameMap[l.user_id] ?? null) : null,
      })),
      total:    count ?? 0,
      page,
      pageSize,
    },
    error: null,
  }
}

// ─── getAuditStats ────────────────────────────────────────────────────────────

export async function getAuditStats(
  dateFrom: string,
  dateTo: string,
): Promise<{ data: AuditStats | null; error: string | null }> {
  const { supabase, role } = await getCallerRole()
  if (role !== 'superadmin') return { data: null, error: 'Unauthorized' }

  // Fetch all logs in period (limited columns for efficiency)
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('action, user_id, created_at')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo + 'T23:59:59Z')
    .limit(5000)

  if (error) return { data: null, error: error.message }
  const rows = logs ?? []

  // total_actions
  const total_actions = rows.length

  // actions_by_type — top 10
  const typeCounts: Record<string, number> = {}
  for (const r of rows) typeCounts[r.action] = (typeCounts[r.action] ?? 0) + 1
  const actions_by_type = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([action, count]) => ({ action, count }))

  // actions_by_user — top 10 (need user names)
  const userCounts: Record<string, number> = {}
  for (const r of rows) {
    if (r.user_id) userCounts[r.user_id] = (userCounts[r.user_id] ?? 0) + 1
  }
  const topUserIds = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id)

  let actions_by_user: { user_name: string; count: number }[] = []
  if (topUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', topUserIds)
    const nameMap: Record<string, string> = {}
    for (const p of (profiles ?? [])) nameMap[p.id] = p.full_name ?? p.id
    actions_by_user = topUserIds.map(id => ({
      user_name: nameMap[id] ?? id,
      count:     userCounts[id],
    }))
  }

  // actions_by_day — group by UTC date
  const dayCounts: Record<string, number> = {}
  for (const r of rows) {
    const day = r.created_at.slice(0, 10)  // YYYY-MM-DD
    dayCounts[day] = (dayCounts[day] ?? 0) + 1
  }
  const actions_by_day = Object.entries(dayCounts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }))

  return {
    data: { total_actions, actions_by_type, actions_by_user, actions_by_day },
    error: null,
  }
}

// ─── getAuditFilterOptions ────────────────────────────────────────────────────

export interface AuditFilterOptions {
  users:      { id: string; full_name: string | null }[]
  tableNames: string[]
}

export async function getAuditFilterOptions(): Promise<{ data: AuditFilterOptions | null; error: string | null }> {
  const { supabase, role } = await getCallerRole()
  if (!role || !['superadmin', 'admin'].includes(role)) {
    return { data: null, error: 'Unauthorized' }
  }

  const [profilesResult, tablesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_deleted', false)
      .order('full_name'),
    supabase
      .from('audit_logs')
      .select('table_name')
      .not('table_name', 'is', null)
      .limit(5000),
  ])

  const tableNames = [...new Set(
    (tablesResult.data ?? []).map(r => r.table_name).filter(Boolean)
  )].sort() as string[]

  return {
    data: {
      users:      profilesResult.data ?? [],
      tableNames,
    },
    error: null,
  }
}
