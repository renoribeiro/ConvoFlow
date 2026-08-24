# Checklist de auditoria — botões, links e elementos interativos

> Gerado por `scripts/audit-extract-interactive.mjs` + `scripts/audit-checklist.mjs`.
> Reexecute com `node scripts/audit-extract-interactive.mjs . && node scripts/audit-reachability.mjs && node scripts/audit-checklist.mjs`.
> O status já marcado é preservado entre execuções.

## Legenda de status

| Status | Significado |
| --- | --- |
| `não testado` | ainda não verificado |
| `passa` | testado, funciona |
| `quebrado` | testado, defeito confirmado |
| `corrigido` | estava quebrado, corrigido e reteste passou |
| `inerte de propósito` | não faz nada por decisão de produto (em breve, desabilitado por permissão, desabilitado durante requisição) |
| `código órfão` | está num arquivo que nenhuma rota alcança — não chega ao usuário |
| `decisão sua` | não dá para saber se é bug ou escolha; listado no relatório final |

## Rotas reais (fonte da verdade: `src/App.tsx`)

Públicas: `/`, `/auth`, `/definir-senha`, `/login`, `/register` (redireciona para `/auth`), `/terms-of-service`, `/privacy-policy`

Dashboard: `/dashboard`, `conversations`, `contacts`, `funnel`, `tracking`, `reports`, `chatbots`, `chatbots/:id/builder`, `campaigns`, `templates`, `followups`, `automation`, `whatsapp-numbers`, `settings`, `admin`, `admin/users`, `admin/usage-limits`, `team`, `store-comparison`, `profile`, `notifications`, `help`

Qualquer outro caminho cai em `NotFound`.

## Resumo

- Elementos interativos catalogados: **983**
- Em arquivos alcançáveis pela aplicação: **758**
- Em arquivos órfãos (código morto): **225**

| Status | Elementos |
| --- | --- |
| não testado | 698 |
| código órfão | 219 |
| passa | 46 |
| corrigido | 9 |
| decisão sua | 8 |
| inerte de propósito | 3 |

| Área | Elementos |
| --- | --- |
| Administração | 45 |
| Autenticação | 26 |
| Automação | 37 |
| Campanhas | 45 |
| Chatbots | 82 |
| Compartilhado / infra | 78 |
| Configurações | 95 |
| Contatos | 25 |
| Conversas | 75 |
| Dashboard (início) | 32 |
| Follow-ups | 45 |
| Funil | 31 |
| Landing (página de vendas) | 34 |
| Layout / navegação | 38 |
| Outras telas | 16 |
| Outros | 51 |
| Páginas legais | 8 |
| Rastreamento | 41 |
| Relatórios | 115 |
| WhatsApp / webhooks | 64 |

---

## Administração

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/admin/billing/BillingDashboard.tsx:167` | Âncora (`<a href>`) | Dashboard do Stripe | navegar para `https://dashboard.stripe.com/products` | não testado |  |
| `src/components/admin/billing/BillingDashboard.tsx:180` | Select / aba / radio | Transações | executar `setActiveTab` | não testado |  |
| `src/components/admin/billing/CouponManager.tsx:249` | Botão / handler de clique | Novo Cupom | executar `openBlankDialog` | não testado |  |
| `src/components/admin/billing/CouponManager.tsx:324` | Botão / handler de clique | ) : ( | executar `() => setCouponToArchive(coupon)` | não testado |  |
| `src/components/admin/billing/CouponManager.tsx:366` | Envio de formulário | Código do cupom | executar `handleSubmit` | não testado |  |
| `src/components/admin/billing/CouponManager.tsx:389` | Select / aba / radio | Percentual (%) | executar `(value: DiscountType) => updateForm('discountType', value)` | não testado |  |
| `src/components/admin/billing/CouponManager.tsx:425` | Select / aba / radio | Uma vez | executar `(value: DurationType) => updateForm('duration', value)` | não testado |  |
| `src/components/admin/billing/CouponManager.tsx:483` | Botão / handler de clique | Limpar | executar `() => updateForm('validUntil', undefined)` | não testado |  |
| `src/components/admin/billing/CouponManager.tsx:504` | Botão / handler de clique | Cancelar | executar `() => setDialogOpen(false)` | não testado |  |
| `src/components/admin/billing/CouponManager.tsx:549` | Botão / handler de clique | Arquivando... | executar `(event) => { event.preventDefault(); if (couponToArchive) archiveMutation.mutate(couponToArchive); }` | não testado |  |
| `src/components/admin/BugReportSettings.tsx:145` | Botão / handler de clique | [icone Save] | executar `() => saveMutation.mutate(parsed)` | não testado |  |
| `src/components/users/InviteUserModal.tsx:183` | Select / aba / radio | ( | executar `(v) => setRole(v as UserRole)` | não testado |  |
| `src/components/users/InviteUserModal.tsx:229` | Select / aba / radio | ( | executar `setTenantId` | não testado |  |
| `src/components/users/InviteUserModal.tsx:270` | Botão / handler de clique | Cancelar | executar `() => onOpenChange(false)` | não testado |  |
| `src/components/users/InviteUserModal.tsx:273` | Botão / handler de clique | — | executar `handleSubmit` | não testado |  |
| `src/components/users/UsersTable.tsx:102` | Botão gatilho (Radix `asChild`) | Ações | executar `variant="ghost" size="icon"` | não testado |  |
| `src/components/users/UsersTable.tsx:108` | Botão / handler de clique | Ver detalhes | executar `() => setDetalhe(u)` | não testado |  |
| `src/components/users/UsersTable.tsx:111` | Botão / handler de clique | Redefinir senha | executar `() => resetPwd.mutate(u.id)` | não testado |  |
| `src/components/users/UsersTable.tsx:116` | Botão / handler de clique | Suspender | executar `() => suspend.mutate(u.id)` | não testado |  |
| `src/components/users/UsersTable.tsx:120` | Botão / handler de clique | Reativar | executar `() => reactivate.mutate(u.id)` | não testado |  |
| `src/pages/dashboard/admin/UsageLimitsPage.tsx:68` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/dashboard/admin/UsageLimitsPage.tsx:69` | Link declarado em objeto (migalha / menu) | Administração | navegar para `/dashboard/admin` | não testado |  |
| `src/pages/dashboard/admin/UsersPage.tsx:34` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/dashboard/admin/UsersPage.tsx:35` | Link declarado em objeto (migalha / menu) | Administração | navegar para `/dashboard/admin` | não testado |  |
| `src/pages/dashboard/admin/UsersPage.tsx:39` | Botão / handler de clique | Convidar usuário | executar `() => setInviteOpen(true)` | não testado |  |
| `src/pages/dashboard/admin/UsersPage.tsx:62` | Select / aba / radio | Todas as funções | executar `(v) => setFilters((f) => ({ ...f, role: v === 'all' ? undefined : (v as UserRole) }))` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:420` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:425` | Select / aba / radio | Visão Geral | executar `setActiveTab` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:465` | ⚠️ Botão sem handler | Novo Usuário | executar `variant="outline" size="icon"` | decisão sua | botão de lupa ao lado do campo "Buscar usuários..." não tem handler. A busca já filtra enquanto se digita, então o botão é redundante — remover é mexer em layout, e isso é decisão sua. |
| `src/pages/dashboard/AdminDashboard.tsx:469` | Botão / handler de clique | Novo Usuário | executar `() => { resetUserForm(); setIsCreateUserOpen(true); }` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:866` | Select / aba / radio | Gestor | executar `(value) => setUserForm(prev => ({ ...prev, role: value as User['role'] }))` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:919` | Select / aba / radio | ( | executar `(value) => setUserForm(prev => ({ ...prev, tenantId: value }))` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:945` | Interruptor / checkbox | Usuário ativo | executar `(checked) => setUserForm(prev => ({ ...prev, isActive: checked as boolean }))` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:951` | Botão / handler de clique | Cancelar | executar `() => setIsCreateUserOpen(false)` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:956` | Botão / handler de clique | Editar Usuário | executar `handleCreateUser` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:1016` | Select / aba / radio | Gestor | executar `(value) => setUserForm(prev => ({ ...prev, role: value as User['role'] }))` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:1034` | Interruptor / checkbox | Usuário ativo | executar `(checked) => setUserForm(prev => ({ ...prev, isActive: checked as boolean }))` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:1040` | Botão / handler de clique | Cancelar | executar `() => setIsEditUserOpen(false)` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:1045` | Botão / handler de clique | Excluir Usuário | executar `handleEditUser` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:1067` | Botão / handler de clique | Detalhes do Usuário | executar `handleDeleteUser` | não testado |  |
| `src/pages/dashboard/AdminDashboard.tsx:1128` | Botão / handler de clique | Fechar | executar `() => setIsViewUserOpen(false)` | não testado |  |
| `src/pages/dashboard/TeamPage.tsx:82` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/dashboard/TeamPage.tsx:108` | Botão / handler de clique | Nova Loja | executar `() => setNovaLojaOpen(true)` | não testado |  |
| `src/pages/dashboard/TeamPage.tsx:124` | Botão / handler de clique | Convidar | executar `() => setInviteOpen(true)` | não testado |  |
| `src/pages/dashboard/TeamPage.tsx:171` | Botão / handler de clique | Filtrar | executar `() => setActiveTenant(loja.id)` | não testado |  |

## Autenticação

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/auth/AccountStatusScreen.tsx:63` | Botão / handler de clique | Sair | executar `() => logout()` | não testado |  |
| `src/components/auth/LojaOnlyNotice.tsx:37` | Navegação programática | Ir para o Dashboard | navegar para `/dashboard` | não testado |  |
| `src/components/auth/LojaOnlyNotice.tsx:37` | Botão / handler de clique | Ir para o Dashboard | executar `() => navigate('/dashboard')` | não testado |  |
| `src/components/auth/LojaOnlyNotice.tsx:41` | Navegação programática | Administração | navegar para `/dashboard/admin` | não testado |  |
| `src/components/auth/LojaOnlyNotice.tsx:41` | Botão / handler de clique | Administração | executar `() => navigate('/dashboard/admin')` | não testado |  |
| `src/components/auth/PaywallScreen.tsx:186` | Botão / handler de clique | ) : ( | executar `handleAssinar` | não testado |  |
| `src/components/auth/PaywallScreen.tsx:196` | Botão / handler de clique | ) : ( | executar `handleReconferir` | não testado |  |
| `src/components/auth/PaywallScreen.tsx:233` | Botão / handler de clique | Sair | executar `() => logout()` | não testado |  |
| `src/components/auth/PaywallScreen.tsx:253` | Âncora (`<a href>`) | Falar com o suporte no WhatsApp | navegar para `SUPORTE_WHATSAPP_URL` | não testado |  |
| `src/components/auth/PaywallScreen.tsx:262` | Âncora (`<a href>`) | [icone Mail] | navegar para `mailto:${SUPORTE_EMAIL}` | não testado |  |
| `src/pages/Auth.tsx:42` | Link interno (`<Link to>`) | Voltar ao início | navegar para `/` | não testado |  |
| `src/pages/Auth.tsx:59` | Envio de formulário | Email | executar `handleLogin` | não testado |  |
| `src/pages/Auth.tsx:84` | Link interno (`<Link to>`) | Esqueci minha senha | navegar para `/definir-senha` | não testado |  |
| `src/pages/Auth.tsx:104` | Botão / handler de clique | : | executar `() => setShowPassword((prev) => !prev)` | não testado |  |
| `src/pages/Auth.tsx:123` | Link interno (`<Link to>`) | Termos de Uso | navegar para `/terms-of-service` | não testado |  |
| `src/pages/Auth.tsx:127` | Link interno (`<Link to>`) | Política de Privacidade | navegar para `/privacy-policy` | não testado |  |
| `src/pages/DefinirSenha.tsx:119` | Navegação programática | — | navegar para `/dashboard` | não testado |  |
| `src/pages/DefinirSenha.tsx:218` | Link interno (`<Link to>`) | Voltar ao login | navegar para `/auth` | não testado |  |
| `src/pages/DefinirSenha.tsx:257` | Envio de formulário | Seu e-mail | executar `verificarCodigo` | não testado |  |
| `src/pages/DefinirSenha.tsx:318` | Botão / handler de clique | ) : ( | executar `() => reenviarLink()` | não testado |  |
| `src/pages/DefinirSenha.tsx:327` | Envio de formulário | Nova senha | executar `salvar` | não testado |  |
| `src/pages/DefinirSenha.tsx:344` | Botão / handler de clique | : | executar `() => setMostrarSenha((v) => !v)` | não testado |  |
| `src/pages/Login.tsx:23` | Navegação programática | Voltar para home | navegar para `/dashboard` | não testado |  |
| `src/pages/Login.tsx:38` | Link interno (`<Link to>`) | Voltar para home | navegar para `/` | não testado |  |
| `src/pages/Login.tsx:57` | Envio de formulário | [icone Mail] | executar `handleSubmit` | não testado |  |
| `src/pages/Login.tsx:99` | Link interno (`<Link to>`) | Criar conta | navegar para `/register` | não testado |  |

## Automação

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/automation/AutomationAnalytics.tsx:183` | Select / aba / radio | Último dia | executar `setTimeRange` | não testado |  |
| `src/components/automation/AutomationAnalytics.tsx:196` | Select / aba / radio | Todos os fluxos | executar `(value) => { // Implementar filtro por fluxo específico }` | não testado |  |
| `src/components/automation/AutomationAnalytics.tsx:213` | Botão inerte de propósito (`ComingSoonButton`) | Exportar | executar `variant="outline" size="sm" motivo="Exportação em breve"` | corrigido | "Exportar" sem handler; virou ComingSoonButton |
| `src/components/automation/AutomationBuilder.tsx:266` | Select / aba / radio | ( | executar `handleTriggerChange` | não testado |  |
| `src/components/automation/AutomationBuilder.tsx:344` | Botão / handler de clique | — | executar `() => setSelectedStep(TRIGGER_SEL)` | não testado |  |
| `src/components/automation/AutomationBuilder.tsx:362` | Botão / handler de clique | Aprox | executar `() => setSelectedStep(step.id)` | não testado |  |
| `src/components/automation/AutomationBuilder.tsx:378` | Botão / handler de clique | Resetar zoom | executar `() => setZoom((z) => Math.min(1.3, +(z + 0.1).toFixed(2)))` | não testado |  |
| `src/components/automation/AutomationBuilder.tsx:381` | Botão / handler de clique | Afastar | executar `() => setZoom(1)` | não testado |  |
| `src/components/automation/AutomationBuilder.tsx:384` | Botão / handler de clique | Histórico de execuções | executar `() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))` | não testado |  |
| `src/components/automation/BuilderHeader.tsx:72` | Interruptor / checkbox | 0 && ( | executar `onActiveChange` | não testado |  |
| `src/components/automation/BuilderHeader.tsx:89` | Botão / handler de clique | Histórico | executar `onHistory` | não testado |  |
| `src/components/automation/BuilderHeader.tsx:95` | ⚠️ Botão sem handler | Testar | executar `variant="outline" size="sm" disabled className="opacity-60"` | inerte de propósito | "Testar" já vinha disabled com tooltip "Em breve" — decisão de produto, não defeito |
| `src/components/automation/BuilderHeader.tsx:102` | Botão / handler de clique | Fechar | executar `onSave` | não testado |  |
| `src/components/automation/BuilderHeader.tsx:105` | Botão / handler de clique | Fechar | executar `onClose` | não testado |  |
| `src/components/automation/EmptyBuilder.tsx:32` | Botão / handler de clique | — | executar `() => onPick(t.key)` | não testado |  |
| `src/components/automation/StepCard.tsx:44` | Botão / handler de clique | — | executar `onClick` | não testado |  |
| `src/components/automation/StepCard.tsx:106` | Botão / handler de clique | [icone Trash2] | executar `(e) => { e.stopPropagation(); onDelete(); }` | não testado |  |
| `src/components/automation/StepConfigPanel.tsx:87` | Interruptor / checkbox | );       case 'array':         return ( | executar `set` | não testado |  |
| `src/components/automation/StepConfigPanel.tsx:106` | Select / aba / radio | ( | executar `set` | não testado |  |
| `src/components/automation/StepConfigPanel.tsx:126` | Select / aba / radio | ( | executar `set` | não testado |  |
| `src/pages/Automation.tsx:174` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Automation.tsx:175` | Botão / handler de clique | Novo Fluxo | executar `() => setShowBuilder(true)` | não testado |  |
| `src/pages/Automation.tsx:209` | Botão / handler de clique | Todos os gatilhos | executar `() => setFilterStatus(status)` | não testado |  |
| `src/pages/Automation.tsx:215` | Select / aba / radio | Todos os gatilhos | executar `setFilterTrigger` | não testado |  |
| `src/pages/Automation.tsx:225` | Select / aba / radio | Mais recentes | executar `(v) => setSortKey(v as SortKey)` | não testado |  |
| `src/pages/Automation.tsx:235` | Botão / handler de clique | ( | executar `() => setView('cards')` | não testado |  |
| `src/pages/Automation.tsx:236` | Botão / handler de clique | ( | executar `() => setView('table')` | não testado |  |
| `src/pages/Automation.tsx:306` | Botão / handler de clique | Duplicar | executar `() => openEdit(flow.id)` | não testado |  |
| `src/pages/Automation.tsx:307` | Botão / handler de clique | Pausar | executar `() => handleDuplicateFlow(flow)` | não testado |  |
| `src/pages/Automation.tsx:308` | Botão / handler de clique | Pausar | executar `() => setDeleteTarget(flow)` | não testado |  |
| `src/pages/Automation.tsx:310` | Botão / handler de clique | Pausar | executar `() => handleToggleFlow(flow.id, flow.active)` | não testado |  |
| `src/pages/Automation.tsx:341` | Botão / handler de clique | [icone Icon] | executar `() => openEdit(flow.id)` | não testado |  |
| `src/pages/Automation.tsx:364` | Botão / handler de clique | Editar | executar `(e) => e.stopPropagation()` | não testado |  |
| `src/pages/Automation.tsx:366` | Botão / handler de clique | Duplicar | executar `() => openEdit(flow.id)` | não testado |  |
| `src/pages/Automation.tsx:367` | Botão / handler de clique | : | executar `() => handleDuplicateFlow(flow)` | não testado |  |
| `src/pages/Automation.tsx:368` | Botão / handler de clique | : | executar `() => setDeleteTarget(flow)` | não testado |  |
| `src/pages/Automation.tsx:369` | Botão / handler de clique | : | executar `() => handleToggleFlow(flow.id, flow.active)` | não testado |  |

## Campanhas

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/campaigns/CampaignDetailsModal.tsx:255` | Âncora (`<a href>`) | Abrir mídia | navegar para `campaign.media_url` | não testado |  |
| `src/components/campaigns/CampaignReportsModal.tsx:148` | Select / aba / radio | Últimos 7 dias | executar `setPeriod` | não testado |  |
| `src/components/campaigns/CampaignReportsModal.tsx:158` | Select / aba / radio | Todas as Campanhas | executar `setStatusFilter` | não testado |  |
| `src/components/campaigns/CampaignReportsModal.tsx:170` | Botão / handler de clique | Exportar CSV | executar `handleExport` | não testado |  |
| `src/components/campaigns/CampaignReportsModal.tsx:222` | Select / aba / radio | Ordenar: Enviadas | executar `(v) => setSortBy(v as typeof sortBy)` | não testado |  |
| `src/components/campaigns/CampaignReportsModal.tsx:311` | Botão / handler de clique | Fechar | executar `onClose` | não testado |  |
| `src/components/campaigns/CampaignsList.tsx:318` | Botão / handler de clique | [icone Send] | executar `() => onDispatchNow(campaign.id)` | não testado |  |
| `src/components/campaigns/CampaignsList.tsx:328` | Botão gatilho (Radix `asChild`) | Editar | executar `variant="ghost" size="sm"` | não testado |  |
| `src/components/campaigns/CampaignsList.tsx:334` | Botão / handler de clique | Editar | executar `() => onEdit(campaign)` | não testado |  |
| `src/components/campaigns/CampaignsList.tsx:339` | Botão / handler de clique | Ver detalhes | executar `() => onViewDetails(campaign.id)` | não testado |  |
| `src/components/campaigns/CampaignsList.tsx:343` | Botão / handler de clique | Ver Relatório | executar `() => onViewReport(campaign.id)` | não testado |  |
| `src/components/campaigns/CampaignsList.tsx:347` | Botão / handler de clique | Duplicar | executar `() => onDuplicate(campaign)` | não testado |  |
| `src/components/campaigns/CampaignsList.tsx:352` | Botão / handler de clique | Pausar | executar `() => onPause(campaign.id)` | não testado |  |
| `src/components/campaigns/CampaignsList.tsx:358` | Botão / handler de clique | Retomar | executar `() => onResume(campaign.id)` | não testado |  |
| `src/components/campaigns/CampaignsList.tsx:365` | Botão / handler de clique | Cancelar | executar `() => onCancel(campaign.id)` | não testado |  |
| `src/components/campaigns/CampaignsList.tsx:374` | Botão / handler de clique | Excluir | executar `() => onDelete(campaign.id, campaign.name)` | não testado |  |
| `src/components/campaigns/CampaignsList.tsx:423` | Botão / handler de clique | Continuar editando | executar `() => onEdit(campaign)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:617` | Select / aba / radio | ( | executar `(v) => set('whatsapp_instance_id', v)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:653` | Interruptor / checkbox | Exigir opt-in (só enviar para contatos que consentiram) | executar `(c) => set('require_opt_in', !!c)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:667` | Botão / handler de clique | Template aprovado | executar `() => set('is_template', true)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:679` | Botão / handler de clique | Texto livre | executar `() => set('is_template', false)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:725` | Select / aba / radio | Português (Brasil) | executar `(v) => set('template_language', v)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:744` | Botão / handler de clique | + Adicionar parâmetro | executar `() => set('template_params', [...state.template_params, ''])` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:772` | Botão / handler de clique | Tipo de Mensagem * | executar `() => set('template_params', state.template_params.filter((_, i) => i !== idx))` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:796` | Botão / handler de clique | Mensagem * | executar `() => set('message_type', type)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:886` | Botão / handler de clique | — | executar `() => set('media_caption', state.media_caption + chip.value)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:950` | Botão / handler de clique | Importar CSV | executar `() => set('audience_type', type)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1104` | Select / aba / radio | Todos os estágios | executar `(v) => set('contactStageFilter', v)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1126` | Botão / handler de clique | Selecionar todos | executar `() => set('selectedContactIds', filteredContacts.map((c) => c.id))` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1135` | Botão / handler de clique | Limpar | executar `() => set('selectedContactIds', [])` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1208` | Botão / handler de clique | Data * | executar `() => set('sendMode', mode)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1228` | Botão gatilho (Radix `asChild`) | d | executar `variant="outline" className="w-full justify-start gap-2"` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1276` | Select / aba / radio | Respeitar horário comercial | executar `([v]) => set('delay_between_messages', v ?? state.delay_between_messages)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1287` | Interruptor / checkbox | Respeitar horário comercial | executar `(c) => set('respect_business_hours', !!c)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1404` | Botão / handler de clique | ( | executar `onClose` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1437` | Botão / handler de clique | Anterior | executar `() => setStep((s) => s - 1)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1448` | Botão / handler de clique | ) : ( | executar `handleSaveDraft` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1454` | Botão / handler de clique | ) : ( | executar `handleConfirm` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1468` | Botão / handler de clique | Próximo | executar `() => setStep((s) => s + 1)` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1530` | Botão / handler de clique | Arraste ou clique para selecionar | executar `() => inputRef.current?.click()` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1557` | Botão / handler de clique | Enviando... | executar `onClear` | não testado |  |
| `src/components/campaigns/CampaignWizardNew.tsx:1588` | Botão / handler de clique | Clique para substituir | executar `() => inputRef.current?.click()` | não testado |  |
| `src/pages/Campaigns.tsx:41` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Campaigns.tsx:49` | Botão / handler de clique | Relatórios | executar `() => setShowReports(true)` | não testado |  |
| `src/pages/Campaigns.tsx:54` | Botão / handler de clique | Nova Campanha | executar `() => setShowWizard(true)` | não testado |  |

## Chatbots

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/chatbots/ChatbotAnalytics.tsx:91` | Select / aba / radio | Todos os Chatbots | executar `setSelectedBot` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotAnalytics.tsx:103` | Select / aba / radio | Últimos 7 dias | executar `setSelectedPeriod` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotBuilder.tsx:125` | Botão / handler de clique | Testar | executar `testBot` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotBuilder.tsx:129` | Botão / handler de clique | Salvar | executar `() => setPreview(!preview)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotBuilder.tsx:133` | Botão / handler de clique | Salvar | executar `handleSave` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotBuilder.tsx:180` | Select / aba / radio | Simples (palavra-chave → resposta) | executar `(value: 'simple' \| 'flow') => setBotData(prev => ({ ...prev, type: value }))` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotBuilder.tsx:200` | Interruptor / checkbox | Gatilhos (Palavras-chave) | executar `(checked) => setBotData(prev => ({ ...prev, isActive: checked }))` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotBuilder.tsx:226` | Botão / handler de clique | ( | executar `addTrigger` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotBuilder.tsx:246` | Botão / handler de clique | Adicionar Gatilho | executar `() => removeTrigger(trigger.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotBuilder.tsx:255` | Botão / handler de clique | Adicionar Gatilho | executar `() => setTriggers(prev => [...prev, { id: Date.now().toString(), phrase: '' }])` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotBuilder.tsx:283` | Botão / handler de clique | 0 && ( | executar `() => removeResponse(response.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotBuilder.tsx:314` | Botão / handler de clique | Adicionar Resposta | executar `addResponse` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotReportsModal.tsx:60` | ⚠️ Botão sem handler | Exportar | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotReportsModal.tsx:147` | Botão / handler de clique | Fechar | executar `onClose` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotSettingsModal.tsx:83` | Select / aba / radio | São Paulo (GMT-3) | executar `(value) => setSettings({...settings, timezone: value})` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotSettingsModal.tsx:108` | Interruptor / checkbox | Ativar mensagem de fallback | executar `(checked) => setSettings({...settings, enableFallback: checked})` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotSettingsModal.tsx:141` | Interruptor / checkbox | Confirmação de Leitura | executar `(checked) => setSettings({...settings, enableTypingIndicator: checked})` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotSettingsModal.tsx:153` | Interruptor / checkbox | Transferência Automática | executar `(checked) => setSettings({...settings, enableReadReceipts: checked})` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotSettingsModal.tsx:165` | Interruptor / checkbox | Limite para Transferência | executar `(checked) => setSettings({...settings, autoTransferEnabled: checked})` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotSettingsModal.tsx:187` | Botão / handler de clique | Cancelar | executar `onClose` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotSettingsModal.tsx:190` | Botão / handler de clique | Salvar Configurações | executar `handleSave` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotsList.tsx:186` | Botão gatilho (Radix `asChild`) | Editar | executar `variant="ghost" size="sm" className="h-8 w-8 p-0"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotsList.tsx:191` | Botão / handler de clique | Editar | executar `() => onEdit(bot.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotsList.tsx:195` | Botão / handler de clique | Testar | executar `() => onTest(bot.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotsList.tsx:203` | Botão / handler de clique | Duplicar | executar `() => duplicateChatbot(bot.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotsList.tsx:207` | Botão / handler de clique | Exportar | executar `() => handleExport(bot.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotsList.tsx:213` | Botão / handler de clique | Excluir | executar `() => handleDeleteClick(bot.id, bot.name)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotsList.tsx:260` | Interruptor / checkbox | [icone TestTube] | executar `() => toggleChatbot(bot.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotsList.tsx:271` | Botão / handler de clique | : | executar `() => onTest(bot.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotsList.tsx:278` | Botão / handler de clique | : | executar `() => onEdit(bot.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotsList.tsx:285` | Botão / handler de clique | : | executar `() => toggleChatbot(bot.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotTester.tsx:105` | Botão / handler de clique | Limpar | executar `clearChat` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotTester.tsx:109` | Botão / handler de clique | Fechar | executar `onClose` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/ChatbotTester.tsx:195` | Botão / handler de clique | [icone Send] | executar `handleSendMessage` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/flow/edges/DeletableEdge.tsx:59` | Botão / handler de clique | × | executar `(e) => { e.stopPropagation(); deleteEdge(id); }` | não testado |  |
| `src/components/chatbots/flow/nodes/BaseNode.tsx:61` | Botão / handler de clique | Remover nó | executar `() => onDelete(id)` | não testado |  |
| `src/components/chatbots/flow/panels/AskQuestionPanel.tsx:77` | Select / aba / radio | Nenhuma | executar `(v) => handleChange({ validation: v as any })` | não testado |  |
| `src/components/chatbots/flow/panels/ConditionPanel.tsx:55` | Select / aba / radio | ( | executar `(v) => emit({ variable: v })` | não testado |  |
| `src/components/chatbots/flow/panels/ConditionPanel.tsx:70` | Select / aba / radio | ( | executar `(v) => emit({ operator: v as any })` | não testado |  |
| `src/components/chatbots/flow/panels/EndFlowPanel.tsx:53` | Interruptor / checkbox | Encerrar silenciosamente (sem enviar mensagem) | executar `(v) => emit({ silent: !!v })` | não testado |  |
| `src/components/chatbots/flow/panels/MoveFunnelPanel.tsx:46` | Select / aba / radio | ( | executar `(v) => emit({ stage_id: v })` | não testado |  |
| `src/components/chatbots/flow/panels/NodeConfigPanel.tsx:124` | Botão / handler de clique | Descartar | executar `handleDiscard` | não testado |  |
| `src/components/chatbots/flow/panels/NodeConfigPanel.tsx:130` | Botão / handler de clique | [icone Save] | executar `handleSaveCard` | não testado |  |
| `src/components/chatbots/flow/panels/SetVariablePanel.tsx:76` | Botão / handler de clique | ( | executar `() => insertToken(v.token)` | não testado |  |
| `src/components/chatbots/flow/panels/SetVariablePanel.tsx:86` | Botão / handler de clique | — | executar `() => insertToken(v.name)` | não testado |  |
| `src/components/chatbots/flow/panels/ShowOptionsPanel.tsx:64` | Botão / handler de clique | (null);   const [errors, setErrors] = useState | executar `() => onRemove(option.id)` | não testado |  |
| `src/components/chatbots/flow/panels/ShowOptionsPanel.tsx:155` | Botão / handler de clique | Adicionar | executar `addOption` | não testado |  |
| `src/components/chatbots/flow/panels/TransferAgentPanel.tsx:57` | Select / aba / radio | Qualquer atendente disponível | executar `(v) => emit({ assign_to: v as any, user_id: null })` | não testado |  |
| `src/components/chatbots/flow/panels/TransferAgentPanel.tsx:73` | Select / aba / radio | ( | executar `(v) => emit({ user_id: v \|\| null })` | não testado |  |
| `src/components/chatbots/flow/panels/UpdateContactPanel.tsx:46` | Select / aba / radio | ( | executar `(v) => emit({ field: v as any })` | não testado |  |
| `src/components/chatbots/flow/panels/VariableChips.tsx:51` | Botão / handler de clique | 0 && ( | executar `() => insert(v.token)` | não testado |  |
| `src/components/chatbots/flow/panels/VariableChips.tsx:69` | Botão / handler de clique | — | executar `() => insert(v.name)` | não testado |  |
| `src/components/chatbots/NewChatbotFlowModal.tsx:276` | Navegação programática | — | navegar para `/dashboard/chatbots/${chatbot.id}/builder` | não testado |  |
| `src/components/chatbots/NewChatbotFlowModal.tsx:320` | Select / aba / radio | Todas as instâncias | executar `setInstanceId` | não testado |  |
| `src/components/chatbots/NewChatbotFlowModal.tsx:361` | Interruptor / checkbox | — | executar `(v) => setTrigger(type, { enabled: !!v })` | não testado |  |
| `src/components/chatbots/NewChatbotFlowModal.tsx:378` | Botão / handler de clique | ( | executar `() => addKeyword(type)` | não testado |  |
| `src/components/chatbots/NewChatbotFlowModal.tsx:387` | Botão / handler de clique | [icone X] | executar `() => removeKeyword(type, kw)` | não testado |  |
| `src/components/chatbots/NewChatbotFlowModal.tsx:412` | Select / aba / radio | ( | executar `(v) => setTrigger(type, { stage_id: v })` | não testado |  |
| `src/components/chatbots/NewChatbotFlowModal.tsx:437` | Botão / handler de clique | Cancelar | executar `onClose` | não testado |  |
| `src/components/chatbots/NewChatbotFlowModal.tsx:440` | Botão / handler de clique | — | executar `handleSubmit` | não testado |  |
| `src/components/chatbots/NewChatbotModal.tsx:121` | Botão / handler de clique | [icone Icon] | executar `() => handleTemplateSelect(template.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/NewChatbotModal.tsx:220` | Botão / handler de clique | Voltar | executar `() => setStep(1)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/NewChatbotModal.tsx:226` | Botão / handler de clique | Cancelar | executar `onClose` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/NewChatbotModal.tsx:231` | Botão / handler de clique | Próximo | executar `() => setStep(2)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/chatbots/NewChatbotModal.tsx:238` | Botão / handler de clique | Criar Chatbot | executar `handleCreate` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/pages/ChatbotFlowBuilder.tsx:532` | Navegação programática | Voltar | navegar para `/dashboard/chatbots` | não testado |  |
| `src/pages/ChatbotFlowBuilder.tsx:532` | Botão / handler de clique | Voltar | executar `() => navigate('/dashboard/chatbots')` | não testado |  |
| `src/pages/ChatbotFlowBuilder.tsx:546` | Navegação programática | Não salvo | navegar para `/dashboard/chatbots` | não testado |  |
| `src/pages/ChatbotFlowBuilder.tsx:546` | Botão / handler de clique | Não salvo | executar `() => navigate('/dashboard/chatbots')` | não testado |  |
| `src/pages/ChatbotFlowBuilder.tsx:572` | Botão / handler de clique | Editar Bot | executar `() => setEditOpen(true)` | não testado |  |
| `src/pages/ChatbotFlowBuilder.tsx:577` | Botão / handler de clique | : | executar `undo` | não testado |  |
| `src/pages/ChatbotFlowBuilder.tsx:580` | Botão / handler de clique | : | executar `redo` | não testado |  |
| `src/pages/ChatbotFlowBuilder.tsx:584` | Botão / handler de clique | : | executar `handleSave` | não testado |  |
| `src/pages/ChatbotFlowBuilder.tsx:588` | Botão / handler de clique | Publicar | executar `handlePublish` | não testado |  |
| `src/pages/ChatbotFlowBuilder.tsx:716` | Botão / handler de clique | Entendi | executar `() => setPublishModal({ open: false })` | não testado |  |
| `src/pages/Chatbots.tsx:95` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Chatbots.tsx:97` | Botão / handler de clique | Novo Chatbot | executar `() => setShowNewModal(true)` | não testado |  |
| `src/pages/Chatbots.tsx:154` | Botão / handler de clique | Criar Primeiro Chatbot | executar `() => setShowNewModal(true)` | não testado |  |
| `src/pages/Chatbots.tsx:198` | Interruptor / checkbox | [icone Workflow] | executar `() => handleToggle(chatbot)` | não testado |  |
| `src/pages/Chatbots.tsx:210` | Navegação programática | Editar Fluxo | navegar para `/dashboard/chatbots/${chatbot.id}/builder` | não testado |  |
| `src/pages/Chatbots.tsx:210` | Botão / handler de clique | Editar Fluxo | executar `() => navigate(`/dashboard/chatbots/${chatbot.id` | não testado |  |
| `src/pages/Chatbots.tsx:221` | Botão / handler de clique | [icone Trash2] | executar `() => setDeleteTarget(chatbot)` | não testado |  |

## Compartilhado / infra

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/api/ApiSettings.tsx:716` | Botão / handler de clique | Testar | executar `() => onTest(endpoint)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:720` | Botão / handler de clique | Editar | executar `() => onEdit(endpoint)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:728` | Botão / handler de clique | [icone Trash2] | executar `() => onDelete(endpoint.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:791` | Botão / handler de clique | : | executar `() => setShowKey(!showKey)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:795` | Botão / handler de clique | Uso: | executar `copyToClipboard` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:848` | Botão / handler de clique | Desativar | executar `() => onToggleStatus(apiKey.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:862` | Botão / handler de clique | Editar | executar `() => onEdit(apiKey)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:870` | Botão / handler de clique | [icone Trash2] | executar `() => onDelete(apiKey.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:974` | Botão / handler de clique | Testar | executar `() => onTest(webhook)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:981` | Botão / handler de clique | Pausar | executar `() => onToggleStatus(webhook.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:995` | Botão / handler de clique | Editar | executar `() => onEdit(webhook)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:1003` | Botão / handler de clique | (mockEndpoints);   const [filter, setFilter] = useState | executar `() => onDelete(webhook.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:1065` | ⚠️ Botão sem handler | Atualizar | executar `variant="outline"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:1072` | Select / aba / radio | Todos os status | executar `setFilter` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:1085` | Select / aba / radio | Todas as categorias | executar `setCategoryFilter` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:1188` | ⚠️ Botão sem handler | Nova Chave | executar `` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:1195` | Select / aba / radio | Todos os status | executar `setFilter` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:1305` | ⚠️ Botão sem handler | Novo Webhook | executar `` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:1312` | Select / aba / radio | Todos os status | executar `setFilter` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:1526` | Botão / handler de clique | Documentação da API | executar `() => setSelectedEndpoint(endpoint)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:1740` | ⚠️ Botão sem handler | Exportar | executar `variant="outline"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/api/ApiSettings.tsx:1744` | ⚠️ Botão sem handler | Importar | executar `variant="outline"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/audit/AuditTrail.tsx:333` | Botão / handler de clique | Filtros de Auditoria | executar `() => onViewDetails(entry)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/audit/AuditTrail.tsx:371` | Select / aba / radio | Todas | executar `(value) => onFiltersChange({ ...filters, action: value === 'all' ? undefined : value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/audit/AuditTrail.tsx:390` | Select / aba / radio | Todos | executar `(value) => onFiltersChange({ ...filters, resource_type: value === 'all' ? undefined : value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/audit/AuditTrail.tsx:408` | Select / aba / radio | Todos | executar `(value) => onFiltersChange({ ...filters, risk_level: value === 'all' ? undefined : value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/audit/AuditTrail.tsx:446` | Select / aba / radio | Todos | executar `(value) => onFiltersChange({ ...filters, success: value === 'all' ? undefined : value === 'true' })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/audit/AuditTrail.tsx:471` | Botão / handler de clique | Fechar | executar `onClose` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/audit/AuditTrail.tsx:750` | Botão / handler de clique | Atualizar | executar `handleRefresh` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/audit/AuditTrail.tsx:754` | Botão / handler de clique | Exportar | executar `handleExportAudit` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/backup/BackupManager.tsx:226` | Botão / handler de clique | Download | executar `() => handleDownload(backup)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/backup/BackupManager.tsx:230` | Botão / handler de clique | Restaurar | executar `() => handleRestore(backup)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/backup/BackupManager.tsx:237` | ⚠️ Botão sem handler | Pausar | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/backup/BackupManager.tsx:305` | Select / aba / radio | Completo (todos os dados) | executar `(value: 'full' \| 'incremental') => setBackupType(value)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/backup/BackupManager.tsx:356` | ⚠️ Botão sem handler | Cancelar | executar `variant="outline"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/backup/BackupManager.tsx:359` | Botão / handler de clique | Criar Backup | executar `handleCreateBackup` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/backup/BackupManager.tsx:384` | Botão / handler de clique | Novo Agendamento | executar `() => setIsCreating(true)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/backup/BackupManager.tsx:425` | Interruptor / checkbox | [icone Settings] | executar `() => handleToggleSchedule(schedule)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/backup/BackupManager.tsx:427` | ⚠️ Botão sem handler | [icone Settings] | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/backup/BackupManager.tsx:485` | Select / aba / radio | ( | executar `setSelectedBackup` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/backup/BackupManager.tsx:524` | ⚠️ Botão sem handler | Cancelar | executar `variant="outline"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/backup/BackupManager.tsx:527` | Botão / handler de clique | Restaurar Dados | executar `handleRestore` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/debug/StorageDebug.tsx:55` | Botão / handler de clique | Atualizar | executar `checkStorage` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/debug/StorageDebug.tsx:58` | Botão / handler de clique | Limpar Storage | executar `clearStorage` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/debug/SupabaseDebug.tsx:56` | Botão / handler de clique | URL Supabase: | executar `checkSession` | não testado |  |
| `src/components/debug/SupabaseDebug.tsx:88` | Botão / handler de clique | Testar Query | executar `testQuery` | não testado |  |
| `src/components/monitoring/SystemMonitor.tsx:516` | Botão / handler de clique | [icone RefreshCw] | executar `() => setFilter('all')` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/monitoring/SystemMonitor.tsx:522` | Botão / handler de clique | Atualizar | executar `() => setFilter('active')` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/monitoring/SystemMonitor.tsx:528` | Botão / handler de clique | Atualizar | executar `() => setFilter('resolved')` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/monitoring/SystemMonitor.tsx:533` | ⚠️ Botão sem handler | Atualizar | executar `variant="outline"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/monitoring/SystemMonitor.tsx:581` | Botão / handler de clique | Atualizar | executar `handleRefresh` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/notifications/NotificationCenter.tsx:129` | Botão / handler de clique | 0 && ( | executar `() => setIsOpen(!isOpen)` | não testado |  |
| `src/components/notifications/NotificationCenter.tsx:147` | Botão / handler de clique | Notificações | executar `() => setIsOpen(false)` | não testado |  |
| `src/components/notifications/NotificationCenter.tsx:158` | Botão / handler de clique | Marcar todas como lidas | executar `handleMarkAllAsRead` | não testado |  |
| `src/components/notifications/NotificationCenter.tsx:165` | Botão / handler de clique | Nenhuma notificação | executar `() => setIsOpen(false)` | não testado |  |
| `src/components/notifications/NotificationCenter.tsx:189` | Botão / handler de clique | — | executar `() => handleNotificationClick(notification)` | não testado |  |
| `src/components/notifications/NotificationCenter.tsx:230` | Botão / handler de clique | Ver todas as notificações | executar `() => { setIsOpen(false); navigate('/dashboard/notifications'); }` | não testado |  |
| `src/components/notifications/NotificationCenter.tsx:232` | Navegação programática | Ver todas as notificações | navegar para `/dashboard/notifications` | não testado |  |
| `src/components/shared/ComingSoonButton.tsx:31` | ⚠️ Botão sem handler | — | executar `{...props} disabled` | inerte de propósito | é o próprio componente que desabilita de propósito; coberto por ComingSoonButton.test.tsx |
| `src/components/shared/ConfirmationDialog.tsx:94` | Botão / handler de clique | Processando... | executar `handleCancel` | não testado |  |
| `src/components/shared/ConfirmationDialog.tsx:100` | Botão / handler de clique | Processando... | executar `handleConfirm` | não testado |  |
| `src/components/shared/EmptyState.tsx:28` | Botão / handler de clique | — | executar `action.onClick` | não testado |  |
| `src/components/shared/FeatureHelp.tsx:79` | Link interno (`<Link to>`) | Ver toda a documentação | navegar para `/dashboard/help#${helpKey}` | não testado |  |
| `src/components/shared/PageHeader.tsx:50` | Link interno (`<Link to>`) | ) : ( | navegar para `crumb.href` | não testado |  |
| `src/components/shared/Pagination.tsx:98` | Select / aba / radio | ( | executar `(value) => onItemsPerPageChange(Number(value))` | não testado |  |
| `src/components/shared/Pagination.tsx:128` | Botão / handler de clique | Ir para primeira página | executar `handleFirstPage` | não testado |  |
| `src/components/shared/Pagination.tsx:137` | Botão / handler de clique | Ir para página anterior | executar `handlePreviousPage` | não testado |  |
| `src/components/shared/Pagination.tsx:160` | Botão / handler de clique | Ir para próxima página | executar `() => onPageChange(page as number)` | não testado |  |
| `src/components/shared/Pagination.tsx:171` | Botão / handler de clique | Ir para próxima página | executar `handleNextPage` | não testado |  |
| `src/components/shared/Pagination.tsx:180` | Botão / handler de clique | Ir para última página | executar `handleLastPage` | não testado |  |
| `src/components/shared/ThemeToggle.tsx:17` | Botão gatilho (Radix `asChild`) | Alternar tema | executar `variant="ghost" size="icon" className="h-8 w-8 relative" aria-label="Alternar tema"` | não testado |  |
| `src/components/shared/ThemeToggle.tsx:28` | Botão / handler de clique | [icone Sun] | executar `() => setTheme('light')` | não testado |  |
| `src/components/shared/ThemeToggle.tsx:33` | Botão / handler de clique | [icone Moon] | executar `() => setTheme('dark')` | não testado |  |
| `src/components/shared/ThemeToggle.tsx:38` | Botão / handler de clique | [icone Monitor] | executar `() => setTheme('system')` | não testado |  |
| `src/components/shared/TutorialBody.tsx:56` | Link interno (`<Link to>`) | Ir para a tela | navegar para `step.screen` | não testado |  |
| `src/components/shared/TutorialBody.tsx:65` | Link interno (`<Link to>`) | [icone BookOpen] | navegar para `/dashboard/help#${step.helpKey}` | não testado |  |
| `src/components/shared/VariableTextField.tsx:78` | Botão / handler de clique | ( | executar `() => insert(v.token)` | não testado |  |
| `src/components/shared/VariableTextField.tsx:89` | Botão / handler de clique | Variável da conta (coletada pelo chatbot) | executar `() => insert(name)` | não testado |  |

## Configurações

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/integrations/IntegrationManager.tsx:428` | Botão / handler de clique | Editar | executar `() => onEdit(integration)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:436` | Botão / handler de clique | Pausar | executar `() => onToggle(integration.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:454` | Botão / handler de clique | Excluir | executar `() => onDelete(integration.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:471` | Botão / handler de clique | Popular | executar `() => onSelect(template)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:491` | ⚠️ Botão sem handler | Docs | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:548` | Botão / handler de clique | ) : ( | executar `() => toggleSecretVisibility(field.name)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:572` | Select / aba / radio | ( | executar `(val) => handleFieldChange(field.name, val)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:590` | Interruptor / checkbox | — | executar `(checked) => handleFieldChange(field.name, checked)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:619` | Envio de formulário | ( | executar `handleSubmit` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:638` | Botão / handler de clique | Cancelar | executar `onCancel` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:643` | Âncora (`<a href>`) | Documentação | navegar para `template.documentation_url` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:709` | Botão / handler de clique | — | executar `() => setFilter('all')` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:715` | Botão / handler de clique | — | executar `() => setFilter('active')` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:721` | Botão / handler de clique | Atualizar | executar `() => setFilter('inactive')` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:727` | Botão / handler de clique | Atualizar | executar `() => setFilter('error')` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:732` | ⚠️ Botão sem handler | Atualizar | executar `variant="outline"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:796` | Select / aba / radio | Todas as categorias | executar `setCategoryFilter` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/integrations/IntegrationManager.tsx:886` | Botão / handler de clique | ← Voltar | executar `handleCancelForm` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:176` | Select / aba / radio | São Paulo (GMT-3) | executar `(value) => onChange({ ...settings, timezone: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:190` | Select / aba / radio | Português (Brasil) | executar `(value) => onChange({ ...settings, language: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:204` | Select / aba / radio | Real (R$) | executar `(value) => onChange({ ...settings, currency: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:249` | Select / aba / radio | Número máximo de conexões simultâneas permitidas | executar `([value]) => onChange({ ...settings, max_concurrent_connections: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:264` | Select / aba / radio | Tempo limite para requisições HTTP | executar `([value]) => onChange({ ...settings, request_timeout: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:279` | Select / aba / radio | Tempo de vida dos dados em cache | executar `([value]) => onChange({ ...settings, cache_duration: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:294` | Select / aba / radio | Tamanho máximo para upload de arquivos | executar `([value]) => onChange({ ...settings, max_file_size: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:317` | Interruptor / checkbox | Configurações de Segurança | executar `(checked) => onChange({ ...settings, compression_enabled: checked })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:342` | Select / aba / radio | Tempo até expirar sessão inativa | executar `([value]) => onChange({ ...settings, session_timeout: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:357` | Select / aba / radio | Máximo de tentativas antes de bloquear | executar `([value]) => onChange({ ...settings, max_login_attempts: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:372` | Select / aba / radio | Número mínimo de caracteres | executar `([value]) => onChange({ ...settings, password_min_length: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:387` | Select / aba / radio | Tempo de retenção dos logs de auditoria | executar `([value]) => onChange({ ...settings, audit_log_retention: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:411` | Interruptor / checkbox | Lista Branca de IPs | executar `(checked) => onChange({ ...settings, require_2fa: checked })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:424` | Interruptor / checkbox | Configurações de Notificações | executar `(checked) => onChange({ ...settings, ip_whitelist_enabled: checked })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:458` | Interruptor / checkbox | Notificações Push | executar `(checked) => onChange({ ...settings, email_notifications: checked })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:474` | Interruptor / checkbox | Notificações SMS | executar `(checked) => onChange({ ...settings, push_notifications: checked })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:490` | Interruptor / checkbox | Som de Notificação | executar `(checked) => onChange({ ...settings, sms_notifications: checked })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:506` | Interruptor / checkbox | Frequência de Notificações | executar `(checked) => onChange({ ...settings, notification_sound: checked })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:515` | Select / aba / radio | Imediata | executar `(value) => onChange({ ...settings, notification_frequency: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:550` | Select / aba / radio | Tempo limite para webhooks do WhatsApp | executar `([value]) => onChange({ ...settings, whatsapp_webhook_timeout: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:565` | Select / aba / radio | Número de tentativas em caso de falha | executar `([value]) => onChange({ ...settings, whatsapp_retry_attempts: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:580` | Select / aba / radio | Mensagens por minuto permitidas | executar `([value]) => onChange({ ...settings, whatsapp_rate_limit: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:603` | Interruptor / checkbox | Configurações de Interface | executar `(checked) => onChange({ ...settings, whatsapp_media_compression: checked })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:625` | Select / aba / radio | Claro | executar `(value) => onChange({ ...settings, theme: value })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:649` | Interruptor / checkbox | Mostrar Tooltips | executar `(checked) => onChange({ ...settings, sidebar_collapsed: checked })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:662` | Interruptor / checkbox | Animações Habilitadas | executar `(checked) => onChange({ ...settings, show_tooltips: checked })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:675` | Interruptor / checkbox | Modo Compacto | executar `(checked) => onChange({ ...settings, animation_enabled: checked })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:688` | Interruptor / checkbox | — | executar `(checked) => onChange({ ...settings, compact_mode: checked })` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:797` | Botão / handler de clique | Importar | executar `() => document.getElementById('import-settings')?.click()` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:801` | Botão / handler de clique | Exportar | executar `handleExportSettings` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:805` | Botão / handler de clique | Resetar | executar `handleReset` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AdvancedSettings.tsx:810` | Botão / handler de clique | ) : ( | executar `handleSave` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AppearanceSettings.tsx:69` | Interruptor / checkbox | Modo Compacto | executar `setDarkMode` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AppearanceSettings.tsx:85` | Interruptor / checkbox | [icone Save] | executar `setCompactMode` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AppearanceSettings.tsx:89` | Botão / handler de clique | [icone Save] | executar `handleSave` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/AttendanceSettings.tsx:197` | Interruptor / checkbox | A partir de quantas horas de espera cada nível aparece: | executar `setEnabled` | não testado |  |
| `src/components/settings/AttendanceSettings.tsx:261` | Botão / handler de clique | ) : ( | executar `handleSave` | não testado |  |
| `src/components/settings/FollowupSettings.tsx:151` | Interruptor / checkbox | Cancelar tarefas manuais quando o cliente responder | executar `setCancelScheduled` | não testado |  |
| `src/components/settings/FollowupSettings.tsx:174` | Interruptor / checkbox | [icone Info] | executar `setCancelManual` | não testado |  |
| `src/components/settings/FollowupSettings.tsx:195` | Botão / handler de clique | ) : ( | executar `handleSave` | não testado |  |
| `src/components/settings/IntegrationSettings.tsx:279` | Select / aba / radio | Integrações | executar `setActiveTab` | não testado |  |
| `src/components/settings/IntegrationSettings.tsx:333` | Botão / handler de clique | [icone ExternalLink] | executar `() => { window.open(`https://www.${integration.id}.com`, '_blank'); }` | não testado |  |
| `src/components/settings/IntegrationSettings.tsx:334` | Abre URL externa | Precisa de uma integração específica? | navegar para `https://www.${integration.id}.com` | não testado |  |
| `src/components/settings/IntegrationSettings.tsx:370` | Botão / handler de clique | Ver Documentação da API | executar `() => { window.open('https://docs.convoflow.com/api', '_blank'); }` | não testado |  |
| `src/components/settings/IntegrationSettings.tsx:371` | Abre URL externa | Ver Documentação da API | navegar para `https://docs.convoflow.com/api` | não testado |  |
| `src/components/settings/IntegrationSettings.tsx:462` | Interruptor / checkbox | Webhook ativo | executar `(checked) => setWebhookForm(prev => ({ ...prev, active: checked }))` | não testado |  |
| `src/components/settings/IntegrationSettings.tsx:469` | Botão / handler de clique | Cancelar | executar `handleSaveWebhook` | não testado |  |
| `src/components/settings/IntegrationSettings.tsx:519` | Botão / handler de clique | [icone Copy] | executar `() => copyToClipboard(webhook.url)` | não testado |  |
| `src/components/settings/IntegrationSettings.tsx:536` | Botão / handler de clique | Editar | executar `() => handleEditWebhook(webhook)` | não testado |  |
| `src/components/settings/IntegrationSettings.tsx:543` | Botão / handler de clique | Remover | executar `() => handleDeleteWebhook(webhook.id)` | não testado |  |
| `src/components/settings/IntegrationSettings.tsx:565` | Botão / handler de clique | Ver Documentação | executar `() => { window.open('https://docs.convoflow.com/webhooks', '_blank'); }` | não testado |  |
| `src/components/settings/IntegrationSettings.tsx:566` | Abre URL externa | Ver Documentação | navegar para `https://docs.convoflow.com/webhooks` | não testado |  |
| `src/components/settings/ModuleSettings.tsx:74` | Interruptor / checkbox | — | executar `() => onToggle(module.id, module.is_enabled)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/ModuleSettings.tsx:274` | Interruptor / checkbox | Apenas ativos | executar `setShowOnlyEnabled` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/ModuleSettings.tsx:290` | Botão / handler de clique | ) : ( | executar `enableAllModules` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/ModuleSettings.tsx:305` | Botão / handler de clique | ) : ( | executar `disableAllModules` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/ModuleSettings.tsx:320` | Botão / handler de clique | Recarregar | executar `() => window.location.reload()` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/settings/NotificationSettings.tsx:103` | Interruptor / checkbox | Follow-ups | executar `setPref('newMessages')` | não testado |  |
| `src/components/settings/NotificationSettings.tsx:119` | Interruptor / checkbox | Campanhas | executar `setPref('followups')` | não testado |  |
| `src/components/settings/NotificationSettings.tsx:135` | Interruptor / checkbox | [icone Save] | executar `setPref('campaigns')` | não testado |  |
| `src/components/settings/NotificationSettings.tsx:139` | Botão / handler de clique | [icone Save] | executar `handleSave` | não testado |  |
| `src/components/settings/ProfileSettings.tsx:159` | Botão / handler de clique | Alterar Foto | executar `handleAvatarClick` | não testado |  |
| `src/components/settings/ProfileSettings.tsx:226` | Botão / handler de clique | [icone Save] | executar `handleSave` | não testado |  |
| `src/components/settings/QuickRepliesSettings.tsx:146` | Botão / handler de clique | Nova resposta | executar `abrirNova` | não testado |  |
| `src/components/settings/QuickRepliesSettings.tsx:183` | Botão / handler de clique | Criar a primeira | executar `abrirNova` | não testado |  |
| `src/components/settings/QuickRepliesSettings.tsx:210` | Botão / handler de clique | `Editar ${reply.name | executar `() => abrirEdicao(reply)` | não testado |  |
| `src/components/settings/QuickRepliesSettings.tsx:218` | Botão / handler de clique | `Excluir ${reply.name | executar `() => setParaApagar(reply)` | não testado |  |
| `src/components/settings/QuickRepliesSettings.tsx:275` | Botão / handler de clique | Cancelar | executar `() => setFormOpen(false)` | não testado |  |
| `src/components/settings/QuickRepliesSettings.tsx:278` | Botão / handler de clique | [icone Loader2] | executar `handleSalvar` | não testado |  |
| `src/components/settings/SecuritySettings.tsx:94` | Botão / handler de clique | [icone Save] | executar `handleChangePassword` | não testado |  |
| `src/components/settings/SubscriptionSettings.tsx:220` | Botão / handler de clique | Gerenciar Assinatura | executar `handlePortal` | não testado |  |
| `src/components/settings/SubscriptionSettings.tsx:223` | Botão / handler de clique | Lojas do seu grupo | executar `handleSubscribe` | não testado |  |
| `src/components/settings/SubscriptionSettings.tsx:276` | Botão / handler de clique | [icone Loader2] | executar `handleBuySlots` | não testado |  |
| `src/components/settings/SystemSettings.tsx:100` | Select / aba / radio | ( | executar `setSelected` | não testado |  |
| `src/components/settings/SystemSettings.tsx:125` | Botão / handler de clique | [icone Save] | executar `() => saveMutation.mutate(selected)` | não testado |  |
| `src/pages/Settings.tsx:138` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Settings.tsx:143` | Select / aba / radio | [icone Icon] | executar `handleTabChange` | não testado |  |

## Contatos

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/contacts/ContactFilters.tsx:80` | Botão / handler de clique | Limpar | executar `clearFilters` | não testado |  |
| `src/components/contacts/ContactFilters.tsx:105` | Select / aba / radio | Todos os estágios | executar `(value) => updateFilters('stage', value === 'all' ? '' : value)` | não testado |  |
| `src/components/contacts/ContactFilters.tsx:126` | Select / aba / radio | Todas as fontes | executar `(value) => updateFilters('source', value === 'all' ? '' : value)` | não testado |  |
| `src/components/contacts/ContactFilters.tsx:161` | Botão / handler de clique | ( | executar `() => removeTag(tagId)` | não testado |  |
| `src/components/contacts/ContactFilters.tsx:174` | Botão / handler de clique | — | executar `() => addTag(tag.id)` | não testado |  |
| `src/components/contacts/ContactModal.tsx:428` | Envio de formulário | Nome * | executar `handleSubmit` | não testado |  |
| `src/components/contacts/ContactModal.tsx:502` | Select / aba / radio | ( | executar `(value) => setFormData({ ...formData, current_stage_id: value })` | não testado |  |
| `src/components/contacts/ContactModal.tsx:528` | Select / aba / radio | ( | executar `(value) => setFormData({ ...formData, lead_source_id: value })` | não testado |  |
| `src/components/contacts/ContactModal.tsx:553` | Select / aba / radio | ( | executar `(value) => setFormData({ ...formData, assigned_to: value })` | não testado |  |
| `src/components/contacts/ContactModal.tsx:593` | Botão / handler de clique | — | executar `() => removeTag(tagId)` | não testado |  |
| `src/components/contacts/ContactModal.tsx:604` | Select / aba / radio | ( | executar `addTag` | não testado |  |
| `src/components/contacts/ContactModal.tsx:646` | Botão / handler de clique | ) : ( | executar `createNewTag` | não testado |  |
| `src/components/contacts/ContactModal.tsx:672` | Botão / handler de clique | Cancelar | executar `handleClose` | não testado |  |
| `src/components/contacts/ContactsTable.tsx:397` | Botão / handler de clique | Opt-in | executar `() => handleToggleOptIn(contact.id, contact.opt_in_mass_message)` | não testado |  |
| `src/components/contacts/ContactsTable.tsx:409` | Botão / handler de clique | Opt-out | executar `() => handleToggleOptOut(contact.id, contact.opt_out_mass_message)` | não testado |  |
| `src/components/contacts/ContactsTable.tsx:422` | Botão / handler de clique | + Opt-in | executar `() => handleToggleOptIn(contact.id, false)` | não testado |  |
| `src/components/contacts/ContactsTable.tsx:432` | Botão / handler de clique | Opt-out | executar `() => handleToggleOptOut(contact.id, false)` | não testado |  |
| `src/components/contacts/ContactsTable.tsx:458` | Botão gatilho (Radix `asChild`) | Conversar | executar `variant="ghost" className="h-8 w-8 p-0"` | não testado |  |
| `src/components/contacts/ContactsTable.tsx:464` | Link interno (`<Link to>`) | Conversar | navegar para `/dashboard/conversations?contact=${contact.id}` | não testado |  |
| `src/components/contacts/ContactsTable.tsx:469` | Botão / handler de clique | Editar | executar `() => onEdit(contact.id)` | não testado |  |
| `src/components/contacts/ContactsTable.tsx:474` | Botão / handler de clique | Excluir | executar `() => handleDeleteClick(contact.id, contact.name?.trim() \|\| 'Contato sem nome')` | não testado |  |
| `src/pages/Contacts.tsx:143` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Contacts.tsx:155` | Botão / handler de clique | Importar | executar `handleImport` | não testado |  |
| `src/pages/Contacts.tsx:159` | Botão / handler de clique | Novo Contato | executar `handleExport` | não testado |  |
| `src/pages/Contacts.tsx:163` | Botão / handler de clique | Novo Contato | executar `() => setIsModalOpen(true)` | não testado |  |

## Conversas

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/conversations/AudioRecorder.tsx:149` | Botão / handler de clique | Cancelar gravação | executar `cancelRecording` | não testado |  |
| `src/components/conversations/AudioRecorder.tsx:154` | Botão / handler de clique | ) : ( | executar `stopAndSend` | não testado |  |
| `src/components/conversations/AudioRecorder.tsx:167` | Botão / handler de clique | ) : ( | executar `startRecording` | não testado |  |
| `src/components/conversations/ChatSearchBar.tsx:80` | Botão / handler de clique | Resultado anterior | executar `onPrev` | não testado |  |
| `src/components/conversations/ChatSearchBar.tsx:91` | Botão / handler de clique | Próximo resultado | executar `onNext` | não testado |  |
| `src/components/conversations/ChatSearchBar.tsx:102` | Botão / handler de clique | Fechar busca | executar `onClose` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:809` | Botão / handler de clique | Voltar | executar `onBack` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:858` | Botão / handler de clique | Buscar na conversa (Ctrl+Shift+F) | executar `() => onSearchOpenChange?.(!searchOpen)` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:873` | Botão / handler de clique | : | executar `() => onPanelOpenChange?.(!panelOpen)` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:886` | Botão gatilho (Radix `asChild`) | Editar Contato | executar `variant="ghost" size="icon" className="h-9 w-9" aria-label="Mais opções"` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:891` | Botão / handler de clique | Editar Contato | executar `handleEditContact` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:895` | Botão / handler de clique | Marcar como não lida | executar `handleMarkUnread` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:900` | Botão / handler de clique | [icone Archive] | executar `handleArchive` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:930` | Botão / handler de clique | Enviar template | executar `() => setTemplateDialogOpen(true)` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:938` | Botão / handler de clique | Etiquetar | executar `() => setIsTagDialogOpen(true)` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:943` | Botão / handler de clique | Encerrar sessão do bot | executar `() => setIsEndSessionOpen(true)` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:999` | Botão / handler de clique | Enviar template | executar `() => setTemplateDialogOpen(true)` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:1071` | Botão / handler de clique | ) : pendingFile.type.startsWith('audio/') ? ( | executar `() => setReplyTo(null)` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:1122` | Botão / handler de clique | Anexar arquivo | executar `() => handleEmojiSelect(emoji)` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:1133` | Envio de formulário | Anexar arquivo | executar `handleSend` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:1138` | Botão / handler de clique | Anexar arquivo | executar `handleAttachClick` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:1155` | Botão / handler de clique | Emoji | executar `() => setShowEmojiPicker(!showEmojiPicker)` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:1225` | Select / aba / radio | ( | executar `(value) => setEditForm({ ...editForm, lead_source_id: value })` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:1238` | Select / aba / radio | ( | executar `(value) => setEditForm({ ...editForm, current_stage_id: value })` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:1251` | Botão / handler de clique | Cancelar | executar `() => setIsEditModalOpen(false)` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:1252` | Botão / handler de clique | — | executar `handleSaveContact` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:1295` | Botão / handler de clique | Cancelar | executar `() => setIsEndSessionOpen(false)` | não testado |  |
| `src/components/conversations/ChatWindow.tsx:1301` | Botão / handler de clique | — | executar `handleEndChatbotSession` | não testado |  |
| `src/components/conversations/ContactPanel.tsx:202` | Botão / handler de clique | Fechar painel | executar `() => onOpenChange(false)` | não testado |  |
| `src/components/conversations/ContactPanel.tsx:218` | Link interno (`<Link to>`) | Ver perfil completo | navegar para `/dashboard/contacts` | não testado |  |
| `src/components/conversations/ContactPanel.tsx:241` | Select / aba / radio | ( | executar `handleStageChange` | não testado |  |
| `src/components/conversations/ContactPanel.tsx:269` | Botão / handler de clique | Adicionar | executar `() => setIsTagDialogOpen(true)` | não testado |  |
| `src/components/conversations/ConversationFiltersModal.tsx:59` | Interruptor / checkbox | Apenas conversas com mensagens não lidas | executar `(checked) => update({ hasUnread: !!checked })` | não testado |  |
| `src/components/conversations/ConversationFiltersModal.tsx:68` | Interruptor / checkbox | Mostrar arquivadas | executar `(checked) => update({ isArchived: !!checked })` | não testado |  |
| `src/components/conversations/ConversationFiltersModal.tsx:97` | Botão / handler de clique | Limpar | executar `() => onChange(DEFAULT_FILTER_STATE)` | não testado |  |
| `src/components/conversations/ConversationFiltersModal.tsx:101` | Botão / handler de clique | Aplicar | executar `onClose` | não testado |  |
| `src/components/conversations/ConversationsList.tsx:336` | Botão / handler de clique | [icone Avatar] | executar `() => onSelect(conversation.id)` | não testado |  |
| `src/components/conversations/ConversationsList.tsx:455` | Botão / handler de clique | 0 && ( | executar `() => syncAllChats(whatsappInstanceId ?? null)` | não testado |  |
| `src/components/conversations/ConversationsList.tsx:512` | Botão / handler de clique | ) : ( | executar `() => toggleGroup(group)` | não testado |  |
| `src/components/conversations/ConversationViewToggle.tsx:73` | ⚠️ Botão sem handler | — | executar `key={option.label} ref={(node) =` | passa | falso positivo do extrator: o onClick existe, só aparece depois do ref multilinha |
| `src/components/conversations/ConversationViewToggle.tsx:84` | Botão / handler de clique | — | executar `() => onChange(option.grouped)` | não testado |  |
| `src/components/conversations/InstanceSelector.tsx:44` | Select / aba / radio | [icone Avatar] | executar `onChange` | não testado |  |
| `src/components/conversations/MessageBubble.tsx:99` | Âncora (`<a href>`) | — | navegar para `seg` | não testado |  |
| `src/components/conversations/MessageBubble.tsx:131` | Botão / handler de clique | Seu navegador não suporta vídeo. | executar `onOpen` | não testado |  |
| `src/components/conversations/MessageBubble.tsx:167` | Âncora (`<a href>`) | Toque para abrir / baixar | navegar para `url` | não testado |  |
| `src/components/conversations/MessageBubble.tsx:193` | Âncora (`<a href>`) | [icone MapPin] | navegar para `href` | não testado |  |
| `src/components/conversations/MessageBubble.tsx:273` | Âncora (`<a href>`) | Ver anúncio | navegar para `url` | não testado |  |
| `src/components/conversations/MessageBubble.tsx:432` | Botão / handler de clique | — | executar `() => setExpanded((v) => !v)` | não testado |  |
| `src/components/conversations/MessageBubble.tsx:483` | Botão / handler de clique | Salvar como resposta rápida | executar `() => onSaveAsQuickReply?.(message.content ?? '')` | não testado |  |
| `src/components/conversations/MessageBubble.tsx:507` | Âncora (`<a href>`) | Baixar | navegar para `url` | não testado |  |
| `src/components/conversations/NewConversationModal.tsx:216` | ⚠️ Botão sem handler | Nova Conversa | executar `className="w-full" data-new-conversation` | passa | falso positivo: está dentro de <DialogTrigger asChild>, o handler vem do Radix |
| `src/components/conversations/NewConversationModal.tsx:232` | Select / aba / radio | ( | executar `setSelectedInstance` | não testado |  |
| `src/components/conversations/NewConversationModal.tsx:295` | Botão / handler de clique | Cancelar | executar `() => setOpen(false)` | não testado |  |
| `src/components/conversations/NewConversationModal.tsx:298` | Botão / handler de clique | Iniciar Conversa | executar `handleStartConversation` | não testado |  |
| `src/components/conversations/QuickFilterPills.tsx:60` | Botão / handler de clique | — | executar `() => onChange(isActive ? 'todas' : id)` | não testado |  |
| `src/components/conversations/QuickRepliesPopover.tsx:73` | Botão gatilho (Radix `asChild`) | Respostas rápidas | executar `type="button" variant="ghost" size="sm" disabled={disabled} aria-label="Respostas rápidas"` | não testado |  |
| `src/components/conversations/QuickRepliesPopover.tsx:105` | Link interno (`<Link to>`) | Criar em Configurações › Respostas rápidas | navegar para `/dashboard/settings?tab=quick-replies` | não testado |  |
| `src/components/conversations/QuickRepliesPopover.tsx:108` | Botão / handler de clique | Criar em Configurações › Respostas rápidas | executar `() => onOpenChange(false)` | não testado |  |
| `src/components/conversations/SaveQuickReplyDialog.tsx:122` | Botão / handler de clique | Cancelar | executar `() => onOpenChange(false)` | não testado |  |
| `src/components/conversations/SaveQuickReplyDialog.tsx:125` | Botão / handler de clique | [icone Loader2] | executar `handleSave` | não testado |  |
| `src/components/conversations/SendTemplateDialog.tsx:205` | Botão / handler de clique | Atualizar | executar `fetchTemplates` | não testado |  |
| `src/components/conversations/SendTemplateDialog.tsx:214` | Select / aba / radio | ( | executar `handleSelectTemplate` | não testado |  |
| `src/components/conversations/SendTemplateDialog.tsx:247` | Botão / handler de clique | Digitar o nome manualmente | executar `() => setManualMode(true)` | não testado |  |
| `src/components/conversations/SendTemplateDialog.tsx:273` | Botão / handler de clique | Escolher da lista | executar `() => setManualMode(false)` | não testado |  |
| `src/components/conversations/SendTemplateDialog.tsx:294` | Select / aba / radio | Português (Brasil) | executar `setLanguage` | não testado |  |
| `src/components/conversations/SendTemplateDialog.tsx:316` | Botão / handler de clique | + Adicionar parâmetro | executar `() => setParams((prev) => [...prev, ''])` | não testado |  |
| `src/components/conversations/SendTemplateDialog.tsx:350` | Botão / handler de clique | Cancelar | executar `() => setParams((prev) => prev.filter((_, i) => i !== idx))` | não testado |  |
| `src/components/conversations/SendTemplateDialog.tsx:363` | Botão / handler de clique | Cancelar | executar `() => handleOpenChange(false)` | não testado |  |
| `src/components/conversations/SendTemplateDialog.tsx:366` | Botão / handler de clique | — | executar `handleSubmit` | não testado |  |
| `src/components/conversations/SlaMuteButton.tsx:60` | Botão / handler de clique | ) : ( | executar `handleClick` | não testado |  |
| `src/components/conversations/SlaMuteButton.tsx:86` | Botão / handler de clique | Marcar | executar `() => toggleMute.mutate({ conversationId, muted: true })` | não testado |  |
| `src/pages/Conversations.tsx:249` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Conversations.tsx:260` | Botão / handler de clique | Buscar conversas | executar `openMobileSearch` | não testado |  |
| `src/pages/Conversations.tsx:291` | Botão / handler de clique | Filtros | executar `() => setShowFilters(true)` | não testado |  |
| `src/pages/Conversations.tsx:307` | Botão / handler de clique | Etiquetas | executar `() => setShowEtiquetas(true)` | não testado |  |

## Dashboard (início)

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/dashboard/AttentionPanel.tsx:48` | Botão / handler de clique | Ver todos | executar `() => navigate(verTodosHref)` | não testado |  |
| `src/components/dashboard/AttentionPanel.tsx:91` | Botão / handler de clique | Concluir | executar `() => completeFollowup(item.followupId!)` | não testado |  |
| `src/components/dashboard/AttentionPanel.tsx:101` | Botão / handler de clique | Abrir | executar `() => navigate(item.href)` | não testado |  |
| `src/components/dashboard/AutomationsSummary.tsx:32` | Navegação programática | Gerenciar | navegar para `/dashboard/automation` | não testado |  |
| `src/components/dashboard/AutomationsSummary.tsx:32` | Botão / handler de clique | Gerenciar | executar `() => navigate('/dashboard/automation')` | não testado |  |
| `src/components/dashboard/DashboardHeader.tsx:53` | Botão / handler de clique | [icone CalendarIcon] | executar `() => setPreset(p.value)` | não testado |  |
| `src/components/dashboard/DashboardHeader.tsx:61` | Botão gatilho (Radix `asChild`) | [icone CalendarIcon] | executar `size="sm" variant={preset === 'custom' ? 'default' : 'ghost'} className={cn('h-8 px-3 gap-1.5')}` | não testado |  |
| `src/components/dashboard/EnhancedMetricCard.tsx:59` | Botão / handler de clique | — | executar `clickable ? () => navigate(href!) : undefined` | não testado |  |
| `src/components/dashboard/FunnelMini.tsx:28` | Navegação programática | Ver funil | navegar para `/dashboard/funnel` | não testado |  |
| `src/components/dashboard/FunnelMini.tsx:28` | Botão / handler de clique | Ver funil | executar `() => navigate('/dashboard/funnel')` | não testado |  |
| `src/components/dashboard/FunnelMini.tsx:55` | Navegação programática | — | navegar para `/dashboard/funnel` | não testado |  |
| `src/components/dashboard/FunnelMini.tsx:55` | Botão / handler de clique | — | executar `() => navigate('/dashboard/funnel')` | não testado |  |
| `src/components/dashboard/MetricCard.tsx:50` | Botão / handler de clique | — | executar `handleClick` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/dashboard/OnboardingTutorialsCard.tsx:54` | Botão / handler de clique | Dispensar sugestão de tutoriais | executar `dismiss` | não testado |  |
| `src/components/dashboard/OnboardingTutorialsCard.tsx:79` | Link interno (`<Link to>`) | Ver todos | navegar para `/dashboard/help#${tutorialKey(first.id)}` | não testado |  |
| `src/components/dashboard/OnboardingTutorialsCard.tsx:83` | Link interno (`<Link to>`) | Ver todos | navegar para `/dashboard/help` | não testado |  |
| `src/components/dashboard/RecentConversations.tsx:30` | Navegação programática | Conversas Recentes | navegar para `/dashboard/conversations` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/dashboard/RecentConversations.tsx:34` | Navegação programática | Conversas Recentes | navegar para `/dashboard/conversations?selected=${conversationId}` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/dashboard/RecentConversations.tsx:41` | Botão / handler de clique | Ver todas | executar `handleViewAll` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/dashboard/RecentConversations.tsx:73` | Botão / handler de clique | [icone MessageCircle] | executar `() => handleConversationClick(conversation.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/dashboard/WhatsAppStatus.tsx:14` | Navegação programática | — | navegar para `/dashboard/whatsapp-numbers` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/dashboard/WhatsAppStatus.tsx:71` | Botão / handler de clique | Gerenciar | executar `handleManage` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/dashboard/WhatsAppStatusCompact.tsx:43` | Navegação programática | Gerenciar | navegar para `/dashboard/whatsapp-numbers` | não testado |  |
| `src/components/dashboard/WhatsAppStatusCompact.tsx:43` | Botão / handler de clique | Gerenciar | executar `() => navigate('/dashboard/whatsapp-numbers')` | não testado |  |
| `src/components/dashboard/WhatsAppStatusCompact.tsx:64` | Navegação programática | Conectar WhatsApp | navegar para `/dashboard/whatsapp-numbers` | não testado |  |
| `src/components/dashboard/WhatsAppStatusCompact.tsx:64` | Botão / handler de clique | Conectar WhatsApp | executar `() => navigate('/dashboard/whatsapp-numbers')` | não testado |  |
| `src/pages/Dashboard.tsx:189` | Link interno (`<Link to>`) | Nova Campanha | navegar para `/campaigns/new` | decisão sua | arquivo órfão (nenhum import aponta para ele; a rota /dashboard usa pages/Index). Tem 6 links quebrados, entre eles /campaigns/new, que não existe em rota nenhuma. Apagar ou religar é decisão sua — não inventei destino. |
| `src/pages/Dashboard.tsx:316` | Link interno (`<Link to>`) | Ver Conversas | navegar para `/conversations` | decisão sua | arquivo órfão (nenhum import aponta para ele; a rota /dashboard usa pages/Index). Tem 6 links quebrados, entre eles /campaigns/new, que não existe em rota nenhuma. Apagar ou religar é decisão sua — não inventei destino. |
| `src/pages/Dashboard.tsx:322` | Link interno (`<Link to>`) | Gerenciar Contatos | navegar para `/contacts` | decisão sua | arquivo órfão (nenhum import aponta para ele; a rota /dashboard usa pages/Index). Tem 6 links quebrados, entre eles /campaigns/new, que não existe em rota nenhuma. Apagar ou religar é decisão sua — não inventei destino. |
| `src/pages/Dashboard.tsx:328` | Link interno (`<Link to>`) | Campanhas | navegar para `/campaigns` | decisão sua | arquivo órfão (nenhum import aponta para ele; a rota /dashboard usa pages/Index). Tem 6 links quebrados, entre eles /campaigns/new, que não existe em rota nenhuma. Apagar ou religar é decisão sua — não inventei destino. |
| `src/pages/Dashboard.tsx:334` | Link interno (`<Link to>`) | Chatbots | navegar para `/chatbots` | decisão sua | arquivo órfão (nenhum import aponta para ele; a rota /dashboard usa pages/Index). Tem 6 links quebrados, entre eles /campaigns/new, que não existe em rota nenhuma. Apagar ou religar é decisão sua — não inventei destino. |
| `src/pages/Dashboard.tsx:340` | Link interno (`<Link to>`) | Relatórios | navegar para `/reports` | decisão sua | arquivo órfão (nenhum import aponta para ele; a rota /dashboard usa pages/Index). Tem 6 links quebrados, entre eles /campaigns/new, que não existe em rota nenhuma. Apagar ou religar é decisão sua — não inventei destino. |

## Follow-ups

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/followups/FollowupCalendarModal.tsx:137` | Botão / handler de clique | [icone ChevronLeft] | executar `goToPreviousMonth` | não testado |  |
| `src/components/followups/FollowupCalendarModal.tsx:143` | Botão / handler de clique | Mês | executar `goToNextMonth` | não testado |  |
| `src/components/followups/FollowupCalendarModal.tsx:148` | Select / aba / radio | Mês | executar `(value: 'month' \| 'week') => setViewType(value)` | não testado |  |
| `src/components/followups/FollowupCalendarModal.tsx:159` | Botão / handler de clique | Hoje | executar `goToToday` | não testado |  |
| `src/components/followups/FollowupCalendarModal.tsx:200` | Botão / handler de clique | ( | executar `() => setSelectedDate(day.dateString)` | não testado |  |
| `src/components/followups/FollowupCalendarModal.tsx:298` | Botão / handler de clique | Fechar | executar `onClose` | não testado |  |
| `src/components/followups/FollowupFilters.tsx:86` | Botão / handler de clique | Limpar | executar `clearFilters` | não testado |  |
| `src/components/followups/FollowupFilters.tsx:112` | Select / aba / radio | Todos os tipos | executar `(value) => updateFilters('type', value === 'all' ? '' : value)` | não testado |  |
| `src/components/followups/FollowupFilters.tsx:133` | Select / aba / radio | Todas as prioridades | executar `(value) => updateFilters('priority', value === 'all' ? '' : value)` | não testado |  |
| `src/components/followups/FollowupFilters.tsx:160` | Select / aba / radio | Todos os status | executar `(value) => updateFilters('status', value === 'all' ? '' : value)` | não testado |  |
| `src/components/followups/FollowupFilters.tsx:184` | Select / aba / radio | Todos os contatos | executar `(value) => updateFilters('contactId', value === 'all' ? '' : value)` | não testado |  |
| `src/components/followups/FollowupFilters.tsx:207` | Botão gatilho (Radix `asChild`) | [icone CalendarIcon] | executar `variant="outline" className={cn( "justify-start text-left font-normal", !filters.dateFrom && "text-muted-foreground" )}` | não testado |  |
| `src/components/followups/FollowupFilters.tsx:235` | Botão gatilho (Radix `asChild`) | [icone CalendarIcon] | executar `variant="outline" className={cn( "justify-start text-left font-normal", !filters.dateTo && "text-muted-foreground" )}` | não testado |  |
| `src/components/followups/FollowupModal.tsx:108` | Envio de formulário | Título * | executar `handleSubmit` | não testado |  |
| `src/components/followups/FollowupModal.tsx:179` | Botão / handler de clique | Cancelar | executar `handleClose` | não testado |  |
| `src/components/followups/FollowupScheduler.tsx:216` | Select / aba / radio | ( | executar `(v) => { setFormData((p) => ({ ...p, contactId: v })); setErrors((p) => ({ ...p, contactId: '' })); }` | não testado |  |
| `src/components/followups/FollowupScheduler.tsx:253` | Botão gatilho (Radix `asChild`) | [icone CalendarIcon] | executar `variant="outline" className={cn( 'w-full justify-start text-left font-normal', !formData.date && 'text-muted-foreground'` | não testado |  |
| `src/components/followups/FollowupScheduler.tsx:311` | Interruptor / checkbox | Frequência | executar `(checked) => setFormData((p) => ({ ...p, recurring: checked }))` | não testado |  |
| `src/components/followups/FollowupScheduler.tsx:322` | Select / aba / radio | Diário | executar `(v) => setFormData((p) => ({ ...p, recurringType: v }))` | não testado |  |
| `src/components/followups/FollowupScheduler.tsx:375` | Botão / handler de clique | [icone Icon] | executar `() => setMode(m.id)` | não testado |  |
| `src/components/followups/FollowupScheduler.tsx:504` | Botão / handler de clique | Mensagem a enviar | executar `() => setFormData((p) => ({ ...p, task: t }))` | não testado |  |
| `src/components/followups/FollowupScheduler.tsx:545` | Select / aba / radio | Alta | executar `(v) => setFormData((p) => ({ ...p, priority: v }))` | não testado |  |
| `src/components/followups/FollowupScheduler.tsx:574` | Botão / handler de clique | Cancelar | executar `onClose` | não testado |  |
| `src/components/followups/FollowupScheduler.tsx:577` | Botão / handler de clique | Salvando... | executar `handleSave` | não testado |  |
| `src/components/followups/FollowupsList.tsx:330` | Botão / handler de clique | ) : ( | executar `() => handleComplete(followup)` | não testado |  |
| `src/components/followups/FollowupsList.tsx:344` | Botão / handler de clique | ) : ( | executar `() => handleEdit(followup)` | não testado |  |
| `src/components/followups/FollowupsList.tsx:370` | Botão / handler de clique | Anterior | executar `() => setCurrentPage(prev => Math.max(prev - 1, 1))` | não testado |  |
| `src/components/followups/FollowupsList.tsx:382` | Botão / handler de clique | Próxima | executar `() => setCurrentPage(page)` | não testado |  |
| `src/components/followups/FollowupsList.tsx:392` | Botão / handler de clique | Próxima | executar `() => setCurrentPage(prev => Math.min(prev + 1, totalPages))` | não testado |  |
| `src/components/followups/SequencesManager.tsx:116` | Interruptor / checkbox | Ativa | executar `setStopOnReply` | não testado |  |
| `src/components/followups/SequencesManager.tsx:126` | Interruptor / checkbox | Passos da cadência | executar `setIsActive` | não testado |  |
| `src/components/followups/SequencesManager.tsx:141` | Botão / handler de clique | Ação | executar `() => removeStep(i)` | não testado |  |
| `src/components/followups/SequencesManager.tsx:152` | Select / aba / radio | WhatsApp (automático) | executar `(v) => updateStep(i, { action_type: v as SequenceActionType })` | não testado |  |
| `src/components/followups/SequencesManager.tsx:183` | Select / aba / radio | [icone SelectValue] | executar `(v) => updateStep(i, { delay_unit: v as SequenceDelayUnit })` | não testado |  |
| `src/components/followups/SequencesManager.tsx:220` | Select / aba / radio | Alta | executar `(v) => updateStep(i, { task_priority: v as 'high' \| 'medium' \| 'low' })` | não testado |  |
| `src/components/followups/SequencesManager.tsx:237` | Botão / handler de clique | Adicionar passo | executar `addStep` | não testado |  |
| `src/components/followups/SequencesManager.tsx:244` | Botão / handler de clique | Cancelar | executar `onClose` | não testado |  |
| `src/components/followups/SequencesManager.tsx:247` | Botão / handler de clique | [icone Loader2] | executar `handleSave` | não testado |  |
| `src/components/followups/SequencesManager.tsx:267` | Botão / handler de clique | Nova sequência | executar `() => setShowBuilder(true)` | não testado |  |
| `src/components/followups/SequencesManager.tsx:294` | Interruptor / checkbox | Para ao responder | executar `(c) => toggleActive(seq.id, c)` | não testado |  |
| `src/components/followups/SequencesManager.tsx:326` | Botão / handler de clique | Excluir | executar `() => { if (confirm(`Excluir a sequência "${seq.name}"?`)) deleteSequence(seq.id); }` | não testado |  |
| `src/pages/Followups.tsx:40` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Followups.tsx:48` | Botão / handler de clique | Filtros | executar `() => setShowFilters(!showFilters)` | não testado |  |
| `src/pages/Followups.tsx:56` | Botão / handler de clique | Calendário | executar `() => setShowCalendar(true)` | não testado |  |
| `src/pages/Followups.tsx:61` | Botão / handler de clique | Novo Follow-up | executar `() => setShowScheduler(true)` | não testado |  |

## Funil

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/funnel/DroppableStage.tsx:85` | Botão gatilho (Radix `asChild`) | Adicionar Lead | executar `variant="ghost" size="sm" className="h-8 w-8 p-0"` | não testado |  |
| `src/components/funnel/DroppableStage.tsx:90` | Botão / handler de clique | Adicionar Lead | executar `() => onAddLead?.(stage.id)` | não testado |  |
| `src/components/funnel/DroppableStage.tsx:94` | Botão / handler de clique | Editar Estágio | executar `() => onEditStage?.(stage.id)` | não testado |  |
| `src/components/funnel/DroppableStage.tsx:98` | Botão / handler de clique | Configurar Estágio | executar `() => onConfigureStage?.(stage.id)` | não testado |  |
| `src/components/funnel/DroppableStage.tsx:103` | Botão / handler de clique | Excluir Estágio | executar `() => onDeleteStage?.(stage.id)` | não testado |  |
| `src/components/funnel/EditStageModal.tsx:135` | Botão / handler de clique | Cancelar | executar `() => setStageColor(color.value)` | não testado |  |
| `src/components/funnel/EditStageModal.tsx:147` | Botão / handler de clique | Cancelar | executar `handleClose` | não testado |  |
| `src/components/funnel/EditStageModal.tsx:151` | Botão / handler de clique | — | executar `handleSave` | não testado |  |
| `src/components/funnel/NewLeadModal.tsx:130` | Botão / handler de clique | Informações Pessoais | executar `handleClose` | não testado |  |
| `src/components/funnel/NewLeadModal.tsx:240` | Select / aba / radio | ( | executar `(value) => handleInputChange('stage_id', value)` | não testado |  |
| `src/components/funnel/NewLeadModal.tsx:262` | Select / aba / radio | ( | executar `(value) => handleInputChange('source', value)` | não testado |  |
| `src/components/funnel/NewLeadModal.tsx:293` | Botão / handler de clique | Cancelar | executar `handleClose` | não testado |  |
| `src/components/funnel/NewLeadModal.tsx:296` | Botão / handler de clique | — | executar `handleSubmit` | não testado |  |
| `src/components/funnel/SortableLeadCard.tsx:65` | Navegação programática | — | navegar para `/dashboard/conversations?contact=${lead.id}` | não testado |  |
| `src/components/funnel/SortableLeadCard.tsx:115` | Botão / handler de clique | Editar | executar `(e) => e.stopPropagation()` | não testado |  |
| `src/components/funnel/SortableLeadCard.tsx:121` | Botão / handler de clique | Editar | executar `handleEdit` | não testado |  |
| `src/components/funnel/SortableLeadCard.tsx:125` | Botão / handler de clique | Conversar | executar `handleChat` | não testado |  |
| `src/components/funnel/SortableLeadCard.tsx:129` | Botão / handler de clique | Agendar Follow-up | executar `handleScheduleFollowup` | não testado |  |
| `src/components/funnel/StageConfigModal.tsx:71` | Botão / handler de clique | [icone Edit] | executar `() => onEdit(stage)` | não testado |  |
| `src/components/funnel/StageConfigModal.tsx:74` | Botão / handler de clique | [icone Trash2] | executar `() => onDelete(stage.id)` | não testado |  |
| `src/components/funnel/StageConfigModal.tsx:286` | Botão / handler de clique | [icone Plus] | executar `() => setNewStageColor(color.value)` | não testado |  |
| `src/components/funnel/StageConfigModal.tsx:295` | Botão / handler de clique | Editar Estágio | executar `addStage` | não testado |  |
| `src/components/funnel/StageConfigModal.tsx:330` | Botão / handler de clique | — | executar `() => setEditingStage({ ...editingStage, color: color.value })` | não testado |  |
| `src/components/funnel/StageConfigModal.tsx:339` | Botão / handler de clique | Cancelar | executar `() => updateStage(editingStage)` | não testado |  |
| `src/components/funnel/StageConfigModal.tsx:345` | Botão / handler de clique | Cancelar | executar `() => setEditingStage(null)` | não testado |  |
| `src/components/funnel/StageConfigModal.tsx:355` | Botão / handler de clique | Cancelar | executar `onClose` | não testado |  |
| `src/components/funnel/StageConfigModal.tsx:358` | Botão / handler de clique | Salvar Configurações | executar `onClose` | não testado |  |
| `src/pages/Funnel.tsx:24` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Funnel.tsx:32` | Botão / handler de clique | Configurar Estágios | executar `() => setShowMetrics(!showMetrics)` | não testado |  |
| `src/pages/Funnel.tsx:40` | Botão / handler de clique | Configurar Estágios | executar `() => setShowStageConfig(true)` | não testado |  |
| `src/pages/Funnel.tsx:45` | Botão / handler de clique | Novo Lead | executar `() => setShowNewLead(true)` | não testado |  |

## Landing (página de vendas)

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/landing/CTASection.tsx:41` | Link interno (`<Link to>`) | Começar Agora | navegar para `/register` | passa | /register é rota de compatibilidade e redireciona para /auth (App.tsx:93); verificado no e2e |
| `src/components/landing/CTASection.tsx:42` | ⚠️ Botão sem handler | Começar Agora | executar `size="xl" variant="secondary" className="bg-white text-brand-dark hover:bg-white/90 group w-full sm:w-auto"` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/CTASection.tsx:52` | Âncora (`<a href>`) | Falar com Especialista | navegar para `https://wa.me/5585991764169?text=Quero%20falar%20do%20ConvoFlow` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/CTASection.tsx:58` | ⚠️ Botão sem handler | Falar com Especialista | executar `size="xl" className="bg-business-dark text-white hover:bg-business-dark/90 w-full sm:w-auto"` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/HeroSection.tsx:46` | Link interno (`<Link to>`) | Começar Agora | navegar para `/auth` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/HeroSection.tsx:47` | ⚠️ Botão sem handler | Começar Agora | executar `size="xl" variant="whatsapp" className="group w-full sm:w-auto"` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/HeroSection.tsx:53` | ⚠️ Botão sem handler | Ver Demonstração | executar `size="xl" variant="outline" className="group w-full sm:w-auto"` | decisão sua | "Ver Demonstração": sem onClick e sem <Link> em volta — o clique não faz nada. Não existe rota nem vídeo de demonstração no projeto, então inventar um destino seria pior que relatar. |
| `src/components/landing/LandingFooter.tsx:36` | Âncora (`<a href>`) | Funcionalidades | navegar para `#features` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingFooter.tsx:37` | Âncora (`<a href>`) | Preços | navegar para `#pricing` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingFooter.tsx:45` | Link interno (`<Link to>`) | Entrar | navegar para `/login` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingFooter.tsx:46` | Link interno (`<Link to>`) | Painel | navegar para `/dashboard` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingFooter.tsx:56` | Link interno (`<Link to>`) | Termos de Uso | navegar para `/terms-of-service` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingFooter.tsx:59` | Link interno (`<Link to>`) | Política de Privacidade | navegar para `/privacy-policy` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:14` | Link declarado em objeto (migalha / menu) | Funcionalidades | navegar para `#features` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:15` | Link declarado em objeto (migalha / menu) | Preços | navegar para `#pricing` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:16` | Link declarado em objeto (migalha / menu) | Depoimentos | navegar para `#testimonials` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:17` | Link declarado em objeto (migalha / menu) | FAQ | navegar para `#faq` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:29` | Link interno (`<Link to>`) | ( | navegar para `/` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:39` | Âncora (`<a href>`) | Entrar | navegar para `item.href` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:52` | Link interno (`<Link to>`) | Entrar | navegar para `/auth` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:53` | ⚠️ Botão sem handler | Entrar | executar `variant="ghost"` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:55` | Link interno (`<Link to>`) | Começar Grátis | navegar para `/auth` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:56` | ⚠️ Botão sem handler | Começar Grátis | executar `variant="whatsapp"` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:66` | Botão / handler de clique | : | executar `() => setIsOpen(!isOpen)` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:83` | Âncora (`<a href>`) | Entrar | navegar para `item.href` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:87` | Botão / handler de clique | Entrar | executar `() => setIsOpen(false)` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:93` | Link interno (`<Link to>`) | Entrar | navegar para `/auth` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:93` | Botão / handler de clique | Entrar | executar `() => setIsOpen(false)` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:94` | ⚠️ Botão sem handler | Entrar | executar `variant="ghost" className="w-full justify-center"` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:98` | Link interno (`<Link to>`) | Começar Grátis | navegar para `/auth` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:98` | Botão / handler de clique | Começar Grátis | executar `() => setIsOpen(false)` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/LandingNavbar.tsx:99` | ⚠️ Botão sem handler | Começar Grátis | executar `variant="whatsapp" className="w-full justify-center"` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/PricingSection.tsx:27` | Navegação programática | Plano Gerente | navegar para `/auth` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |
| `src/components/landing/PricingSection.tsx:82` | Botão / handler de clique | Começar Agora | executar `handleSubscribe` | passa | coberto por e2e/landing.spec.ts (clique real no Chromium) |

## Layout / navegação

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/layout/CommandPalette.tsx:165` | Navegação programática | Nenhum resultado encontrado. | navegar para `/dashboard/contacts?contact=${contactId}` | não testado |  |
| `src/components/layout/CommandPalette.tsx:170` | Navegação programática | Nenhum resultado encontrado. | navegar para `/dashboard/whatsapp-numbers?instance=${instanceId}` | não testado |  |
| `src/components/layout/CommandPalette.tsx:178` | Select / aba / radio | Nenhum resultado encontrado. | executar `setSearch` | não testado |  |
| `src/components/layout/Navbar.tsx:63` | Botão / handler de clique | Abrir menu | executar `onMenuClick` | não testado |  |
| `src/components/layout/Navbar.tsx:72` | Botão / handler de clique | Buscar... | executar `() => setPaletteOpen(true)` | não testado |  |
| `src/components/layout/Navbar.tsx:86` | Botão / handler de clique | Abrir busca | executar `() => setPaletteOpen(true)` | não testado |  |
| `src/components/layout/Navbar.tsx:107` | Botão gatilho (Radix `asChild`) | Menu do usuário | executar `variant="ghost" className="flex items-center gap-2 h-8 px-2" aria-label="Menu do usuário"` | não testado |  |
| `src/components/layout/Navbar.tsx:141` | Link interno (`<Link to>`) | Meu Perfil | navegar para `/dashboard/profile` | não testado |  |
| `src/components/layout/Navbar.tsx:147` | Link interno (`<Link to>`) | Notificações | navegar para `/dashboard/notifications` | não testado |  |
| `src/components/layout/Navbar.tsx:153` | Link interno (`<Link to>`) | Configurações | navegar para `/dashboard/settings` | não testado |  |
| `src/components/layout/Navbar.tsx:161` | Botão / handler de clique | Sair | executar `() => logout()` | não testado |  |
| `src/components/layout/Sidebar.tsx:63` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/components/layout/Sidebar.tsx:64` | Link declarado em objeto (migalha / menu) | Conversas | navegar para `/dashboard/conversations` | não testado |  |
| `src/components/layout/Sidebar.tsx:65` | Link declarado em objeto (migalha / menu) | Contatos | navegar para `/dashboard/contacts` | não testado |  |
| `src/components/layout/Sidebar.tsx:66` | Link declarado em objeto (migalha / menu) | Funil de Vendas | navegar para `/dashboard/funnel` | não testado |  |
| `src/components/layout/Sidebar.tsx:70` | Link declarado em objeto (migalha / menu) | Rastreamento | navegar para `/dashboard/tracking` | não testado |  |
| `src/components/layout/Sidebar.tsx:71` | Link declarado em objeto (migalha / menu) | Relatórios | navegar para `/dashboard/reports` | não testado |  |
| `src/components/layout/Sidebar.tsx:72` | Link declarado em objeto (migalha / menu) | Chatbots | navegar para `/dashboard/chatbots` | não testado |  |
| `src/components/layout/Sidebar.tsx:73` | Link declarado em objeto (migalha / menu) | Campanhas | navegar para `/dashboard/campaigns` | não testado |  |
| `src/components/layout/Sidebar.tsx:76` | Link declarado em objeto (migalha / menu) | Templates | navegar para `/dashboard/templates` | não testado |  |
| `src/components/layout/Sidebar.tsx:77` | Link declarado em objeto (migalha / menu) | Follow-ups | navegar para `/dashboard/followups` | não testado |  |
| `src/components/layout/Sidebar.tsx:78` | Link declarado em objeto (migalha / menu) | Automação | navegar para `/dashboard/automation` | não testado |  |
| `src/components/layout/Sidebar.tsx:82` | Link declarado em objeto (migalha / menu) | Instâncias e APIs | navegar para `/dashboard/whatsapp-numbers` | não testado |  |
| `src/components/layout/Sidebar.tsx:83` | Link declarado em objeto (migalha / menu) | Configurações | navegar para `/dashboard/settings` | não testado |  |
| `src/components/layout/Sidebar.tsx:85` | Link declarado em objeto (migalha / menu) | Ajuda | navegar para `/dashboard/help` | não testado |  |
| `src/components/layout/Sidebar.tsx:89` | Link declarado em objeto (migalha / menu) | Equipe | navegar para `/dashboard/team` | não testado |  |
| `src/components/layout/Sidebar.tsx:90` | Link declarado em objeto (migalha / menu) | Comparar Lojas | navegar para `/dashboard/store-comparison` | não testado |  |
| `src/components/layout/Sidebar.tsx:94` | Link declarado em objeto (migalha / menu) | Administração | navegar para `/dashboard/admin` | não testado |  |
| `src/components/layout/Sidebar.tsx:119` | Link interno (`<Link to>`) | — | navegar para `item.href` | não testado |  |
| `src/components/layout/Sidebar.tsx:122` | Botão / handler de clique | — | executar `onNavigate` | não testado |  |
| `src/components/layout/Sidebar.tsx:311` | Link interno (`<Link to>`) | ) : ( | navegar para `/dashboard` | não testado |  |
| `src/components/layout/Sidebar.tsx:321` | Botão / handler de clique | ) : ( | executar `onToggle` | não testado |  |
| `src/components/layout/Sidebar.tsx:330` | Botão / handler de clique | Expandir menu lateral | executar `onToggle` | não testado |  |
| `src/components/layout/Sidebar.tsx:356` | Botão / handler de clique | Menu de navegação | executar `onMobileClose` | não testado |  |
| `src/components/layout/Sidebar.tsx:370` | Link interno (`<Link to>`) | ConvoFlow | navegar para `/dashboard` | não testado |  |
| `src/components/layout/Sidebar.tsx:372` | Botão / handler de clique | ConvoFlow | executar `onMobileClose` | não testado |  |
| `src/components/layout/Sidebar.tsx:381` | Botão / handler de clique | Fechar menu lateral | executar `onMobileClose` | não testado |  |
| `src/components/layout/TenantSwitcher.tsx:65` | Botão gatilho (Radix `asChild`) | Selecionar Conta ativa | executar `variant="outline" size="sm" role="combobox" aria-expanded={open} aria-label="Selecionar Conta ativa" className={cn( 'h-8` | não testado |  |

## Outras telas

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/pages/Help.tsx:153` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Help.tsx:193` | Select / aba / radio | ( | executar `setOpenItems` | não testado |  |
| `src/pages/NotFound.tsx:27` | Botão / handler de clique | Voltar | executar `() => navigate(-1)` | passa | "Voltar" e "Ir para Home" verificados por clique real no e2e |
| `src/pages/NotFound.tsx:31` | Navegação programática | Ir para Home | navegar para `/` | passa | "Voltar" e "Ir para Home" verificados por clique real no e2e |
| `src/pages/NotFound.tsx:31` | Botão / handler de clique | Ir para Home | executar `() => navigate('/')` | passa | "Voltar" e "Ir para Home" verificados por clique real no e2e |
| `src/pages/Notifications.tsx:137` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Notifications.tsx:141` | Botão / handler de clique | Marcar todas como lidas | executar `markAllAsRead` | não testado |  |
| `src/pages/Notifications.tsx:207` | Botão / handler de clique | Marcar como lida | executar `() => markAsRead(notification.id)` | não testado |  |
| `src/pages/Notifications.tsx:217` | Botão / handler de clique | Excluir notificação | executar `() => deleteNotification(notification.id)` | não testado |  |
| `src/pages/Notifications.tsx:262` | Interruptor / checkbox | — | executar `(checked) => setPreferences((prev) => ({ ...prev, [item.key]: checked }))` | não testado |  |
| `src/pages/Profile.tsx:11` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/pages/Templates.tsx:248` | Link interno (`<Link to>`) | Instâncias e APIs | navegar para `/dashboard/whatsapp-numbers` | não testado |  |
| `src/pages/Templates.tsx:272` | Botão / handler de clique | Tentar de novo | executar `() => templatesQuery.refetch()` | não testado |  |
| `src/pages/Templates.tsx:324` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Templates.tsx:330` | Botão / handler de clique | Atualizar | executar `() => templatesQuery.refetch()` | não testado |  |
| `src/pages/Templates.tsx:350` | Select / aba / radio | ( | executar `(value) => setWabaSelecionado(value)` | não testado |  |

## Outros

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/bug-report/BugReportButton.tsx:271` | Botão / handler de clique | Reportar bug | executar `() => setOpen(true)` | não testado |  |
| `src/components/bug-report/BugReportButton.tsx:312` | Botão / handler de clique | Fechar | executar `() => handleOpenChange(false)` | não testado |  |
| `src/components/bug-report/BugReportButton.tsx:381` | Botão / handler de clique | ) : ( | executar `clearFile` | não testado |  |
| `src/components/bug-report/BugReportButton.tsx:399` | Botão / handler de clique | — | executar `() => fileInputRef.current?.click()` | não testado |  |
| `src/components/bug-report/BugReportButton.tsx:464` | Botão / handler de clique | Enviando... | executar `handleSubmit` | não testado |  |
| `src/components/ErrorBoundaries/ComponentErrorBoundary.tsx:31` | Botão / handler de clique | ( | executar `onRetry` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/ErrorBoundaries/ComponentErrorBoundary.tsx:61` | Botão / handler de clique | Tentar Novamente | executar `onRetry` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/ErrorBoundaries/ComponentErrorBoundary.tsx:88` | Botão / handler de clique | );  const ComponentErrorBoundary: React.FC | executar `onRetry` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/ErrorBoundaries/PageErrorBoundary.tsx:27` | Navegação programática | [icone AlertTriangle] | navegar para `/` | não testado |  |
| `src/components/ErrorBoundaries/PageErrorBoundary.tsx:53` | Botão / handler de clique | Recarregar Página | executar `handleReload` | não testado |  |
| `src/components/ErrorBoundaries/PageErrorBoundary.tsx:63` | Botão / handler de clique | Voltar | executar `handleGoBack` | não testado |  |
| `src/components/ErrorBoundaries/PageErrorBoundary.tsx:73` | Botão / handler de clique | Ir para Dashboard | executar `handleGoHome` | não testado |  |
| `src/components/ErrorBoundaries/PageErrorBoundary.tsx:83` | Botão / handler de clique | Tentar Novamente | executar `onReset` | não testado |  |
| `src/components/ErrorBoundary.tsx:96` | Abre URL externa | — | navegar para `/` | não testado |  |
| `src/components/ErrorBoundary.tsx:144` | Botão / handler de clique | Recarregar Página | executar `this.handleReload` | não testado |  |
| `src/components/ErrorBoundary.tsx:152` | Botão / handler de clique | Ir para Início | executar `this.handleGoHome` | não testado |  |
| `src/components/ErrorBoundary.tsx:184` | Botão / handler de clique | Tentar Novamente | executar `this.handleReset` | não testado |  |
| `src/components/ErrorBoundary.tsx:193` | Botão / handler de clique | Início | executar `this.handleGoHome` | não testado |  |
| `src/components/ErrorBoundary.tsx:218` | Botão / handler de clique | (   Component: React.ComponentType | executar `this.handleReset` | não testado |  |
| `src/components/ErrorBoundary.tsx:278` | Botão / handler de clique | Recarregar | executar `() => window.location.reload()` | não testado |  |
| `src/components/etiquetas/ColorPaletteInput.tsx:33` | Botão / handler de clique | [icone Check] | executar `() => onChange(color)` | não testado |  |
| `src/components/etiquetas/EtiquetasManagerSheet.tsx:126` | Botão / handler de clique | ) : isEditing ? ( | executar `handleSubmit` | não testado |  |
| `src/components/etiquetas/EtiquetasManagerSheet.tsx:137` | Botão / handler de clique | Cancelar | executar `resetForm` | não testado |  |
| `src/components/etiquetas/EtiquetasManagerSheet.tsx:168` | Botão / handler de clique | `Editar ${tag.name | executar `() => startEdit(tag)` | não testado |  |
| `src/components/etiquetas/EtiquetasManagerSheet.tsx:177` | Botão / handler de clique | Excluir etiqueta? | executar `() => setPendingDelete(tag)` | não testado |  |
| `src/components/etiquetas/EtiquetasManagerSheet.tsx:201` | Botão / handler de clique | [icone Loader2] | executar `(e) => { e.preventDefault(); confirmDelete(); }` | não testado |  |
| `src/components/etiquetas/LeadTagsDialog.tsx:116` | Botão / handler de clique | [icone Check] | executar `() => toggle(tag.id)` | não testado |  |
| `src/components/etiquetas/LeadTagsDialog.tsx:131` | Botão / handler de clique | Cancelar | executar `() => onOpenChange(false)` | não testado |  |
| `src/components/etiquetas/LeadTagsDialog.tsx:134` | Botão / handler de clique | [icone Loader2] | executar `handleSave` | não testado |  |
| `src/components/etiquetas/TagBadge.tsx:33` | Botão / handler de clique | — | executar `(e) => { e.stopPropagation(); onRemove(); }` | não testado |  |
| `src/components/FollowupEditModal.tsx:191` | Select / aba / radio | ( | executar `(value) => handleInputChange('type', value)` | não testado |  |
| `src/components/FollowupEditModal.tsx:210` | Select / aba / radio | ( | executar `(value) => handleInputChange('priority', value)` | não testado |  |
| `src/components/FollowupEditModal.tsx:242` | Select / aba / radio | ( | executar `(value) => handleInputChange('status', value)` | não testado |  |
| `src/components/FollowupEditModal.tsx:276` | Interruptor / checkbox | Follow-up recorrente | executar `(checked) => handleInputChange('recurring', checked)` | não testado |  |
| `src/components/FollowupEditModal.tsx:287` | Select / aba / radio | ( | executar `(value) => handleInputChange('recurring_type', value)` | não testado |  |
| `src/components/FollowupEditModal.tsx:334` | Botão / handler de clique | Cancelar | executar `handleDelete` | não testado |  |
| `src/components/FollowupEditModal.tsx:345` | Botão / handler de clique | Cancelar | executar `onClose` | não testado |  |
| `src/components/FollowupEditModal.tsx:353` | Botão / handler de clique | [icone Save] | executar `handleSave` | não testado |  |
| `src/components/stores/NewStoreDialog.tsx:119` | Botão / handler de clique | Cancelar | executar `() => onOpenChange(false)` | não testado |  |
| `src/components/stores/NewStoreDialog.tsx:124` | Botão / handler de clique | [icone Loader2] | executar `() => void submeter()` | não testado |  |
| `src/components/stores/StoreSwitcher.tsx:28` | Select / aba / radio | ( | executar `(v) => setActiveTenant(v)` | não testado |  |
| `src/components/StripeConfiguration.tsx:335` | Botão / handler de clique | : | executar `() => toggleSecretVisibility('secret_key')` | não testado |  |
| `src/components/StripeConfiguration.tsx:358` | Botão / handler de clique | : | executar `() => toggleSecretVisibility('webhook_secret')` | não testado |  |
| `src/components/StripeConfiguration.tsx:366` | Botão / handler de clique | : | executar `handleSave` | não testado |  |
| `src/components/StripeConfiguration.tsx:370` | Botão / handler de clique | : | executar `handleTest` | não testado |  |
| `src/components/StripeConfiguration.tsx:428` | Âncora (`<a href>`) | Documentação Stripe MCP | navegar para `https://docs.stripe.com/mcp#tools` | não testado |  |
| `src/components/StripeConfiguration.tsx:443` | Âncora (`<a href>`) | Chaves da API | navegar para `https://dashboard.stripe.com/apikeys` | não testado |  |
| `src/components/StripeConfiguration.tsx:458` | Âncora (`<a href>`) | Configurar Webhooks | navegar para `https://dashboard.stripe.com/webhooks` | não testado |  |
| `src/components/StripeConfiguration.tsx:473` | Âncora (`<a href>`) | Guia de Testes | navegar para `https://stripe.com/docs/testing` | não testado |  |
| `src/components/TransactionStatistics.tsx:123` | Botão / handler de clique | ) : ( | executar `loadStats` | não testado |  |
| `src/lib/accessibility.tsx:17` | Âncora (`<a href>`) | Pular para conteúdo principal | navegar para `href` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |

## Páginas legais

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/pages/PrivacyPolicy.tsx:16` | Link interno (`<Link to>`) | Voltar | navegar para `/auth` | passa | âncoras externas com target=_blank e rel=noopener; conteúdo fora do escopo |
| `src/pages/PrivacyPolicy.tsx:267` | Âncora (`<a href>`) | whatsapp.com/legal/business-policy | navegar para `https://www.whatsapp.com/legal/business-policy` | passa | âncoras externas com target=_blank e rel=noopener; conteúdo fora do escopo |
| `src/pages/PrivacyPolicy.tsx:271` | Âncora (`<a href>`) | facebook.com/privacy/policy | navegar para `https://www.facebook.com/privacy/policy` | passa | âncoras externas com target=_blank e rel=noopener; conteúdo fora do escopo |
| `src/pages/TermsOfService.tsx:16` | Link interno (`<Link to>`) | Voltar | navegar para `/auth` | passa | âncoras externas com target=_blank e rel=noopener; conteúdo fora do escopo |
| `src/pages/TermsOfService.tsx:233` | Âncora (`<a href>`) | WhatsApp Business Policy | navegar para `https://www.whatsapp.com/legal/business-policy` | passa | âncoras externas com target=_blank e rel=noopener; conteúdo fora do escopo |
| `src/pages/TermsOfService.tsx:237` | Âncora (`<a href>`) | WhatsApp Commerce Policy | navegar para `https://www.whatsapp.com/legal/commerce-policy` | passa | âncoras externas com target=_blank e rel=noopener; conteúdo fora do escopo |
| `src/pages/TermsOfService.tsx:301` | Link interno (`<Link to>`) | Política de Privacidade | navegar para `/privacy-policy` | passa | âncoras externas com target=_blank e rel=noopener; conteúdo fora do escopo |
| `src/pages/TermsOfService.tsx:337` | Link interno (`<Link to>`) | Política de Privacidade | navegar para `/privacy-policy` | passa | âncoras externas com target=_blank e rel=noopener; conteúdo fora do escopo |

## Rastreamento

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/tracking/AdvancedAnalytics.tsx:154` | Select / aba / radio | Por Hora | executar `setGranularity` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/AdvancedAnalytics.tsx:165` | Select / aba / radio | Período Anterior | executar `setComparisonPeriod` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/AdvancedAnalytics.tsx:175` | ⚠️ Botão sem handler | Atualizar | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/AdvancedAnalytics.tsx:179` | ⚠️ Botão sem handler | Exportar | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/AdvancedAnalytics.tsx:274` | Select / aba / radio | Visão Geral | executar `setActiveAnalyticsTab` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/AnalyticsTab.tsx:101` | Select / aba / radio | 7 dias | executar `(value: DateRange) => setFilters(prev => ({ ...prev, dateRange: value }))` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/AnalyticsTab.tsx:121` | Botão / handler de clique | Atualizar | executar `handleRefresh` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/AnalyticsTab.tsx:128` | Select / aba / radio | PDF | executar `handleExport` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/AnalyticsTab.tsx:208` | Select / aba / radio | Visão Geral | executar `setSelectedTab` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/AnalyticsTab.tsx:308` | ⚠️ Botão sem handler | — | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/charts/HeatmapChart.tsx:256` | Select / aba / radio | Leads | executar `(value: any) => setSelectedMetric(value)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/charts/PerformanceMetricsChart.tsx:435` | Select / aba / radio | ( | executar `setSelectedMetric` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/charts/PerformanceMetricsChart.tsx:502` | Select / aba / radio | Todas | executar `setSelectedCategory` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/charts/PerformanceMetricsChart.tsx:519` | Select / aba / radio | Visão Geral | executar `(value: any) => setViewMode(value)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/charts/PredictiveAnalyticsChart.tsx:415` | Select / aba / radio | Previsão | executar `(value: any) => setSelectedView(value)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/charts/PredictiveAnalyticsChart.tsx:430` | Select / aba / radio | Previsão | executar `setSelectedView` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/charts/PredictiveAnalyticsChart.tsx:486` | ⚠️ Botão sem handler | Precisão do Modelo | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/charts/RealtimeAnalytics.tsx:343` | Botão / handler de clique | Pausar | executar `() => setIsLive(!isLive)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/charts/TimeAnalyticsChart.tsx:264` | Select / aba / radio | Leads | executar `(value: any) => setSelectedMetric(value)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/charts/TimeAnalyticsChart.tsx:275` | Select / aba / radio | Tendência | executar `(value: any) => setViewType(value)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/tracking/SourceConfigModal.tsx:152` | Select / aba / radio | Orgânico | executar `(value: any) => setFormData({...formData, type: value})` | não testado |  |
| `src/components/tracking/SourceConfigModal.tsx:171` | Interruptor / checkbox | Fonte ativa | executar `(checked) => setFormData({...formData, isActive: checked})` | não testado |  |
| `src/components/tracking/SourceConfigModal.tsx:239` | Botão / handler de clique | Código de Rastreamento | executar `() => copyToClipboard(generateUTMParameters())` | não testado |  |
| `src/components/tracking/SourceConfigModal.tsx:270` | Botão / handler de clique | Webhook URL | executar `() => copyToClipboard(generateTrackingCode())` | não testado |  |
| `src/components/tracking/SourceConfigModal.tsx:308` | Botão / handler de clique | Cancelar | executar `() => onOpenChange(false)` | não testado |  |
| `src/components/tracking/SourceConfigModal.tsx:311` | Botão / handler de clique | — | executar `handleSave` | não testado |  |
| `src/components/tracking/TrackingFilters.tsx:130` | Botão gatilho (Radix `asChild`) | [icone CalendarIcon] | executar `variant="outline" className={cn( "w-[240px] justify-start text-left font-normal", !dateRange && "text-muted-foreground"` | não testado |  |
| `src/components/tracking/TrackingFilters.tsx:167` | Select / aba / radio | ( | executar `onStatusChange` | não testado |  |
| `src/components/tracking/TrackingFilters.tsx:183` | Botão gatilho (Radix `asChild`) | 0 && ( | executar `variant="outline"` | não testado |  |
| `src/components/tracking/TrackingFilters.tsx:217` | Botão / handler de clique | Limpar | executar `clearAllFilters` | não testado |  |
| `src/components/tracking/TrackingFilters.tsx:230` | Botão / handler de clique | [icone X] | executar `() => handleSourceToggle(source)` | não testado |  |
| `src/components/tracking/TrackingFilters.tsx:238` | Botão / handler de clique | [icone X] | executar `() => onStatusChange('Todos')` | não testado |  |
| `src/components/tracking/TrafficSourceConfig.tsx:193` | Botão / handler de clique | Adicionar Fonte | executar `() => setShowModal(true)` | não testado |  |
| `src/components/tracking/TrafficSourceConfig.tsx:242` | Botão / handler de clique | : | executar `() => toggleSourceStatus(source.id)` | não testado |  |
| `src/components/tracking/TrafficSourceConfig.tsx:249` | Botão / handler de clique | [icone Settings] | executar `() => { setSelectedSource(source); setShowModal(true); }` | não testado |  |
| `src/components/tracking/TrafficSourceConfig.tsx:256` | Botão inerte de propósito (`ComingSoonButton`) | [icone Copy] | executar `variant="ghost" size="icon" motivo="Duplicar fonte em breve"` | corrigido | ícone Copy sem handler; virou ComingSoonButton |
| `src/components/tracking/TrafficSourceConfig.tsx:259` | Botão inerte de propósito (`ComingSoonButton`) | [icone MoreHorizontal] | executar `variant="ghost" size="icon" motivo="Mais ações em breve"` | corrigido | ícone MoreHorizontal sem menu atrás; virou ComingSoonButton |
| `src/pages/Tracking.tsx:77` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Tracking.tsx:82` | Botão / handler de clique | Configurações | executar `handleOpenSettings` | não testado |  |
| `src/pages/Tracking.tsx:86` | Botão / handler de clique | Nova Fonte | executar `handleCreateNewSource` | não testado |  |
| `src/pages/Tracking.tsx:94` | Select / aba / radio | Dashboard | executar `setActiveTab` | não testado |  |

## Relatórios

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/analytics/AdvancedCharts.tsx:217` | Botão / handler de clique | Atualizar | executar `refresh` | não testado |  |
| `src/components/analytics/AdvancedCharts.tsx:226` | Botão / handler de clique | Exportar | executar `() => setIsFullscreen(!isFullscreen)` | não testado |  |
| `src/components/analytics/AdvancedCharts.tsx:230` | Botão inerte de propósito (`ComingSoonButton`) | Exportar | executar `variant="outline" size="sm" motivo="Exportação em breve"` | corrigido | "Exportar" não tinha handler nenhum: clique sem resposta. Virou ComingSoonButton (desabilitado + tooltip). Ver seção de decisões: implementar a exportação de fato é escolha sua. |
| `src/components/analytics/AdvancedCharts.tsx:320` | Select / aba / radio | Leads | executar `(value: any) => setSelectedMetric(value)` | não testado |  |
| `src/components/analytics/AdvancedCharts.tsx:332` | Select / aba / radio | Linha | executar `(value: any) => setChartType(value)` | não testado |  |
| `src/components/analytics/AdvancedCharts.tsx:343` | Botão inerte de propósito (`ComingSoonButton`) | Exportar | executar `variant="outline" size="sm" motivo="Exportação em breve"` | corrigido | mesmo caso do outro "Exportar" desta tela |
| `src/components/analytics/AdvancedFilters.tsx:247` | Botão / handler de clique | 0 && ( | executar `() => setIsExpanded(!isExpanded)` | não testado |  |
| `src/components/analytics/AdvancedFilters.tsx:255` | Botão / handler de clique | Limpar | executar `clearAllFilters` | não testado |  |
| `src/components/analytics/AdvancedFilters.tsx:271` | Select / aba / radio | ( | executar `handleQuickDateChange` | não testado |  |
| `src/components/analytics/AdvancedFilters.tsx:289` | Botão gatilho (Radix `asChild`) | Selecionar período | executar `variant="outline" className="w-60 justify-start text-left font-normal"` | não testado |  |
| `src/components/analytics/AdvancedFilters.tsx:324` | Select / aba / radio | ( | executar `(value) => updateFilter('conversionStatus', value)` | não testado |  |
| `src/components/analytics/AdvancedFilters.tsx:344` | Select / aba / radio | ( | executar `(value) => updateFilter('segmentation', { type: value as any })` | não testado |  |
| `src/components/analytics/AdvancedFilters.tsx:378` | Interruptor / checkbox | Status do Lead | executar `() => toggleArrayFilter('sources', source)` | não testado |  |
| `src/components/analytics/AdvancedFilters.tsx:400` | Interruptor / checkbox | Dispositivos | executar `() => toggleArrayFilter('status', status)` | não testado |  |
| `src/components/analytics/AdvancedFilters.tsx:422` | Interruptor / checkbox | [icone Separator] | executar `() => toggleArrayFilter('devices', device)` | não testado |  |
| `src/components/analytics/ExportReports.tsx:168` | Botão gatilho (Radix `asChild`) | ) : ( | executar `variant="outline" size="sm" disabled={isExporting}` | não testado |  |
| `src/components/analytics/ExportReports.tsx:180` | Botão / handler de clique | PDF | executar `() => handleQuickExport('pdf')` | não testado |  |
| `src/components/analytics/ExportReports.tsx:184` | Botão / handler de clique | Excel | executar `() => handleQuickExport('excel')` | não testado |  |
| `src/components/analytics/ExportReports.tsx:188` | Botão / handler de clique | CSV | executar `() => handleQuickExport('csv')` | não testado |  |
| `src/components/analytics/ExportReports.tsx:198` | Botão gatilho (Radix `asChild`) | Personalizar | executar `variant="outline" size="sm"` | não testado |  |
| `src/components/analytics/ExportReports.tsx:229` | Select / aba / radio | PDF | executar `(value: 'pdf' \| 'excel' \| 'csv') => setExportConfig(prev => ({ ...prev, format: value }))` | não testado |  |
| `src/components/analytics/ExportReports.tsx:274` | Interruptor / checkbox | Opções PDF | executar `(checked) => updateSection(key as keyof ExportConfig['sections'], checked as boolean)` | não testado |  |
| `src/components/analytics/ExportReports.tsx:296` | Interruptor / checkbox | Incluir gráficos em alta resolução | executar `(checked) => setExportConfig(prev => ({ ...prev, includeCharts: checked as boolean }))` | não testado |  |
| `src/components/analytics/ExportReports.tsx:309` | Interruptor / checkbox | Incluir tabelas de métricas detalhadas | executar `(checked) => setExportConfig(prev => ({ ...prev, includeMetrics: checked as boolean }))` | não testado |  |
| `src/components/analytics/ExportReports.tsx:329` | Interruptor / checkbox | Incluir dados brutos detalhados | executar `(checked) => setExportConfig(prev => ({ ...prev, includeRawData: checked as boolean }))` | não testado |  |
| `src/components/analytics/ExportReports.tsx:343` | Botão / handler de clique | Exportando... | executar `handleCustomExport` | não testado |  |
| `src/components/analytics/PerformanceAnalytics.tsx:234` | ⚠️ Botão sem handler | Atualizar | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/analytics/PerformanceAnalytics.tsx:319` | ⚠️ Botão sem handler | Atualizar Dados | executar `` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/analytics/RealTimeMetrics.tsx:172` | Botão / handler de clique | Atualizar | executar `() => { refresh(); actions?.refreshRealTime(); actions?.refreshSystemMetrics(); }` | não testado |  |
| `src/components/analytics/RealTimeMetrics.tsx:185` | Botão / handler de clique | : | executar `() => setAutoRefresh(!autoRefresh)` | não testado |  |
| `src/components/analytics/RealTimeMetrics.tsx:352` | Botão / handler de clique | Parar | executar `processingStatus?.isRunning ? actions?.stopProcessing : actions?.startProcessing` | não testado |  |
| `src/components/analytics/RealTimeMetrics.tsx:370` | Botão / handler de clique | Forçar | executar `actions?.forceProcess` | não testado |  |
| `src/components/analytics/RealTimeMetrics.tsx:391` | Botão / handler de clique | Atualizar Todas | executar `actions?.refreshAllViews` | não testado |  |
| `src/components/analytics/RealTimeMetrics.tsx:416` | Botão / handler de clique | [icone RefreshCw] | executar `() => actions?.refreshView(view.view_name)` | não testado |  |
| `src/components/analytics/RealTimeStatus.tsx:156` | Botão / handler de clique | ) : ( | executar `isPaused ? onResume : onPause` | não testado |  |
| `src/components/analytics/RealTimeStatus.tsx:177` | Botão / handler de clique | Atualizar agora | executar `onRefresh` | não testado |  |
| `src/components/reports/AdvancedReports.tsx:337` | ⚠️ Botão sem handler | Exportar | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:341` | ⚠️ Botão sem handler | Compartilhar | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:462` | Select / aba / radio | Últimos 7 dias | executar `handleTimeRangeChange` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:478` | Select / aba / radio | Barras | executar `handleChartTypeChange` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:493` | Select / aba / radio | Por Dia | executar `handleGroupingChange` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:627` | ⚠️ Botão sem handler | Cancelar | executar `variant="outline"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:631` | Botão / handler de clique | ;       case 'table': return | executar `handleSave` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:702` | Botão / handler de clique | Visualizar | executar `() => onUse(template)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:707` | Botão / handler de clique | [icone Edit] | executar `() => onEdit(template)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:710` | ⚠️ Botão sem handler | [icone Copy] | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:716` | Botão / handler de clique | [icone Trash2] | executar `() => onDelete(template.id)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:799` | Select / aba / radio | Todas as categorias | executar `setFilter` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:812` | ⚠️ Botão sem handler | Atualizar | executar `variant="outline"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:923` | Botão / handler de clique | Atualizar | executar `handleRefresh` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:929` | ⚠️ Botão sem handler | Exportar | executar `variant="outline"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:933` | ⚠️ Botão sem handler | Compartilhar | executar `variant="outline"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:967` | Botão / handler de clique | ← Voltar | executar `() => setSelectedTemplate(null)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/AdvancedReports.tsx:987` | Select / aba / radio | Relatórios Salvos | executar `setActiveTab` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/reports/DeleteConfirmationModal.tsx:94` | Botão / handler de clique | Cancelar | executar `onClose` | não testado |  |
| `src/components/reports/DeleteConfirmationModal.tsx:102` | Botão / handler de clique | ) : ( | executar `handleConfirm` | não testado |  |
| `src/components/reports/DeliveryLog.tsx:276` | Select / aba / radio | Todos Status | executar `setStatusFilter` | não testado |  |
| `src/components/reports/DeliveryLog.tsx:288` | Botão inerte de propósito (`ComingSoonButton`) | Exportar Histórico | executar `variant="outline" size="sm" motivo="Exportação em breve"` | corrigido | "Exportar Histórico" sem handler; virou ComingSoonButton |
| `src/components/reports/DeliveryLog.tsx:415` | Botão / handler de clique | [icone FileText] | executar `() => handleResend(execution)` | não testado |  |
| `src/components/reports/EditTemplateModal.tsx:178` | Select / aba / radio | ( | executar `(value) => setFormData(prev => ({ ...prev, type: value }))` | não testado |  |
| `src/components/reports/EditTemplateModal.tsx:212` | Select / aba / radio | ( | executar `(value) => setFormData(prev => ({ ...prev, category: value }))` | não testado |  |
| `src/components/reports/EditTemplateModal.tsx:231` | Interruptor / checkbox | Template Público | executar `(checked) => setFormData(prev => ({ ...prev, is_public: checked }))` | não testado |  |
| `src/components/reports/EditTemplateModal.tsx:249` | Botão / handler de clique | Adicionar Seção | executar `addSection` | não testado |  |
| `src/components/reports/EditTemplateModal.tsx:273` | Botão / handler de clique | Título da Seção | executar `() => removeSection(index)` | não testado |  |
| `src/components/reports/EditTemplateModal.tsx:293` | Select / aba / radio | Padrão | executar `(value) => updateSection(index, 'type', value)` | não testado |  |
| `src/components/reports/EditTemplateModal.tsx:327` | Botão / handler de clique | Cancelar | executar `onClose` | não testado |  |
| `src/components/reports/EditTemplateModal.tsx:331` | Botão / handler de clique | ) : ( | executar `handleSave` | não testado |  |
| `src/components/reports/NewReportModal.tsx:260` | Botão / handler de clique | ( | executar `handleClose` | não testado |  |
| `src/components/reports/NewReportModal.tsx:326` | Botão / handler de clique | [icone Icon] | executar `() => setReportData(prev => ({ ...prev, type: type.value, metrics: [] }))` | não testado |  |
| `src/components/reports/NewReportModal.tsx:346` | Select / aba / radio | ( | executar `(value) => setReportData(prev => ({ ...prev, frequency: value }))` | não testado |  |
| `src/components/reports/NewReportModal.tsx:362` | Select / aba / radio | ( | executar `(value) => setReportData(prev => ({ ...prev, format: value }))` | não testado |  |
| `src/components/reports/NewReportModal.tsx:388` | Botão / handler de clique | — | executar `() => handleMetricToggle(metric.id)` | não testado |  |
| `src/components/reports/NewReportModal.tsx:507` | Botão / handler de clique | Anterior | executar `handlePrevious` | não testado |  |
| `src/components/reports/NewReportModal.tsx:516` | Botão / handler de clique | Próximo | executar `handleNext` | não testado |  |
| `src/components/reports/NewReportModal.tsx:523` | Botão / handler de clique | Criando... | executar `handleSubmit` | não testado |  |
| `src/components/reports/ReportBuilder.tsx:171` | Select / aba / radio | Performance | executar `setReportCategory` | não testado |  |
| `src/components/reports/ReportBuilder.tsx:201` | Botão / handler de clique | Adicionar Seção | executar `addSection` | não testado |  |
| `src/components/reports/ReportBuilder.tsx:223` | Select / aba / radio | ( | executar `(value) => updateSection(section.id, 'chartType', value)` | não testado |  |
| `src/components/reports/ReportBuilder.tsx:241` | Botão / handler de clique | Métricas para esta seção | executar `() => removeSection(section.id)` | não testado |  |
| `src/components/reports/ReportBuilder.tsx:262` | Interruptor / checkbox | 0 && ( | executar `() => toggleMetric(metric.id, section.id)` | não testado |  |
| `src/components/reports/ReportBuilder.tsx:299` | Botão inerte de propósito (`ComingSoonButton`) | Visualizar Preview | executar `variant="outline" motivo="Pré-visualização em breve"` | corrigido | "Visualizar Preview" sem handler; virou ComingSoonButton |
| `src/components/reports/ReportBuilder.tsx:304` | Botão / handler de clique | [icone Plus] | executar `handleSaveReport` | não testado |  |
| `src/components/reports/ReportSettingsModal.tsx:129` | Botão / handler de clique | Configurações de Email | executar `handleClose` | não testado |  |
| `src/components/reports/ReportSettingsModal.tsx:152` | Interruptor / checkbox | Servidor SMTP | executar `(checked) => handleSettingChange('emailSettings', 'enabled', checked)` | não testado |  |
| `src/components/reports/ReportSettingsModal.tsx:244` | Interruptor / checkbox | Instância do WhatsApp | executar `(checked) => handleSettingChange('whatsappSettings', 'enabled', checked)` | não testado |  |
| `src/components/reports/ReportSettingsModal.tsx:257` | Select / aba / radio | Instância Principal | executar `(value) => handleSettingChange('whatsappSettings', 'instanceId', value)` | não testado |  |
| `src/components/reports/ReportSettingsModal.tsx:299` | Select / aba / radio | ( | executar `(value) => handleSettingChange('schedulingSettings', 'timezone', value)` | não testado |  |
| `src/components/reports/ReportSettingsModal.tsx:365` | Interruptor / checkbox | Compressão de Arquivos | executar `(checked) => handleSettingChange('generalSettings', 'autoArchive', checked)` | não testado |  |
| `src/components/reports/ReportSettingsModal.tsx:377` | Interruptor / checkbox | Dias para Arquivamento | executar `(checked) => handleSettingChange('generalSettings', 'compressionEnabled', checked)` | não testado |  |
| `src/components/reports/ReportSettingsModal.tsx:413` | Botão / handler de clique | Cancelar | executar `handleClose` | não testado |  |
| `src/components/reports/ReportSettingsModal.tsx:416` | Botão / handler de clique | Salvando... | executar `handleSave` | não testado |  |
| `src/components/reports/ReportTemplates.tsx:182` | Botão / handler de clique | ( | executar `() => setSelectedCategory(category)` | não testado |  |
| `src/components/reports/ReportTemplates.tsx:293` | Botão / handler de clique | Gerar | executar `() => handleGenerateReport(template)` | não testado |  |
| `src/components/reports/ReportTemplates.tsx:298` | Botão inerte de propósito (`ComingSoonButton`) | [icone Download] | executar `variant="outline" size="sm" motivo="Baixar modelo em breve"` | corrigido | ícone Download sem handler; virou ComingSoonButton |
| `src/components/reports/ReportTemplates.tsx:303` | Botão gatilho (Radix `asChild`) | Visualizar | executar `variant="outline" size="sm" disabled={deleteTemplateMutation.isPending}` | não testado |  |
| `src/components/reports/ReportTemplates.tsx:312` | Botão / handler de clique | Visualizar | executar `() => handleViewTemplate(template)` | não testado |  |
| `src/components/reports/ReportTemplates.tsx:316` | Botão / handler de clique | Editar | executar `() => handleEditTemplate(template)` | não testado |  |
| `src/components/reports/ReportTemplates.tsx:321` | Botão / handler de clique | Excluir | executar `() => handleDeleteTemplate(template)` | não testado |  |
| `src/components/reports/ReportTemplates.tsx:349` | Botão / handler de clique | Ver todos os templates | executar `() => setSelectedCategory('Todos')` | não testado |  |
| `src/components/reports/ScheduleList.tsx:188` | Botão / handler de clique | Novo Agendamento | executar `() => setShowModal(true)` | não testado |  |
| `src/components/reports/ScheduleList.tsx:362` | Botão / handler de clique | [icone Edit] | executar `() => handleEdit(schedule)` | não testado |  |
| `src/components/reports/ScheduleList.tsx:366` | Botão inerte de propósito (`ComingSoonButton`) | Nenhum agendamento encontrado | executar `variant="ghost" size="icon" motivo="Mais ações em breve"` | corrigido | ícone MoreHorizontal sem menu atrás; virou ComingSoonButton |
| `src/components/reports/ScheduleList.tsx:386` | Botão / handler de clique | Criar Agendamento | executar `() => setShowModal(true)` | não testado |  |
| `src/components/reports/ScheduleModal.tsx:329` | Select / aba / radio | ( | executar `(value) => setFormData({...formData, reportName: value})` | não testado |  |
| `src/components/reports/ScheduleModal.tsx:356` | Select / aba / radio | Diário | executar `(value: any) => setFormData({...formData, frequency: value})` | não testado |  |
| `src/components/reports/ScheduleModal.tsx:385` | Select / aba / radio | ( | executar `(value) => setFormData({...formData, dayOfWeek: value})` | não testado |  |
| `src/components/reports/ScheduleModal.tsx:407` | Select / aba / radio | ( | executar `(value) => setFormData({...formData, dayOfMonth: parseInt(value)})` | não testado |  |
| `src/components/reports/ScheduleModal.tsx:448` | Botão / handler de clique | 0 && ( | executar `addRecipient` | não testado |  |
| `src/components/reports/ScheduleModal.tsx:460` | Botão / handler de clique | Cancelar | executar `() => removeRecipient(recipient)` | não testado |  |
| `src/components/reports/ScheduleModal.tsx:474` | Botão / handler de clique | Cancelar | executar `() => onOpenChange(false)` | não testado |  |
| `src/components/reports/ScheduleModal.tsx:477` | Botão / handler de clique | — | executar `handleSave` | não testado |  |
| `src/pages/Reports.tsx:27` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/Reports.tsx:32` | Botão / handler de clique | Configurações | executar `() => setShowSettings(true)` | não testado |  |
| `src/pages/Reports.tsx:36` | Botão / handler de clique | Novo Relatório | executar `() => setShowNewReport(true)` | não testado |  |
| `src/pages/Reports.tsx:44` | Select / aba / radio | Templates | executar `setActiveTab` | não testado |  |

## WhatsApp / webhooks

| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| `src/components/webhook/WebhookDashboard.tsx:227` | Botão / handler de clique | Atualizar | executar `refreshData` | não testado |  |
| `src/components/whatsapp/CreateInstanceModal.tsx:234` | Botão / handler de clique | Cancelar | executar `() => handleClose(false)` | não testado |  |
| `src/components/whatsapp/CreateInstanceModal.tsx:237` | Botão / handler de clique | Continuar | executar `goToConfigure` | não testado |  |
| `src/components/whatsapp/CreateInstanceModal.tsx:243` | Botão / handler de clique | Voltar | executar `goBackToSelect` | não testado |  |
| `src/components/whatsapp/CreateInstanceModal.tsx:247` | Botão / handler de clique | Cancelar | executar `() => handleClose(false)` | não testado |  |
| `src/components/whatsapp/CreateInstanceModal.tsx:250` | Botão / handler de clique | Criar e abrir QR Code | executar `handleSubmit` | não testado |  |
| `src/components/whatsapp/DeleteInstanceModal.tsx:157` | Botão / handler de clique | Cancelar | executar `() => onOpenChange(false)` | não testado |  |
| `src/components/whatsapp/DeleteInstanceModal.tsx:165` | Botão / handler de clique | [icone Loader2] | executar `handleDelete` | não testado |  |
| `src/components/whatsapp/EditInstanceModal.tsx:144` | Envio de formulário | Nome da Instância * | executar `handleSubmit` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/EditInstanceModal.tsx:217` | Interruptor / checkbox | Instância ativa | executar `(checked) => handleInputChange('is_active', checked)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/EditInstanceModal.tsx:262` | Botão / handler de clique | Cancelar | executar `() => onOpenChange(false)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/forms/EvolutionApiForm.tsx:87` | Botão / handler de clique | Gerar | executar `generateInstanceKey` | não testado |  |
| `src/components/whatsapp/forms/EvolutionApiForm.tsx:105` | Interruptor / checkbox | Status: | executar `(v) => onChange({ enableWebhookAutomation: v })` | não testado |  |
| `src/components/whatsapp/forms/OfficialApiForm.tsx:75` | Botão / handler de clique | — ou preencha os campos abaixo manualmente — | executar `handleEmbeddedSignup` | não testado |  |
| `src/components/whatsapp/forms/OfficialApiForm.tsx:89` | ⚠️ Botão sem handler | Conectar com a Meta | executar `type="button" variant="outline" className="w-full opacity-50 cursor-not-allowed" disabled` | inerte de propósito | "Conectar com a Meta" fica disabled quando VITE_FACEBOOK_APP_ID / VITE_META_CONFIG_ID não estão configurados, e o tooltip diz isso |
| `src/components/whatsapp/forms/OfficialApiForm.tsx:110` | Âncora (`<a href>`) | Meta for Developers | navegar para `https://developers.facebook.com/` | não testado |  |
| `src/components/whatsapp/forms/OfficialApiForm.tsx:199` | Botão / handler de clique | Copiar Callback URL | executar `copyWebhookUrl` | não testado |  |
| `src/components/whatsapp/InstanceManager.tsx:155` | Botão / handler de clique | Tentar Novamente | executar `refreshInstances` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/InstanceManager.tsx:172` | Botão gatilho (Radix `asChild`) | Nova Instância | executar `` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/InstanceManager.tsx:195` | Botão / handler de clique | Cancelar | executar `() => setShowCreateDialog(false)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/InstanceManager.tsx:198` | Botão / handler de clique | ( | executar `handleCreateInstance` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/InstanceManager.tsx:234` | Botão / handler de clique | ) : ( | executar `() => handleConnect(instance.instanceName)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/InstanceManager.tsx:245` | ⚠️ Botão sem handler | Configurar | executar `variant="outline" size="sm"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/InstanceManager.tsx:252` | Botão / handler de clique | Excluir | executar `() => handleDeleteInstance(instance.instanceName)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/InstanceManager.tsx:282` | Botão / handler de clique | Fechar | executar `() => setQrCode(null)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/ProviderSelector.tsx:66` | Botão / handler de clique | — | executar `() => !disabled && onChange(option.id)` | não testado |  |
| `src/components/whatsapp/ProviderSelector.tsx:112` | Âncora (`<a href>`) | Documentação | navegar para `option.docsUrl` | não testado |  |
| `src/components/whatsapp/ProviderSelector.tsx:116` | Botão / handler de clique | Documentação | executar `(e) => e.stopPropagation()` | não testado |  |
| `src/components/whatsapp/QRCodeModal.tsx:167` | Botão / handler de clique | Tentar novamente | executar `handleRefresh` | não testado |  |
| `src/components/whatsapp/QRCodeModal.tsx:182` | Botão / handler de clique | Copiar | executar `copyPairingCode` | não testado |  |
| `src/components/whatsapp/QRCodeModal.tsx:228` | Botão / handler de clique | Atualizar conexão | executar `handleRefresh` | não testado |  |
| `src/components/whatsapp/QRCodeModal.tsx:238` | Botão / handler de clique | Fechar | executar `handleClose` | não testado |  |
| `src/components/whatsapp/SetupWizard.tsx:171` | Botão / handler de clique | Cancelar | executar `onClose` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/SetupWizard.tsx:176` | Botão / handler de clique | Voltar | executar `() => setStep(step - 1)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/SetupWizard.tsx:181` | Botão / handler de clique | Próximo | executar `handleNext` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/SetupWizard.tsx:185` | Botão / handler de clique | Concluir | executar `handleComplete` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/WebhookConfig.tsx:50` | ⚠️ Botão sem handler | Salvar Configuração | executar `` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/WebhookConfig.tsx:54` | ⚠️ Botão sem handler | Testar Webhook | executar `variant="outline"` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/WebhookConfigModal.tsx:218` | Interruptor / checkbox | Status de Conexão | executar `() => handleEventToggle('messages')` | não testado |  |
| `src/components/whatsapp/WebhookConfigModal.tsx:226` | Interruptor / checkbox | Presença Online | executar `() => handleEventToggle('status')` | não testado |  |
| `src/components/whatsapp/WebhookConfigModal.tsx:234` | Interruptor / checkbox | QR Code | executar `() => handleEventToggle('presence')` | não testado |  |
| `src/components/whatsapp/WebhookConfigModal.tsx:242` | Interruptor / checkbox | ) : ( | executar `() => handleEventToggle('qrcode')` | não testado |  |
| `src/components/whatsapp/WebhookConfigModal.tsx:263` | Botão / handler de clique | [icone Save] | executar `handleSaveWebhook` | não testado |  |
| `src/components/whatsapp/WebhookConfigModal.tsx:271` | Botão / handler de clique | Status do Webhook | executar `handleTestWebhook` | não testado |  |
| `src/components/whatsapp/WhatsAppApiSettings.tsx:158` | Select / aba / radio | Evolution API | executar `(v: any) => setProvider(v)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/WhatsAppApiSettings.tsx:193` | Botão / handler de clique | [icone Settings] | executar `testConnection` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/WhatsAppApiSettings.tsx:197` | Botão / handler de clique | [icone Settings] | executar `saveSettings` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/components/whatsapp/WhatsAppSettings.tsx:115` | Botão / handler de clique | Nova Instância | executar `() => setShowSetupWizard(true)` | código órfão | arquivo não alcançável a partir de `src/main.tsx` |
| `src/pages/WhatsAppNumbers.tsx:355` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:379` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:404` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:427` | Link declarado em objeto (migalha / menu) | Dashboard | navegar para `/dashboard` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:445` | Botão / handler de clique | Nova Instância | executar `() => setShowCreateModal(true)` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:453` | Select / aba / radio | Instâncias | executar `setActiveTab` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:529` | Botão / handler de clique | Criar Primeira Instância | executar `() => setShowCreateModal(true)` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:582` | Botão / handler de clique | Atualizar status | executar `() => handleRefreshStatus(instance)` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:595` | Botão / handler de clique | Conectar via QR Code | executar `() => handleShowQR(instance)` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:608` | Botão / handler de clique | Configurar Webhook | executar `() => handleConfigureWebhook(instance)` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:616` | Botão / handler de clique | Desconectar | executar `() => handleDisconnect(instance)` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:630` | Botão / handler de clique | Testar conexão Meta | executar `() => verifyMetaConnection(instance.id)` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:638` | Botão / handler de clique | : | executar `() => handleRegisterNumber(instance)` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:652` | Botão / handler de clique | Excluir instância | executar `() => handleDelete(instance)` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:712` | Botão / handler de clique | Cancelar | executar `() => { setPinDialogInstance(null); setPinValue(''); }` | não testado |  |
| `src/pages/WhatsAppNumbers.tsx:715` | Botão / handler de clique | [icone Loader2] | executar `handlePinSubmit` | não testado |  |

