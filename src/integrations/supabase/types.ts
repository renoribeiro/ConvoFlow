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
          failed_count: number | null
          id: string
          media_url: string | null
          message_template: string
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
          failed_count?: number | null
          id?: string
          media_url?: string | null
          message_template: string
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
          failed_count?: number | null
          id?: string
          media_url?: string | null
          message_template?: string
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
      messages: {
        Row: {
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
      [_ in never]: never
    }
    Functions: {
      complete_job: {
        Args: {
          p_job_id: string
          p_success?: boolean
          p_error_message?: string
        }
        Returns: undefined
      }
      dequeue_next_job: {
        Args: { p_job_types?: string[] }
        Returns: {
          id: string
          tenant_id: string
          job_type: string
          job_data: Json
          current_attempts: number
        }[]
      }
      enqueue_job: {
        Args: {
          p_tenant_id: string
          p_job_type: string
          p_job_data?: Json
          p_priority?: number
          p_scheduled_at?: string
        }
        Returns: string
      }
      get_current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_current_user_tenant_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      handle_evolution_webhook: {
        Args: { instance_name: string; event_type: string; event_data: Json }
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
      process_chatbot_variables: {
        Args: {
          p_message_template: string
          p_contact_id: string
          p_incoming_message?: string
        }
        Returns: string
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
