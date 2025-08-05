-- Create job queue system for background processing
CREATE TABLE public.job_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  job_data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  current_attempts integer NOT NULL DEFAULT 0,
  scheduled_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  failed_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for efficient job processing
CREATE INDEX idx_job_queue_status_priority ON public.job_queue(status, priority DESC, scheduled_at ASC);
CREATE INDEX idx_job_queue_tenant_type ON public.job_queue(tenant_id, job_type);
CREATE INDEX idx_job_queue_scheduled_at ON public.job_queue(scheduled_at) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Super admins can access all jobs" ON public.job_queue
  FOR ALL USING (is_super_admin());

CREATE POLICY "Users can access own tenant jobs" ON public.job_queue
  FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Create function to enqueue jobs
CREATE OR REPLACE FUNCTION public.enqueue_job(
  p_tenant_id uuid,
  p_job_type text,
  p_job_data jsonb DEFAULT '{}',
  p_priority integer DEFAULT 0,
  p_scheduled_at timestamp with time zone DEFAULT now()
) RETURNS uuid AS $$
DECLARE
  job_id uuid;
BEGIN
  INSERT INTO public.job_queue (
    tenant_id,
    job_type,
    job_data,
    priority,
    scheduled_at
  ) VALUES (
    p_tenant_id,
    p_job_type,
    p_job_data,
    p_priority,
    p_scheduled_at
  ) RETURNING id INTO job_id;
  
  RETURN job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to dequeue next job
CREATE OR REPLACE FUNCTION public.dequeue_next_job(
  p_job_types text[] DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  job_type text,
  job_data jsonb,
  current_attempts integer
) AS $$
DECLARE
  job_record RECORD;
BEGIN
  -- Find and lock the next job to process
  SELECT jq.id, jq.tenant_id, jq.job_type, jq.job_data, jq.current_attempts
  INTO job_record
  FROM public.job_queue jq
  WHERE jq.status = 'pending'
    AND jq.scheduled_at <= now()
    AND (p_job_types IS NULL OR jq.job_type = ANY(p_job_types))
  ORDER BY jq.priority DESC, jq.scheduled_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF job_record.id IS NOT NULL THEN
    -- Mark job as processing
    UPDATE public.job_queue 
    SET 
      status = 'processing',
      started_at = now(),
      current_attempts = current_attempts + 1,
      updated_at = now()
    WHERE public.job_queue.id = job_record.id;
    
    -- Return job details
    RETURN QUERY SELECT 
      job_record.id,
      job_record.tenant_id,
      job_record.job_type,
      job_record.job_data,
      job_record.current_attempts;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to mark job as completed
CREATE OR REPLACE FUNCTION public.complete_job(
  p_job_id uuid,
  p_success boolean DEFAULT TRUE,
  p_error_message text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  IF p_success THEN
    UPDATE public.job_queue 
    SET 
      status = 'completed',
      completed_at = now(),
      updated_at = now()
    WHERE id = p_job_id;
  ELSE
    UPDATE public.job_queue 
    SET 
      status = CASE 
        WHEN current_attempts >= max_attempts THEN 'failed'
        ELSE 'pending'
      END,
      failed_at = CASE 
        WHEN current_attempts >= max_attempts THEN now()
        ELSE NULL
      END,
      error_message = p_error_message,
      updated_at = now(),
      scheduled_at = CASE 
        WHEN current_attempts < max_attempts THEN now() + interval '5 minutes'
        ELSE scheduled_at
      END
    WHERE id = p_job_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for updated_at
CREATE TRIGGER update_job_queue_updated_at
  BEFORE UPDATE ON public.job_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create campaign execution tracking
CREATE TABLE public.campaign_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.mass_message_campaigns(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  message_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamp with time zone NOT NULL,
  sent_at timestamp with time zone,
  failed_at timestamp with time zone,
  error_message text,
  job_id uuid REFERENCES public.job_queue(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_campaign_executions_campaign ON public.campaign_executions(campaign_id);
CREATE INDEX idx_campaign_executions_status ON public.campaign_executions(status);
CREATE INDEX idx_campaign_executions_scheduled ON public.campaign_executions(scheduled_at) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.campaign_executions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Super admins can access all campaign executions" ON public.campaign_executions
  FOR ALL USING (is_super_admin());

CREATE POLICY "Users can access own tenant campaign executions" ON public.campaign_executions
  FOR ALL USING (tenant_id = get_current_user_tenant_id());

-- Create trigger for updated_at
CREATE TRIGGER update_campaign_executions_updated_at
  BEFORE UPDATE ON public.campaign_executions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();