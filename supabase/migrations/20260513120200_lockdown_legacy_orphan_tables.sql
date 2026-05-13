-- =============================================================================
-- Hardening: lock down de tabelas legado
-- =============================================================================
-- Tabelas órfãs sem tenant_id e sem referências no código moderno do app:
--   - campaigns                  (substituída por mass_message_campaigns)
--   - companies                  (substituída por tenants)        [2 rows de teste]
--   - company_users              (substituída por profiles)
--   - evolution_api_instances    (substituída por whatsapp_instances) [1 row de teste]
--   - jobs                       (substituída por job_queue)
--   - reports                    (substituída por report_data/executions/schedules)
--
-- Estratégia: ENABLE RLS sem policies = bloqueia tudo para authenticated/anon.
-- service_role continua bypassando (necessário caso algum job legado ainda
-- precise limpar dados). Em PR futuro: avaliar DROP TABLE depois de garantir
-- que nada mais lê.
-- =============================================================================

BEGIN;

ALTER TABLE public.campaigns               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_api_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports                 ENABLE ROW LEVEL SECURITY;

-- Defesa em profundidade: revogar GRANTs herdados das roles públicas.
REVOKE ALL ON public.campaigns               FROM anon, authenticated;
REVOKE ALL ON public.companies               FROM anon, authenticated;
REVOKE ALL ON public.company_users           FROM anon, authenticated;
REVOKE ALL ON public.evolution_api_instances FROM anon, authenticated;
REVOKE ALL ON public.jobs                    FROM anon, authenticated;
REVOKE ALL ON public.reports                 FROM anon, authenticated;

COMMENT ON TABLE public.campaigns               IS 'LEGACY/UNUSED — locked down, see mass_message_campaigns';
COMMENT ON TABLE public.companies               IS 'LEGACY/UNUSED — locked down, see tenants';
COMMENT ON TABLE public.company_users           IS 'LEGACY/UNUSED — locked down, see profiles';
COMMENT ON TABLE public.evolution_api_instances IS 'LEGACY/UNUSED — locked down, see whatsapp_instances';
COMMENT ON TABLE public.jobs                    IS 'LEGACY/UNUSED — locked down, see job_queue';
COMMENT ON TABLE public.reports                 IS 'LEGACY/UNUSED — locked down, see report_data/executions/schedules';

COMMIT;
