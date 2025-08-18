import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/contexts/TenantContext'
import type {
  IndividualFollowup,
  FollowupStats,
  CreateFollowupData,
  UpdateFollowupData
} from '@/integrations/supabase/types'
import { toast } from 'sonner'

export interface UseFollowupsReturn {
  followups: IndividualFollowup[]
  stats: FollowupStats
  loading: boolean
  error: string | null
  createFollowup: (data: CreateFollowupData) => Promise<IndividualFollowup | null>
  updateFollowup: (id: string, data: UpdateFollowupData) => Promise<boolean>
  deleteFollowup: (id: string) => Promise<boolean>
  completeFollowup: (id: string) => Promise<boolean>
  getFollowupsByStatus: (status: string) => IndividualFollowup[]
  getOverdueFollowups: () => IndividualFollowup[]
  refreshFollowups: () => Promise<void>
}

export function useFollowups(): UseFollowupsReturn {
  const { tenant } = useTenant()
  const [followups, setFollowups] = useState<IndividualFollowup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Calculate stats from followups
  const stats: FollowupStats = {
    total: followups.length,
    pending: followups.filter(f => f.status === 'pending').length,
    completed: followups.filter(f => f.status === 'completed').length,
    overdue: followups.filter(f => {
      if (f.status === 'completed') return false
      const dueDate = new Date(f.due_date)
      const now = new Date()
      return dueDate < now
    }).length
  }

  // Fetch followups from Supabase
  const fetchFollowups = async () => {
    if (!tenant?.id) return

    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('individual_followups')
        .select(`
          *,
          contacts (
            id,
            name,
            phone
          )
        `)
        .eq('tenant_id', tenant.id)
        .order('due_date', { ascending: true })

      if (fetchError) {
        throw fetchError
      }

      setFollowups(data || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar follow-ups'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Create new followup
  const createFollowup = async (data: CreateFollowupData): Promise<IndividualFollowup | null> => {
    if (!tenant?.id) {
      toast.error('Tenant não encontrado')
      return null
    }

    try {
      const { data: newFollowup, error: createError } = await supabase
        .from('individual_followups')
        .insert({
          ...data,
          tenant_id: tenant.id,
          status: 'pending'
        })
        .select()
        .single()

      if (createError) {
        throw createError
      }

      await refreshFollowups()
      toast.success('Follow-up criado com sucesso!')
      return newFollowup
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar follow-up'
      toast.error(errorMessage)
      return null
    }
  }

  // Update followup
  const updateFollowup = async (id: string, data: UpdateFollowupData): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('individual_followups')
        .update(data)
        .eq('id', id)
        .eq('tenant_id', tenant?.id)

      if (updateError) {
        throw updateError
      }

      await refreshFollowups()
      toast.success('Follow-up atualizado com sucesso!')
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar follow-up'
      toast.error(errorMessage)
      return false
    }
  }

  // Delete followup
  const deleteFollowup = async (id: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await supabase
        .from('individual_followups')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant?.id)

      if (deleteError) {
        throw deleteError
      }

      await refreshFollowups()
      toast.success('Follow-up excluído com sucesso!')
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir follow-up'
      toast.error(errorMessage)
      return false
    }
  }

  // Complete followup
  const completeFollowup = async (id: string): Promise<boolean> => {
    return updateFollowup(id, { status: 'completed' })
  }

  // Get followups by status
  const getFollowupsByStatus = (status: string): IndividualFollowup[] => {
    return followups.filter(f => f.status === status)
  }

  // Get overdue followups
  const getOverdueFollowups = (): IndividualFollowup[] => {
    const now = new Date()
    return followups.filter(f => {
      if (f.status === 'completed') return false
      const dueDate = new Date(f.due_date)
      return dueDate < now
    })
  }

  // Refresh followups
  const refreshFollowups = async () => {
    await fetchFollowups()
  }

  // Load followups on mount and when tenant changes
  useEffect(() => {
    if (tenant?.id) {
      fetchFollowups()
    }
  }, [tenant?.id])

  // Set up real-time subscription
  useEffect(() => {
    if (!tenant?.id) return

    const subscription = supabase
      .channel('individual_followups_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'individual_followups',
          filter: `tenant_id=eq.${tenant.id}`
        },
        () => {
          // Refresh followups when changes occur
          fetchFollowups()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [tenant?.id])

  return {
    followups,
    stats,
    loading,
    error,
    createFollowup,
    updateFollowup,
    deleteFollowup,
    completeFollowup,
    getFollowupsByStatus,
    getOverdueFollowups,
    refreshFollowups
  }
}