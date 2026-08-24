-- =============================================================================
-- ConvoFlow — Respostas rápidas (projeto pqjkuwyshybxldzpfbbs)
-- Converte `message_templates` em `quick_replies` e conserta o RLS.
--
-- Cole o arquivo INTEIRO no SQL Editor do Supabase e rode de uma vez.
-- Idempotente: rodar duas vezes não quebra.
--
-- Equivale a:
--   supabase/migrations/20260824000001_quick_replies_from_message_templates.sql
--
-- NÃO rodar `supabase db push` neste projeto: 81 migrations locais não estão no
-- ledger e algumas mexem em dado real de usuário.
--
-- -----------------------------------------------------------------------------
-- PARA QUE SERVE
-- -----------------------------------------------------------------------------
-- A tabela `message_templates` existe desde janeiro e NUNCA recebeu uma linha
-- (n_tup_ins = 0). Duas coisas a mantinham morta:
--
--   1. A única policy era
--        USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
--      e este projeto não tem custom access token hook — nada escreve
--      `tenant_id` no JWT. O predicado é sempre NULL. Como o comando era ALL
--      com WITH CHECK nulo, ela travava LEITURA E ESCRITA para todo mundo.
--
--   2. Não havia tela para criar nada: os dois componentes chamados
--      MessageTemplates eram maquete com array fixo.
--
-- Depois deste script a Loja passa a ter respostas rápidas de verdade: o
-- atendente insere pelo botão de raio (ou digitando "/") no compositor, e a
-- automação "Enviar Mensagem" consegue escolher uma.
--
-- -----------------------------------------------------------------------------
-- O QUE ELE MEXE
-- -----------------------------------------------------------------------------
--   * renomeia public.message_templates    -> public.quick_replies
--   * APAGA 14 colunas que nenhum código lê (lista comentada lá embaixo)
--   * troca created_by de varchar(255) para uuid com FK para profiles
--   * cria updated_by + os dois nomes de exibição
--   * troca a policy morta pelo par canônico do projeto
--   * apaga as 3 linhas de exemplo da migração de criação, se existirem
--
-- Ele ABORTA sem tocar em nada se encontrar qualquer linha além dessas 3.
--
-- -----------------------------------------------------------------------------
-- ANTES DE RODAR — veja o estado de hoje (rode isto sozinho, primeiro):
-- -----------------------------------------------------------------------------
--   SELECT (SELECT count(*) FROM public.message_templates) AS linhas_hoje,
--          (SELECT count(*) FROM pg_policy
--            WHERE polrelid = 'public.message_templates'::regclass) AS policies_hoje;
--
-- Em 2026-08-24 isso devolvia linhas_hoje = 0 e policies_hoje = 1.
-- Se `linhas_hoje` for maior que 0, PARE e olhe o conteúdo antes de continuar:
--
--   SELECT id, tenant_id, name, created_by, created_at
--     FROM public.message_templates ORDER BY created_at;
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Carimbo de autoria.
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER de propósito. A tela mostra "criado por Fulano", e as
-- policies de `profiles` só deixam o ATENDENTE ler a própria linha — um embed
-- `created_by:profiles(first_name,last_name)` devolveria NULL para toda
-- resposta escrita por outra pessoa. Em vez de alargar o SELECT de `profiles`
-- (que exporia telefone, permissions, capabilities e last_ip dos colegas), a
-- leitura privilegiada acontece UMA vez, aqui, na escrita, e o nome fica
-- gravado na linha.
--
-- O carimbo também garante que ninguém reescreve autoria: todo cargo edita as
-- respostas da Loja, então `created_by` é forçado a partir do OLD no UPDATE.
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
-- Bloco DO único, e não BEGIN/COMMIT, porque no SQL Editor do Supabase
-- BEGIN/COMMIT NÃO garante atomicidade — em 2026-08-20 o
-- docs/remover_lojas_orfas.sql estourou no meio e os DELETE já executados
-- ficaram gravados mesmo assim. Um bloco DO é um comando só: ou termina, ou o
-- PostgreSQL desfaz tudo o que ele fez. É o que faz o RAISE EXCEPTION abaixo
-- significar de verdade "nada aconteceu".
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
  -- `(SELECT id FROM tenants LIMIT 1)` — joga templates numa Conta arbitrária.
  -- Em produção ele nunca chegou a rodar, mas todo ambiente reconstruído a
  -- partir das migrações tem as 3 linhas. Apagá-las aqui pela assinatura faz os
  -- ambientes convergirem sem reescrever o arquivo de história.
  IF v_tem_antiga THEN
    DELETE FROM public.message_templates
     WHERE created_by = 'Sistema'
       AND name IN ('Boas-vindas Padrão', 'Confirmação de Pedido', 'Suporte Técnico');

    SELECT count(*) INTO v_linhas FROM public.message_templates;

    -- Falha alto em vez de destruir dado que alguém criou por fora.
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
  -- com FK de verdade. A tabela está vazia: derrubar e recriar não perde nada.
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
  -- O RENAME da tabela NÃO renomeia as constraints: sem isto a PK e a FK de
  -- tenant continuam se chamando message_templates_*, o que confunde quem for
  -- ler o schema e quebra qualquer embed do PostgREST que cite a FK pelo nome.
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.quick_replies'::regclass
                AND conname  = 'message_templates_pkey') THEN
    ALTER TABLE public.quick_replies RENAME CONSTRAINT message_templates_pkey TO quick_replies_pkey;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.quick_replies'::regclass
                AND conname  = 'message_templates_tenant_id_fkey') THEN
    ALTER TABLE public.quick_replies
      RENAME CONSTRAINT message_templates_tenant_id_fkey TO quick_replies_tenant_id_fkey;
  END IF;

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

  -- O índice da UNIQUE acima começa por tenant_id, então já atende a busca por
  -- Conta: o índice solto virou redundante. Os outros três (category, status,
  -- folder_id) caíram junto com as colunas.
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


-- -----------------------------------------------------------------------------
-- 4. Registro no ledger, já que a aplicação é manual.
-- -----------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260824000001', 'quick_replies_from_message_templates')
ON CONFLICT (version) DO NOTHING;


-- =============================================================================
-- DEPOIS DE RODAR — conferir
-- =============================================================================
-- 1) A tabela tem 10 colunas, as 2 policies certas, o gatilho e o ledger:
--
--   SELECT 'colunas' AS item,
--          CASE WHEN count(*) = 10 THEN 'ok' ELSE 'ERRADO: ' || count(*) END AS situacao
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'quick_replies'
--   UNION ALL
--   SELECT 'policies',
--          CASE WHEN count(*) = 2 THEN 'ok' ELSE 'ERRADO: ' || count(*) END
--     FROM pg_policy WHERE polrelid = 'public.quick_replies'::regclass
--   UNION ALL
--   SELECT 'policy morta sumiu',
--          CASE WHEN count(*) = 0 THEN 'ok' ELSE 'AINDA EXISTE' END
--     FROM pg_policy
--    WHERE polrelid = 'public.quick_replies'::regclass
--      AND pg_get_expr(polqual, polrelid) ILIKE '%auth.jwt%tenant_id%'
--   UNION ALL
--   SELECT 'gatilho',
--          CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--     FROM pg_trigger
--    WHERE tgrelid = 'public.quick_replies'::regclass
--      AND tgname = 'trigger_stamp_quick_reply_authorship'
--   UNION ALL
--   SELECT 'tabela antiga sumiu',
--          CASE WHEN to_regclass('public.message_templates') IS NULL THEN 'ok' ELSE 'AINDA EXISTE' END
--   UNION ALL
--   SELECT 'ledger',
--          CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--     FROM supabase_migrations.schema_migrations WHERE version = '20260824000001';
--
--   Esperado: seis linhas 'ok'.
--
-- 2) As policies são as canônicas (e não sobrou nada de auth.jwt):
--
--   SELECT polname, polcmd,
--          pg_get_expr(polqual, polrelid)      AS using_expr,
--          pg_get_expr(polwithcheck, polrelid) AS check_expr
--     FROM pg_policy WHERE polrelid = 'public.quick_replies'::regclass
--    ORDER BY polname;
--
-- 3) O teste de verdade é pelo produto, e precisa de DOIS cargos:
--    a. Entre como Gestor, abra Configurações › Respostas rápidas e crie uma
--       chamada "Saudação" com o corpo: Olá {first_name}, tudo bem?
--    b. Abra uma conversa, clique no raio (ou digite "/" no campo vazio) e
--       escolha "Saudação". O compositor deve mostrar o PRIMEIRO NOME do
--       contato já trocado, não "{first_name}".
--    c. Entre como Atendente da MESMA Loja: a resposta tem que aparecer, com
--       "Criado por <nome do Gestor>" — não "—". Esse é o teste do carimbo.
--    d. Entre como alguém de OUTRA Conta: a lista tem que vir vazia.
-- =============================================================================
