-- #############################################################################
-- ##  ARQUIVADA — SUPERSEDIDA. NÃO RODE.                                   ##
-- #############################################################################
--
-- Auditoria do ledger em 2026-08-24. O efeito deste arquivo já foi substituído
-- por uma migração posterior. Rodar hoje DESFAZ o estado atual:
--
--   Volta handle_new_user() para a versao de 2025: usuario novo deixaria de nascer com capabilities, parent_id e cargo v2 (a versao viva vem de 20260716000002).
--
-- Carimbada como aplicada no ledger (docs/reconciliar_ledger_migracoes.sql,
-- LOTE 3) para que nenhuma ferramenta tente rodá-la. Mantida só como história.
-- #############################################################################

-- Fix security function search path issues
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT public.get_current_user_role() = 'super_admin';
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, role, tenant_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    'tenant_user'::user_role,
    (SELECT id FROM public.tenants LIMIT 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';