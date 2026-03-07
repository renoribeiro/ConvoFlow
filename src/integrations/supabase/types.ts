export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      affiliate_referrals: {
        Row: {
          affiliate_id: string
          created_at: string
          first_payment_date: string | null
          id: string
          referral_date: string
          status: string | null
          tenant_id: string
          total_commission_paid: number | null
        }
        Insert: {
          affiliate_id: string
          created_at?: string
          first_payment_date?: string | null
          id?: string
          referral_date?: string
          status?: string | null
          tenant_id: string
          total_commission_paid?: number | null
        }
        Update: {
          affiliate_id?: string
          created_at?: string
          first_payment_date?: string | null
          id?: string
          referral_date?: string
          status?: string | null
          tenant_id?: string
          total_commission_paid?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_referrals_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_stripe_accounts: {
        Row: {
          account_status: string
          affiliate_id: string
          charges_enabled: boolean
          created_at: string
          details_submitted: boolean
          id: string
          payouts_enabled: boolean
          requirements: Json | null
          stripe_account_id: string
          updated_at: string
        }
        Insert: {
          account_status?: string
          affiliate_id: string
          charges_enabled?: boolean
          created_at?: string
          details_submitted?: boolean
          id?: string
          payouts_enabled?: boolean
          requirements?: Json | null
          stripe_account_id: string
          updated_at?: string
        }
        Update: {
          account_status?: string
          affiliate_id?: string
          charges_enabled?: boolean
          created_at?: string
          details_submitted?: boolean
          id?: string
          payouts_enabled?: boolean
          requirements?: Json | null
          stripe_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_stripe_accounts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          affiliate_code: string
          commission_rate_first_month: number | null
          commission_rate_recurring: number | null
          created_at: string
          email: string
          id: string
          is_active: boolean | null
          name: string
          stripe_account_id: string | null
          total_commission: number | null
          total_referrals: number | null
          updated_at: string
        }
        Insert: {
          affiliate_code: string
          commission_rate_first_month?: number | null
          commission_rate_recurring?: number | null
          created_at?: string
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          stripe_account_id?: string | null
          total_commission?: number | null
          total_referrals?: number | null
          updated_at?: string
        }
        Update: {
          affiliate_code?: string
          commission_rate_first_month?: number | null
          commission_rate_recurring?: number | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          stripe_account_id?: string | null
          total_commission?: number | null
          total_referrals?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      automation_executions: {
        Row: {
          completed_at: string | null
          contact_id: string | null
          current_step: number | null
          error_message: string | null
          execution_data: Json | null
          flow_id: string | null
          id: string
          started_at: string | null
          status: string | null
          tenant_id: string | null
          trigger_data: Json | null
        }
        Insert: {
          completed_at?: string | null
          contact_id?: string | null
          current_step?: number | null
          error_message?: string | null
          execution_data?: Json | null
          flow_id?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          trigger_data?: Json | null
        }
        Update: {
          completed_at?: string | null
          contact_id?: string | null
          current_step?: number | null
          error_message?: string | null
          execution_data?: Json | null
          flow_id?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          trigger_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_executions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_flows: {
        Row: {
          active: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          steps: Json | null
          tenant_id: string | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          steps?: Json | null
          tenant_id?: string | null
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          steps?: Json | null
          tenant_id?: string | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_flows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_step_logs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          execution_id: string | null
          id: string
          input_data: Json | null
          output_data: Json | null
          started_at: string | null
          status: string | null
          step_config: Json | null
          step_id: string
          step_type: string
          tenant_id: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          execution_id?: string | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          started_at?: string | null
          status?: string | null
          step_config?: Json | null
          step_id: string
          step_type: string
          tenant_id?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          execution_id?: string | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          started_at?: string | null
          status?: string | null
          step_config?: Json | null
          step_id?: string
          step_type?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_step_logs_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "automation_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_step_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_dispatch_queue: {
        Row: {
          campaign_id: string
          contact_id: string
          created_at: string
          error_message: string | null
          id: string
          message_text: string
          scheduled_at: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id: string
          contact_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_text: string
          scheduled_at: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_text?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_dispatch_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mass_message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_dispatch_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_executions: {
        Row: {
          campaign_id: string
          contact_id: string
          created_at: string
          error_message: string | null
          failed_at: string | null
          id: string
          job_id: string | null
          message_text: string
          scheduled_at: string
          sent_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          contact_id: string
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_id?: string | null
          message_text: string
          scheduled_at: string
          sent_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_id?: string | null
          message_text?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_executions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mass_message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_executions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_messages: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          message_text: string
          weight: number | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          message_text: string
          weight?: number | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          message_text?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mass_message_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          message_template: string
          name: string
          status: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          message_template: string
          name: string
          status?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          message_template?: string
          name?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbots: {
        Row: {
          conditions: Json | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          media_url: string | null
          name: string
          priority: number | null
          response_message: string
          response_type: string | null
          tenant_id: string
          trigger_phrases: string[] | null
          trigger_type: string
          updated_at: string
          variables: Json | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          conditions?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          media_url?: string | null
          name: string
          priority?: number | null
          response_message: string
          response_type?: string | null
          tenant_id: string
          trigger_phrases?: string[] | null
          trigger_type?: string
          updated_at?: string
          variables?: Json | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          conditions?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          media_url?: string | null
          name?: string
          priority?: number | null
          response_message?: string
          response_type?: string | null
          tenant_id?: string
          trigger_phrases?: string[] | null
          trigger_type?: string
          updated_at?: string
          variables?: Json | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbots_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_calculations: {
        Row: {
          affiliate_id: string
          base_amount: number
          billing_period_end: string | null
          billing_period_start: string | null
          calculation_type: string
          commission_amount: number
          commission_rate: number
          created_at: string
          id: string
          payment_id: string | null
          referral_id: string | null
        }
        Insert: {
          affiliate_id: string
          base_amount: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          calculation_type: string
          commission_amount: number
          commission_rate: number
          created_at?: string
          id?: string
          payment_id?: string | null
          referral_id?: string | null
        }
        Update: {
          affiliate_id?: string
          base_amount?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          calculation_type?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          id?: string
          payment_id?: string | null
          referral_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_calculations_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_calculations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "commission_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_calculations_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_payments: {
        Row: {
          affiliate_id: string
          amount: number
          created_at: string
          currency: string
          description: string | null
          id: string
          metadata: Json | null
          paid_at: string | null
          status: string
          stripe_payout_id: string | null
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          affiliate_id: string
          amount: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          status?: string
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_id?: string
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          status?: string
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_payments_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      company_users: {
        Row: {
          company_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_flow_step_id_temp: string | null
          current_stage_id: string | null
          email: string | null
          first_message: string | null
          id: string
          is_blocked: boolean | null
          last_interaction_at: string | null
          lead_source_id: string | null
          name: string | null
          notes: string | null
          opt_out_mass_message: boolean | null
          phone: string
          source_details: Json | null
          stage_entered_at: string | null
          tenant_id: string
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_flow_step_id_temp?: string | null
          current_stage_id?: string | null
          email?: string | null
          first_message?: string | null
          id?: string
          is_blocked?: boolean | null
          last_interaction_at?: string | null
          lead_source_id?: string | null
          name?: string | null
          notes?: string | null
          opt_out_mass_message?: boolean | null
          phone: string
          source_details?: Json | null
          stage_entered_at?: string | null
          tenant_id: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_flow_step_id_temp?: string | null
          current_stage_id?: string | null
          email?: string | null
          first_message?: string | null
          id?: string
          is_blocked?: boolean | null
          last_interaction_at?: string | null
          lead_source_id?: string | null
          name?: string | null
          notes?: string | null
          opt_out_mass_message?: boolean | null
          phone?: string
          source_details?: Json | null
          stage_entered_at?: string | null
          tenant_id?: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          is_archived: boolean | null
          last_message_at: string | null
          tenant_id: string
          unread_count: number | null
          updated_at: string | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          last_message_at?: string | null
          tenant_id: string
          unread_count?: number | null
          updated_at?: string | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          last_message_at?: string | null
          tenant_id?: string
          unread_count?: number | null
          updated_at?: string | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          current_uses: number | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          max_uses: number | null
          stripe_coupon_id: string | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          stripe_coupon_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          stripe_coupon_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      evolution_api_instances: {
        Row: {
          api_key: string
          company_id: string
          connection_status: string | null
          created_at: string | null
          id: string
          instance_name: string
          last_connected_at: string | null
          qr_code: string | null
          server_url: string
        }
        Insert: {
          api_key: string
          company_id: string
          connection_status?: string | null
          created_at?: string | null
          id?: string
          instance_name: string
          last_connected_at?: string | null
          qr_code?: string | null
          server_url: string
        }
        Update: {
          api_key?: string
          company_id?: string
          connection_status?: string | null
          created_at?: string | null
          id?: string
          instance_name?: string
          last_connected_at?: string | null
          qr_code?: string | null
          server_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "evolution_api_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_sequences: {
        Row: {
          created_at: string
          description: string | null
          funnel_stage_id: string
          id: string
          is_active: boolean | null
          name: string
          tenant_id: string
          updated_at: string
          whatsapp_instance_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          funnel_stage_id: string
          id?: string
          is_active?: boolean | null
          name: string
          tenant_id: string
          updated_at?: string
          whatsapp_instance_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          funnel_stage_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id?: string
          updated_at?: string
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_sequences_funnel_stage_id_fkey"
            columns: ["funnel_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_sequences_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_steps: {
        Row: {
          conditions: Json | null
          created_at: string
          delay_hours: number
          id: string
          is_active: boolean | null
          media_url: string | null
          message_text: string
          message_type: string | null
          order: number
          sequence_id: string
        }
        Insert: {
          conditions?: Json | null
          created_at?: string
          delay_hours: number
          id?: string
          is_active?: boolean | null
          media_url?: string | null
          message_text: string
          message_type?: string | null
          order: number
          sequence_id: string
        }
        Update: {
          conditions?: Json | null
          created_at?: string
          delay_hours?: number
          id?: string
          is_active?: boolean | null
          media_url?: string | null
          message_text?: string
          message_type?: string | null
          order?: number
          sequence_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "follow_up_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_stages: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_final: boolean | null
          name: string
          order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_final?: boolean | null
          name: string
          order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_final?: boolean | null
          name?: string
          order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      individual_followups: {
        Row: {
          contact_id: string
          created_at: string
          due_date: string
          id: string
          notes: string | null
          priority: string
          recurring: boolean | null
          recurring_count: number | null
          recurring_type: string | null
          status: string | null
          task: string
          tenant_id: string
          type: string
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          priority: string
          recurring?: boolean | null
          recurring_count?: number | null
          recurring_type?: string | null
          status?: string | null
          task: string
          tenant_id: string
          type: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          priority?: string
          recurring?: boolean | null
          recurring_count?: number | null
          recurring_type?: string | null
          status?: string | null
          task?: string
          tenant_id?: string
          type?: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "individual_followups_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      job_queue: {
        Row: {
          completed_at: string | null
          created_at: string
          current_attempts: number
          error_message: string | null
          failed_at: string | null
          id: string
          job_data: Json
          job_type: string
          max_attempts: number
          priority: number
          scheduled_at: string
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_attempts?: number
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_data?: Json
          job_type: string
          max_attempts?: number
          priority?: number
          scheduled_at?: string
          started_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_attempts?: number
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_data?: Json
          job_type?: string
          max_attempts?: number
          priority?: number
          scheduled_at?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string | null
          current_attempts: number | null
          error_message: string | null
          id: number
          max_attempts: number | null
          payload: Json | null
          run_at: string | null
          status: string | null
          type: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string | null
          current_attempts?: number | null
          error_message?: string | null
          id?: never
          max_attempts?: number | null
          payload?: Json | null
          run_at?: string | null
          status?: string | null
          type: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          current_attempts?: number | null
          error_message?: string | null
          id?: never
          max_attempts?: number | null
          payload?: Json | null
          run_at?: string | null
          status?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          parameters: Json | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          parameters?: Json | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          parameters?: Json | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mass_message_campaigns: {
        Row: {
          completed_at: string | null
          created_at: string
          delay_between_messages: number | null
          description: string | null
          enable_message_randomization: boolean | null
          failed_count: number | null
          id: string
          max_delay_seconds: number | null
          media_url: string | null
          message_template: string
          message_templates: string[] | null
          min_delay_seconds: number | null
          name: string
          scheduled_at: string | null
          sent_count: number | null
          started_at: string | null
          status: string | null
          target_stages: string[] | null
          target_tags: string[] | null
          tenant_id: string
          total_recipients: number | null
          updated_at: string
          whatsapp_instance_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          delay_between_messages?: number | null
          description?: string | null
          enable_message_randomization?: boolean | null
          failed_count?: number | null
          id?: string
          max_delay_seconds?: number | null
          media_url?: string | null
          message_template: string
          message_templates?: string[] | null
          min_delay_seconds?: number | null
          name: string
          scheduled_at?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          target_stages?: string[] | null
          target_tags?: string[] | null
          tenant_id: string
          total_recipients?: number | null
          updated_at?: string
          whatsapp_instance_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          delay_between_messages?: number | null
          description?: string | null
          enable_message_randomization?: boolean | null
          failed_count?: number | null
          id?: string
          max_delay_seconds?: number | null
          media_url?: string | null
          message_template?: string
          message_templates?: string[] | null
          min_delay_seconds?: number | null
          name?: string
          scheduled_at?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          target_stages?: string[] | null
          target_tags?: string[] | null
          tenant_id?: string
          total_recipients?: number | null
          updated_at?: string
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mass_message_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_message_campaigns_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          buttons: Json | null
          category: string | null
          channel: string | null
          content: string
          created_at: string | null
          created_by: string | null
          description: string | null
          folder_id: string | null
          id: string
          is_favorite: boolean | null
          media: Json | null
          name: string
          quick_replies: Json | null
          status: string | null
          success_rate: number | null
          tags: Json | null
          tenant_id: string
          type: string | null
          updated_at: string | null
          usage_count: number | null
          variables: Json | null
        }
        Insert: {
          buttons?: Json | null
          category?: string | null
          channel?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          is_favorite?: boolean | null
          media?: Json | null
          name: string
          quick_replies?: Json | null
          status?: string | null
          success_rate?: number | null
          tags?: Json | null
          tenant_id: string
          type?: string | null
          updated_at?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Update: {
          buttons?: Json | null
          category?: string | null
          channel?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          is_favorite?: boolean | null
          media?: Json | null
          name?: string
          quick_replies?: Json | null
          status?: string | null
          success_rate?: number | null
          tags?: Json | null
          tenant_id?: string
          type?: string | null
          updated_at?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          campaign_id: string | null
          contact_id: string
          content: string | null
          created_at: string
          direction: string
          evolution_message_id: string | null
          id: string
          is_from_bot: boolean | null
          media_url: string | null
          message_type: string
          status: string | null
          tenant_id: string
          whatsapp_instance_id: string
        }
        Insert: {
          campaign_id?: string | null
          contact_id: string
          content?: string | null
          created_at?: string
          direction: string
          evolution_message_id?: string | null
          id?: string
          is_from_bot?: boolean | null
          media_url?: string | null
          message_type: string
          status?: string | null
          tenant_id: string
          whatsapp_instance_id: string
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string
          content?: string | null
          created_at?: string
          direction?: string
          evolution_message_id?: string | null
          id?: string
          is_from_bot?: boolean | null
          media_url?: string | null
          message_type?: string
          status?: string | null
          tenant_id?: string
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          tenant_id: string
          title: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          tenant_id: string
          title: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          tenant_id?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          id: string
          is_active: boolean | null
          last_name: string | null
          permissions: Json | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          query: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          query: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          query?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          created_at: string
          frequency: string
          id: string
          is_active: boolean | null
          last_sent_at: string | null
          name: string
          next_send_at: string | null
          parameters: Json | null
          recipients: string[] | null
          report_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          frequency: string
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          name: string
          next_send_at?: string | null
          parameters?: Json | null
          recipients?: string[] | null
          report_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          name?: string
          next_send_at?: string | null
          parameters?: Json | null
          recipients?: string[] | null
          report_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_config: {
        Row: {
          connect_client_id: string | null
          created_at: string
          environment: string | null
          id: string
          is_active: boolean
          publishable_key: string
          secret_key: string
          tenant_id: string | null
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          connect_client_id?: string | null
          created_at?: string
          environment?: string | null
          id?: string
          is_active?: boolean
          publishable_key: string
          secret_key: string
          tenant_id?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          connect_client_id?: string | null
          created_at?: string
          environment?: string | null
          id?: string
          is_active?: boolean
          publishable_key?: string
          secret_key?: string
          tenant_id?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_transactions: {
        Row: {
          affiliate_id: string | null
          amount: number
          commission_amount: number | null
          commission_paid: boolean | null
          created_at: string | null
          currency: string
          description: string | null
          id: string
          metadata: Json | null
          net_amount: number | null
          payment_method: string | null
          processed_at: string | null
          status: string
          stripe_charge_id: string | null
          stripe_customer_id: string | null
          stripe_fee: number | null
          stripe_payment_intent_id: string | null
          tenant_id: string
          updated_at: string | null
          webhook_event_id: string | null
        }
        Insert: {
          affiliate_id?: string | null
          amount: number
          commission_amount?: number | null
          commission_paid?: boolean | null
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          net_amount?: number | null
          payment_method?: string | null
          processed_at?: string | null
          status: string
          stripe_charge_id?: string | null
          stripe_customer_id?: string | null
          stripe_fee?: number | null
          stripe_payment_intent_id?: string | null
          tenant_id: string
          updated_at?: string | null
          webhook_event_id?: string | null
        }
        Update: {
          affiliate_id?: string | null
          amount?: number
          commission_amount?: number | null
          commission_paid?: boolean | null
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          net_amount?: number | null
          payment_method?: string | null
          processed_at?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_customer_id?: string | null
          stripe_fee?: number | null
          stripe_payment_intent_id?: string | null
          tenant_id?: string
          updated_at?: string | null
          webhook_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_transactions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          stripe_event_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          processed?: boolean
          processed_at?: string | null
          stripe_event_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          stripe_event_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          affiliate_code: string | null
          affiliate_id: string | null
          created_at: string
          domain: string | null
          id: string
          max_users: number | null
          max_whatsapp_instances: number | null
          name: string
          plan_type: string | null
          settings: Json | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"] | null
          subscription_id: string | null
          subscription_status: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          affiliate_code?: string | null
          affiliate_id?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          max_users?: number | null
          max_whatsapp_instances?: number | null
          name: string
          plan_type?: string | null
          settings?: Json | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"] | null
          subscription_id?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_code?: string | null
          affiliate_id?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          max_users?: number | null
          max_whatsapp_instances?: number | null
          name?: string
          plan_type?: string | null
          settings?: Json | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"] | null
          subscription_id?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          evolution_api_key: string | null
          evolution_api_url: string | null
          id: string
          instance_key: string
          is_active: boolean | null
          last_connected_at: string | null
          name: string
          phone_number: string | null
          profile_name: string | null
          profile_picture_url: string | null
          qr_code: string | null
          status: string | null
          tenant_id: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          id?: string
          instance_key: string
          is_active?: boolean | null
          last_connected_at?: string | null
          name: string
          phone_number?: string | null
          profile_name?: string | null
          profile_picture_url?: string | null
          qr_code?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          id?: string
          instance_key?: string
          is_active?: boolean | null
          last_connected_at?: string | null
          name?: string
          phone_number?: string | null
          profile_name?: string | null
          profile_picture_url?: string | null
          qr_code?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_users_view: {
        Row: {
          created_at: string | null
          email: string | null
          email_confirmed_at: string | null
          first_name: string | null
          id: string | null
          is_active: boolean | null
          last_name: string | null
          last_sign_in_at: string | null
          phone: string | null
          profile_updated_at: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calculate_affiliate_commission: {
        Args: {
          p_affiliate_id: string
          p_base_amount: number
          p_calculation_type: string
          p_billing_period_start?: string
          p_billing_period_end?: string
        }
        Returns: string
      }
      complete_job: {
        Args:
          | { p_job_id: number; p_success: boolean; p_error_message?: string }
          | { p_job_id: string; p_success: boolean; p_error_message?: string }
        Returns: boolean
      }
      dequeue_next_job: {
        Args: Record<PropertyKey, never> | { p_job_types: string[] }
        Returns: {
          id: number
          company_id: string
          type: string
          payload: Json
          status: string
          run_at: string
          completed_at: string
          current_attempts: number
          max_attempts: number
          error_message: string
          created_at: string
        }[]
      }
      enqueue_job: {
        Args:
          | {
              p_company_id: string
              p_job_type: string
              p_job_data: Json
              p_scheduled_at?: string
            }
          | {
              p_tenant_id: string
              p_job_type: string
              p_job_data?: Json
              p_priority?: number
              p_scheduled_at?: string
            }
        Returns: string
      }
      get_admin_users_data: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          user_id: string
          first_name: string
          last_name: string
          role: string
          phone: string
          avatar_url: string
          is_active: boolean
          created_at: string
          updated_at: string
          tenant_id: string
          email: string
          tenant_name: string
          plan_type: string
        }[]
      }
      get_auth_users_for_admin: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          email: string
          created_at: string
          last_sign_in_at: string
          email_confirmed_at: string
        }[]
      }
      get_current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_current_user_tenant_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_delivery_log: {
        Args: { p_company_id: string }
        Returns: {
          contact_name: string
          phone: string
          message_content: string
          status: string
          sent_at: string
        }[]
      }
      get_followup_stats: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      get_stripe_transaction_stats: {
        Args: {
          p_tenant_id: string
          p_start_date?: string
          p_end_date?: string
        }
        Returns: {
          total_transactions: number
          total_amount: number
          total_fees: number
          total_net_amount: number
          total_commission: number
          successful_transactions: number
          failed_transactions: number
          pending_transactions: number
          avg_transaction_amount: number
        }[]
      }
      handle_evolution_webhook: {
        Args: { instance_name: string; event_type: string; event_data: Json }
        Returns: undefined
      }
      handle_new_message: {
        Args:
          | { p_instance_name: string; p_message_data: Json }
          | { payload: Json }
        Returns: undefined
      }
      increment_campaign_sent_count: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      is_super_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      mark_all_notifications_as_read: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      mark_notification_as_read: {
        Args: { notification_id: string }
        Returns: undefined
      }
      process_chatbot_variables: {
        Args: {
          p_message_template: string
          p_contact_id: string
          p_incoming_message?: string
        }
        Returns: string
      }
      process_flow_step: {
        Args: {
          contact_id_arg: string
          chatbot_id_arg: string
          message_content_arg: string
        }
        Returns: undefined
      }
      process_incoming_message: {
        Args: {
          p_phone: string
          p_message_content: string
          p_whatsapp_instance_id: string
          p_evolution_message_id?: string
        }
        Returns: Json
      }
      schedule_campaign_messages: {
        Args: { p_campaign_id: string }
        Returns: number
      }
      schedule_follow_up_message: {
        Args: {
          p_contact_id: string
          p_sequence_id: string
          p_step_id: string
          p_delay_hours: number
        }
        Returns: string
      }
      update_affiliate_totals: {
        Args: { p_affiliate_id: string }
        Returns: undefined
      }
      update_message_status: {
        Args: { p_api_message_id: string; p_status: string }
        Returns: boolean
      }
    }
    Enums: {
      tenant_status: "active" | "inactive" | "trial" | "suspended" | "past_due"
      user_role: "super_admin" | "tenant_admin" | "tenant_user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      tenant_status: ["active", "inactive", "trial", "suspended", "past_due"],
      user_role: ["super_admin", "tenant_admin", "tenant_user"],
    },
  },
} as const

// Custom interfaces for Individual Followups
export type IndividualFollowup = Tables<'individual_followups'>

export interface FollowupStats {
  total: number
  pending: number
  completed: number
  overdue: number
}

export interface CreateFollowupData {
  contact_id: string
  task: string
  type: string
  priority: string
  due_date: string
  notes?: string
  recurring?: boolean
  recurring_type?: string
  recurring_count?: number
  whatsapp_instance_id?: string
}

export interface UpdateFollowupData {
  task?: string
  type?: string
  priority?: string
  due_date?: string
  notes?: string
  status?: string
  recurring?: boolean
  recurring_type?: string
  recurring_count?: number
  whatsapp_instance_id?: string
}
