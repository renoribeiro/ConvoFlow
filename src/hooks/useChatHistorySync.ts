/**
 * useChatHistorySync
 * 
 * Simplified React hook for WhatsApp message synchronization.
 * 
 * Strategy: Webhook-first approach
 * - New messages arrive via webhook (evolution-webhook Edge Function)
 * - Supabase Realtime pushes them to the UI instantly
 * - NO massive sync on connect — this avoids overloading the database
 * - Only provides a lightweight manual sync for individual conversations
 *   (on-demand, when the user opens a chat that might have gaps)
 */

import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';
import { useWhatsAppInstances } from './useWhatsAppInstances';
import { useEvolutionApi } from './useEvolutionApi';
import { syncSingleChat, syncChatHistory } from '@/services/chatHistorySyncService';

interface UseChatHistorySyncReturn {
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Sync a single conversation on-demand */
  syncConversation: (contactPhone: string, contactId: string) => Promise<{ newMessages: number }>;
  /** Manually sync all recent chats for the active instance */
  syncAllChats: () => Promise<void>;
}

export const useChatHistorySync = (): UseChatHistorySyncReturn => {
  const { tenant } = useTenant();
  const { instances } = useWhatsAppInstances();
  const { service } = useEvolutionApi();
  const queryClient = useQueryClient();

  const [isSyncing, setIsSyncing] = useState(false);

  // Get the active instance (prioritize connected ones)
  const activeInstance = instances?.find(i => i.status === 'connected' || i.status === 'open') || instances?.[0];
  const instanceName = activeInstance?.instanceKey || '';
  const instanceId = activeInstance?.id || '';

  /**
   * On-demand sync for a single conversation (when the user opens a chat).
   * This is a lightweight operation that only fetches the latest messages
   * for one specific chat, filling any gaps the webhook might have missed.
   */
  const syncConversation = useCallback(async (
    contactPhone: string,
    contactId: string
  ): Promise<{ newMessages: number }> => {
    if (!service || !tenant?.id || !instanceName || !instanceId) {
      return { newMessages: 0 };
    }

    setIsSyncing(true);

    try {
      const result = await syncSingleChat(
        service,
        instanceName,
        tenant.id,
        instanceId,
        contactPhone,
        contactId
      );

      if (result.newMessages > 0) {
        // Invalidate messages query for this contact
        queryClient.invalidateQueries({ queryKey: ['messages', contactId] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }

      return { newMessages: result.newMessages };
    } catch (err) {
      console.warn('Single conversation sync failed:', err);
      return { newMessages: 0 };
    } finally {
      setIsSyncing(false);
    }
  }, [service, tenant?.id, instanceName, instanceId, queryClient]);

  /**
   * Manual sync for all recent chats.
   * Restored to allow users to pull history for newly connected instances
   * without relying on automatic mass-syncs.
   */
  const syncAllChats = useCallback(async () => {
    if (!service || !tenant?.id || !instanceName || !instanceId || isSyncing) return;

    setIsSyncing(true);
    try {
      const result = await syncChatHistory(
        service,
        instanceName,
        tenant.id,
        instanceId
      );

      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['recent-conversations'] });
      }
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [service, tenant?.id, instanceName, instanceId, isSyncing, queryClient]);

  return {
    isSyncing,
    syncConversation,
    syncAllChats,
  };
};
