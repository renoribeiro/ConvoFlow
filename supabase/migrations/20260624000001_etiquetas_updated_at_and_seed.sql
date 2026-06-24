-- Etiquetas (labels estilo WhatsApp): corrige bug latente de UPDATE e semeia exemplos por Conta.
--
-- Contexto:
--   A tabela public.tags possui o trigger update_tags_updated_at (BEFORE UPDATE ->
--   update_updated_at_column()), que faz NEW.updated_at = now(). Porém a coluna updated_at
--   nunca foi criada, então qualquer UPDATE em tags falha hoje ("record new has no field
--   updated_at"). Isso bloqueia editar/recolorir etiquetas. Aqui adicionamos a coluna e
--   passamos a oferecer um gerenciador independente de etiquetas, que precisa de exemplos
--   pre-criados em cada Conta.

-- 1) Corrige o bug latente: adiciona a coluna que o trigger espera.
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2) Funcao idempotente de seed de etiquetas-exemplo para uma Conta.
--    ON CONFLICT usa a constraint UNIQUE(tenant_id, name) ja existente em tags.
CREATE OR REPLACE FUNCTION public.seed_default_tags(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.tags (tenant_id, name, color) VALUES
    (p_tenant_id, 'Novo Lead',          '#3B82F6'),
    (p_tenant_id, 'Em negociação',      '#F59E0B'),
    (p_tenant_id, 'Cliente',            '#10B981'),
    (p_tenant_id, 'Pagamento pendente', '#EF4444'),
    (p_tenant_id, 'Pós-venda',          '#8B5CF6')
  ON CONFLICT (tenant_id, name) DO NOTHING;
$$;

-- 3) Backfill: garante os exemplos em todas as Contas ja existentes.
SELECT public.seed_default_tags(id) FROM public.tenants;

-- 4) Contas novas: semeia automaticamente no INSERT de tenants
--    (nao ha mecanismo de seeding de tenant hoje; provisionamento e SQL manual).
CREATE OR REPLACE FUNCTION public.seed_tags_for_new_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.seed_default_tags(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_tags_for_new_tenant ON public.tenants;
CREATE TRIGGER trg_seed_tags_for_new_tenant
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_tags_for_new_tenant();
