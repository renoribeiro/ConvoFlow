-- =============================================================================
-- Respostas rápidas: message_templates -> quick_replies
--
-- Converte a tabela `message_templates` (21 colunas, nenhuma linha jamais
-- inserida em produção: n_tup_ins = 0) na tabela `quick_replies`, com 10
-- colunas e uma policy que de fato funciona.
--
-- POR QUE A TABELA ESTAVA MORTA
-- -----------------------------------------------------------------------------
-- A única policy era:
--     USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
-- Este projeto NÃO tem custom access token hook: nada escreve `tenant_id` no
-- JWT. O predicado é sempre NULL, a policy nunca é verdadeira, e como o comando
-- era ALL com WITH CHECK nulo, ela travava LEITURA E ESCRITA. O seletor de
-- template do AutomationBuilder vinha vazio desde sempre.
--
-- POR QUE O RENOME
-- -----------------------------------------------------------------------------
-- "Template" já significa outra coisa aqui: a tela /dashboard/templates lista os
-- templates APROVADOS NA META, vindos da Graph API, sem tabela nossa. Manter
-- `message_templates` para guardar resposta rápida perpetua a colisão. Nada
-- aponta para esta tabela (nenhuma FK, nenhuma view) e nenhum fluxo salvo pode
-- conter `message_template_id`, porque o seletor que gravava esse campo nunca
-- teve uma opção para escolher.
--
-- ESTE ARQUIVO É IDEMPOTENTE E CONVERGENTE
-- -----------------------------------------------------------------------------
-- Roda a partir de qualquer um dos estados (tabela antiga intacta, já migrada,
-- migrada pela metade) e termina no mesmo lugar.
--
-- Aplicação: colar docs/aplicar_quick_replies.sql no SQL Editor.
-- NÃO rodar `supabase db push` neste projeto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Carimbo de autoria.
-- -----------------------------------------------------------------------------
-- Roda como SECURITY DEFINER de propósito. A tela mostra "criado por Fulano", e
-- as policies de `profiles` só deixam o ATENDENTE ler a própria linha — um
-- embed `created_by:profiles(first_name,last_name)` devolveria NULL para toda
-- resposta escrita por outra pessoa. Em vez de alargar o SELECT de `profiles`
-- (que exporia telefone, permissions, capabilities e last_ip dos colegas), a
-- leitura privilegiada acontece UMA vez, aqui, na hora da escrita, e o nome
-- fica gravado na linha.
--
-- O carimbo também é a garantia de que ninguém reescreve autoria: todo cargo
-- edita as respostas da Loja, então `created_by` é forçado a partir do OLD no
-- UPDATE e o cliente não tem como forjar nenhum dos quatro campos.
CREATE OR REPLACE FUNCTION public.stamp_quick_reply_authorship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_profile_id uuid;
  v_nome       text;
BEGIN
  SELECT p.id,
         nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    INTO v_profile_id, v_nome
    FROM public.profiles p
   WHERE p.user_id = auth.uid()
   LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by      := v_profile_id;
    NEW.created_by_name := v_nome;
    NEW.updated_by      := v_profile_id;
    NEW.updated_by_name := v_nome;
    NEW.created_at      := now();
    NEW.updated_at      := now();
  ELSE
    NEW.created_by      := OLD.created_by;
    NEW.created_by_name := OLD.created_by_name;
    NEW.created_at      := OLD.created_at;
    NEW.updated_at      := now();
    -- auth.uid() é NULL sob service key. Preserva o último humano em vez de
    -- apagar a autoria com uma escrita de máquina.
    IF v_profile_id IS NOT NULL THEN
      NEW.updated_by      := v_profile_id;
      NEW.updated_by_name := v_nome;
    ELSE
      NEW.updated_by      := OLD.updated_by;
      NEW.updated_by_name := OLD.updated_by_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.stamp_quick_reply_authorship() IS
  'Carimba created_by/updated_by e o nome de exibicao em quick_replies. SECURITY DEFINER porque profiles nega ao atendente a leitura da linha dos colegas; a autoria de criacao e imutavel no UPDATE.';

-- -----------------------------------------------------------------------------
-- 2. A transformação inteira, em UM comando.
-- -----------------------------------------------------------------------------
-- Bloco DO único porque no SQL Editor do Supabase BEGIN/COMMIT NÃO garante
-- atomicidade (docs/remover_lojas_orfas.sql, 2026-08-20: DELETEs ficaram
-- gravados depois de um erro no meio). Um bloco DO é um comando só: ou termina,
-- ou o PostgreSQL desfaz tudo o que ele fez.
DO $mig$
DECLARE
  v_tem_antiga boolean;
  v_tem_nova   boolean;
  v_linhas     bigint;
BEGIN
  v_tem_antiga := to_regclass('public.message_templates') IS NOT NULL;
  v_tem_nova   := to_regclass('public.quick_replies')     IS NOT NULL;

  IF NOT v_tem_antiga AND NOT v_tem_nova THEN
    RAISE EXCEPTION
      'Nem public.message_templates nem public.quick_replies existem. Rode antes a migracao 20250103000003_create_message_templates.sql.';
  END IF;

  IF v_tem_antiga AND v_tem_nova THEN
    RAISE EXCEPTION
      'public.message_templates E public.quick_replies existem ao mesmo tempo. Estado inesperado — resolva a mao. Nada foi alterado.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 2a. Limpa a semente e confere que não há dado de verdade.
  -- ---------------------------------------------------------------------------
  -- A migração de criação termina com um INSERT de 3 exemplos usando
  -- `(SELECT id FROM tenants LIMIT 1)` — ou seja, joga templates numa Conta
  -- arbitrária. Em produção esse INSERT nunca chegou a rodar (n_tup_ins = 0),
  -- mas qualquer ambiente reconstruído a partir das migrações tem as 3 linhas.
  -- Removê-las aqui, pela assinatura, faz todos os ambientes convergirem sem
  -- precisar reescrever o arquivo de história.
  IF v_tem_antiga THEN
    DELETE FROM public.message_templates
     WHERE created_by = 'Sistema'
       AND name IN ('Boas-vindas Padrão', 'Confirmação de Pedido', 'Suporte Técnico');

    SELECT count(*) INTO v_linhas FROM public.message_templates;

    -- Falha alto em vez de destruir dado que alguém tenha criado por fora. As
    -- colunas abaixo são apagadas: se houver linha viva, quem roda precisa
    -- olhar antes de decidir.
    IF v_linhas > 0 THEN
      RAISE EXCEPTION
        'public.message_templates tem % linha(s) alem da semente conhecida. Este script apaga 14 colunas — confira o conteudo antes de rodar. Nada foi alterado.',
        v_linhas;
    END IF;

    ALTER TABLE public.message_templates RENAME TO quick_replies;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 2b. Derruba a policy morta e o gatilho antigo.
  -- ---------------------------------------------------------------------------
  DROP POLICY  IF EXISTS message_templates_tenant_policy ON public.quick_replies;
  DROP TRIGGER IF EXISTS trigger_update_message_templates_updated_at ON public.quick_replies;
  DROP FUNCTION IF EXISTS public.update_message_templates_updated_at();

  -- ---------------------------------------------------------------------------
  -- 2c. 21 colunas -> 10. Cada uma que fica é lida por código.
  -- ---------------------------------------------------------------------------
  -- description   o corpo já É a descrição; campo que ninguém preenche
  -- category/tags a tela busca por texto; não há tabela de categorias
  -- type/media    onSelect(content: string) só sabe colocar TEXTO no compositor
  -- channel       não existe compositor de e-mail nem de SMS no produto
  -- variables     descritor paralelo que ninguém lê — foi ele que produziu a
  --               deriva de {{chave}} contra o {chave} do resto do sistema
  -- quick_replies/buttons  são botões interativos do WhatsApp, não este recurso
  -- status        'pending_approval'/'rejected' são estados de template da META
  -- is_favorite   preferência de USUÁRIO guardada em linha de CONTA
  -- usage_count   exigiria escrita a cada escolha, no meio da conversa
  -- success_rate  nada no sistema sabe calcular isso
  -- folder_id     aponta para uma tabela de pastas que não existe
  ALTER TABLE public.quick_replies
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS category,
    DROP COLUMN IF EXISTS type,
    DROP COLUMN IF EXISTS channel,
    DROP COLUMN IF EXISTS variables,
    DROP COLUMN IF EXISTS quick_replies,
    DROP COLUMN IF EXISTS buttons,
    DROP COLUMN IF EXISTS media,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS is_favorite,
    DROP COLUMN IF EXISTS usage_count,
    DROP COLUMN IF EXISTS success_rate,
    DROP COLUMN IF EXISTS folder_id,
    DROP COLUMN IF EXISTS tags;

  -- created_by era varchar(255) e guardava string solta ('Sistema'). Vira uuid
  -- com FK de verdade. A tabela está vazia, então derrubar e recriar é honesto
  -- e não perde nada.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'quick_replies'
       AND column_name = 'created_by' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE public.quick_replies DROP COLUMN created_by;
  END IF;

  ALTER TABLE public.quick_replies
    ADD COLUMN IF NOT EXISTS created_by      uuid,
    ADD COLUMN IF NOT EXISTS created_by_name text,
    ADD COLUMN IF NOT EXISTS updated_by      uuid,
    ADD COLUMN IF NOT EXISTS updated_by_name text;

  ALTER TABLE public.quick_replies
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET DEFAULT now();

  UPDATE public.quick_replies SET created_at = now() WHERE created_at IS NULL;
  UPDATE public.quick_replies SET updated_at = now() WHERE updated_at IS NULL;

  ALTER TABLE public.quick_replies
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;

  -- ---------------------------------------------------------------------------
  -- 2d. Chaves, unicidade e integridade.
  -- ---------------------------------------------------------------------------
  -- ON DELETE SET NULL: a resposta pertence à Loja, não à pessoa. Apagar um
  -- perfil não pode levar junto a biblioteca do time — e o nome gravado em
  -- created_by_name continua aparecendo depois que a FK vira NULL.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.quick_replies'::regclass
       AND conname  = 'quick_replies_created_by_fkey'
  ) THEN
    ALTER TABLE public.quick_replies
      ADD CONSTRAINT quick_replies_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.quick_replies'::regclass
       AND conname  = 'quick_replies_updated_by_fkey'
  ) THEN
    ALTER TABLE public.quick_replies
      ADD CONSTRAINT quick_replies_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.quick_replies'::regclass
       AND conname  = 'quick_replies_name_nao_vazio'
  ) THEN
    ALTER TABLE public.quick_replies
      ADD CONSTRAINT quick_replies_name_nao_vazio CHECK (btrim(name) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.quick_replies'::regclass
       AND conname  = 'quick_replies_content_nao_vazio'
  ) THEN
    ALTER TABLE public.quick_replies
      ADD CONSTRAINT quick_replies_content_nao_vazio CHECK (btrim(content) <> '');
  END IF;

  -- Duas respostas com o mesmo nome numa paleta onde se escolhe PELO nome é um
  -- estado quebrado, e aqui todo cargo edita. A tela traduz o 23505.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.quick_replies'::regclass
       AND conname  = 'quick_replies_tenant_name_key'
  ) THEN
    ALTER TABLE public.quick_replies
      ADD CONSTRAINT quick_replies_tenant_name_key UNIQUE (tenant_id, name);
  END IF;

  -- O índice da UNIQUE acima começa por tenant_id, então ele já atende a busca
  -- por Conta: o índice solto de tenant_id virou redundante. Os outros três
  -- (category, status, folder_id) caíram junto com as colunas.
  DROP INDEX IF EXISTS public.idx_message_templates_tenant_id;
  DROP INDEX IF EXISTS public.idx_message_templates_created_at;

  -- ---------------------------------------------------------------------------
  -- 2e. Gatilho de autoria.
  -- ---------------------------------------------------------------------------
  DROP TRIGGER IF EXISTS trigger_stamp_quick_reply_authorship ON public.quick_replies;
  CREATE TRIGGER trigger_stamp_quick_reply_authorship
    BEFORE INSERT OR UPDATE ON public.quick_replies
    FOR EACH ROW
    EXECUTE FUNCTION public.stamp_quick_reply_authorship();

  -- ---------------------------------------------------------------------------
  -- 2f. RLS: o par canônico do projeto.
  -- ---------------------------------------------------------------------------
  -- get_current_user_tenant_id() lê profiles.tenant_id exigindo status='active'
  -- — é assim que contacts, tags, funnel_stages e webhooks se isolam. Sem
  -- capability nenhuma no meio: por decisão do produto, todo cargo lê E edita
  -- as respostas rápidas da própria Loja.
  ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS quick_replies_superadmin_all ON public.quick_replies;
  CREATE POLICY quick_replies_superadmin_all
    ON public.quick_replies
    FOR ALL
    TO authenticated
    USING (public.is_super_admin_safe())
    WITH CHECK (public.is_super_admin_safe());

  DROP POLICY IF EXISTS quick_replies_tenant_all ON public.quick_replies;
  CREATE POLICY quick_replies_tenant_all
    ON public.quick_replies
    FOR ALL
    TO authenticated
    USING (tenant_id = public.get_current_user_tenant_id())
    WITH CHECK (tenant_id = public.get_current_user_tenant_id());

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_replies TO authenticated;
END;
$mig$;

-- -----------------------------------------------------------------------------
-- 3. Documentação no próprio banco.
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.quick_replies IS
  'Respostas rapidas: trechos de mensagem que o atendente reaproveita no compositor (botao de raio / atalho "/") e que a automacao envia. NAO confundir com os templates aprovados na Meta, que a tela /dashboard/templates busca viva da Graph API e nao tem tabela aqui.';
COMMENT ON COLUMN public.quick_replies.content IS
  'Corpo da mensagem. Aceita {variavel} de chave simples — a mesma sintaxe de chatbot e automacao (substituteVariables). Token desconhecido fica literal.';
COMMENT ON COLUMN public.quick_replies.created_by_name IS
  'Nome de exibicao de quem criou, gravado na hora da escrita. Existe porque o RLS de profiles nao deixa o atendente ler a linha dos colegas para resolver o nome na leitura.';
COMMENT ON COLUMN public.quick_replies.updated_by_name IS
  'Nome de exibicao de quem editou por ultimo. Mesmo motivo de created_by_name.';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260824000001', 'quick_replies_from_message_templates')
ON CONFLICT (version) DO NOTHING;
