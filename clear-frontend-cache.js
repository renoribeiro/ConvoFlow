// Script para limpar cache do React Query e localStorage
// Execute este script e depois recarregue a página

console.log('🧹 Limpando cache do frontend...');

// Limpar localStorage
try {
  localStorage.clear();
  console.log('✅ localStorage limpo');
} catch (error) {
  console.log('❌ Erro ao limpar localStorage:', error.message);
}

// Limpar sessionStorage
try {
  sessionStorage.clear();
  console.log('✅ sessionStorage limpo');
} catch (error) {
  console.log('❌ Erro ao limpar sessionStorage:', error.message);
}

// Limpar cache do React Query (se disponível)
if (window.queryClient) {
  try {
    window.queryClient.clear();
    console.log('✅ Cache do React Query limpo');
  } catch (error) {
    console.log('❌ Erro ao limpar cache do React Query:', error.message);
  }
} else {
  console.log('⚠️ React Query client não encontrado na janela global');
}

// Invalidar todas as queries relacionadas a instâncias
if (window.queryClient) {
  try {
    window.queryClient.invalidateQueries({ queryKey: ['instances'] });
    window.queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    console.log('✅ Queries de instâncias invalidadas');
  } catch (error) {
    console.log('❌ Erro ao invalidar queries:', error.message);
  }
}

console.log('\n🔄 Agora recarregue a página (F5 ou Ctrl+R)');
console.log('💡 Se o problema persistir, use Ctrl+Shift+R para recarregar sem cache');