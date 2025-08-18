
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { CheckCircle, Clock, Phone, Mail, MessageSquare, Calendar, Edit, Trash2 } from 'lucide-react'
import { useFollowups } from '@/hooks/useFollowups'
import { FollowupEditModal } from '@/components/FollowupEditModal'
import type { IndividualFollowup } from '@/integrations/supabase/types'
import { toast } from 'sonner'

interface FollowupsListProps {
  status: 'pending' | 'today' | 'completed' | 'overdue'
}



export const FollowupsList = ({ status }: FollowupsListProps) => {
  const { followups, loading, updateFollowup, deleteFollowup, completeFollowup, getFollowupsByStatus, getOverdueFollowups } = useFollowups()
  const [selectedFollowup, setSelectedFollowup] = useState<IndividualFollowup | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // Filter followups based on status
  const getFilteredFollowups = (): IndividualFollowup[] => {
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

    switch (status) {
      case 'pending':
        return getFollowupsByStatus('pending')
      case 'today':
        return followups.filter(f => {
          const dueDate = new Date(f.due_date)
          return dueDate >= todayStart && dueDate <= todayEnd && f.status !== 'completed'
        })
      case 'completed':
        return getFollowupsByStatus('completed')
      case 'overdue':
        return getOverdueFollowups()
      default:
        return []
    }
  }

  const filteredFollowups = getFilteredFollowups()

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="w-4 h-4" />
      case 'email': return <Mail className="w-4 h-4" />
      case 'message': return <MessageSquare className="w-4 h-4" />
      case 'meeting': return <Calendar className="w-4 h-4" />
      case 'task': return <CheckCircle className="w-4 h-4" />
      default: return <Calendar className="w-4 h-4" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return 'Alta'
      case 'medium': return 'Média'
      case 'low': return 'Baixa'
      default: return priority
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'call': return 'Ligação'
      case 'email': return 'E-mail'
      case 'message': return 'Mensagem'
      case 'meeting': return 'Reunião'
      case 'task': return 'Tarefa'
      case 'other': return 'Outro'
      default: return type
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'overdue': return 'border-l-red-500 bg-red-50'
      case 'today': return 'border-l-blue-500 bg-blue-50'
      case 'completed': return 'border-l-green-500 bg-green-50'
      default: return 'border-l-gray-300'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const isToday = date.toDateString() === today.toDateString()
    const isTomorrow = date.toDateString() === tomorrow.toDateString()
    const isYesterday = date.toDateString() === yesterday.toDateString()

    const timeString = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    if (isToday) return `Hoje, ${timeString}`
    if (isTomorrow) return `Amanhã, ${timeString}`
    if (isYesterday) return `Ontem, ${timeString}`
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + `, ${timeString}`
  }

  const handleEdit = (followup: IndividualFollowup) => {
    setSelectedFollowup(followup)
    setIsEditModalOpen(true)
  }

  const handleComplete = async (followup: IndividualFollowup) => {
    const success = await completeFollowup(followup.id)
    if (success) {
      toast.success('Follow-up concluído com sucesso!')
    }
  }

  const handleCloseModal = () => {
    setIsEditModalOpen(false)
    setSelectedFollowup(null)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full" />
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-24" />
                    <div className="h-3 bg-gray-200 rounded w-32" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-6 bg-gray-200 rounded w-16" />
                  <div className="h-6 bg-gray-200 rounded w-20" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-3 bg-gray-200 rounded w-32" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (filteredFollowups.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="w-full h-full" />}
        title={`Nenhum follow-up ${status === 'pending' ? 'pendente' : status}`}
        description="Quando houver tarefas neste status, elas aparecerão aqui"
      />
    );
  }

  return (
    <>
      <div className="space-y-4">
        {filteredFollowups.map((followup) => (
        <Card key={followup.id} className={`border-l-4 ${getStatusColor(status)}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarFallback>
                    {((followup as any).contacts?.name || 'N/A').split(' ').map((n: string) => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-semibold">{(followup as any).contacts?.name || 'Contato não encontrado'}</h4>
                  <p className="text-sm text-muted-foreground">{(followup as any).contacts?.phone || 'N/A'}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge className={getPriorityColor(followup.priority)}>
                  {getPriorityLabel(followup.priority)}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  {getTypeIcon(followup.type)}
                  {getTypeLabel(followup.type)}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium">{followup.task}</p>
              <p className="text-sm text-muted-foreground">
                <Calendar className="w-4 h-4 inline mr-1" />
                {formatDate(followup.due_date)}
              </p>
              {followup.notes && (
                <p className="text-sm bg-muted p-2 rounded">
                  <strong>Notas:</strong> {followup.notes}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 mt-4">
              {followup.status !== 'completed' && (
                <Button 
                  size="sm" 
                  variant="default"
                  onClick={() => handleComplete(followup)}
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Concluir
                </Button>
              )}
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => handleEdit(followup)}
              >
                <Edit className="w-4 h-4 mr-1" />
                Editar
              </Button>
            </div>
          </CardContent>
        </Card>
        ))}
      </div>

      <FollowupEditModal
        followup={selectedFollowup}
        isOpen={isEditModalOpen}
        onClose={handleCloseModal}
        onSave={updateFollowup}
        onDelete={deleteFollowup}
      />
    </>
  )
}
