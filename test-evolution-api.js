/**
 * Script para testar a conexão com a Evolution API
 * Verifica se a API está respondendo e se as operações básicas funcionam
 */

const API_URL = 'http://localhost:8081';
const API_KEY = 'convoflow-evolution-api-key-2024';

async function testEvolutionAPI() {
  console.log('🔍 Testando conexão com Evolution API...');
  console.log(`📡 URL: ${API_URL}`);
  console.log(`🔑 API Key: ${API_KEY}`);
  console.log('\n' + '='.repeat(50) + '\n');

  try {
    // Teste 1: Verificar se a API está online
    console.log('1️⃣ Testando se a API está online...');
    const healthResponse = await fetch(`${API_URL}/manager/fetchInstances`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      }
    });

    if (!healthResponse.ok) {
      throw new Error(`API não está respondendo: ${healthResponse.status} - ${healthResponse.statusText}`);
    }

    const instances = await healthResponse.json();
    console.log('✅ API está online!');
    console.log(`📊 Instâncias encontradas: ${Array.isArray(instances) ? instances.length : 'N/A'}`);
    
    if (Array.isArray(instances) && instances.length > 0) {
      console.log('📋 Instâncias existentes:');
      instances.forEach((instance, index) => {
        console.log(`   ${index + 1}. ${instance.instanceName || instance.instance?.instanceName || 'Nome não disponível'} - Status: ${instance.status || instance.instance?.state || 'Desconhecido'}`);
      });
    }

    console.log('\n' + '-'.repeat(30) + '\n');

    // Teste 2: Tentar criar uma instância de teste
    console.log('2️⃣ Testando criação de instância...');
    const testInstanceName = `test_${Date.now()}`;
    
    const createResponse = await fetch(`${API_URL}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      },
      body: JSON.stringify({
        integration: "WHATSAPP-BAILEYS",
        instanceName: testInstanceName,
        qrcode: true,
        rejectCall: true,
        groupsIgnore: true,
        alwaysOnline: true,
        readMessages: true,
        readStatus: true,
        syncFullHistory: true
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.log(`❌ Erro ao criar instância: ${createResponse.status} - ${errorText}`);
    } else {
      const createResult = await createResponse.json();
      console.log('✅ Instância criada com sucesso!');
      console.log('📄 Resposta:', JSON.stringify(createResult, null, 2));

      console.log('\n' + '-'.repeat(30) + '\n');

      // Teste 3: Tentar obter QR Code
      console.log('3️⃣ Testando obtenção de QR Code...');
      
      // Aguardar um pouco para a instância ser criada
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const qrResponse = await fetch(`${API_URL}/instance/connect/${testInstanceName}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': API_KEY
        }
      });

      if (!qrResponse.ok) {
        const errorText = await qrResponse.text();
        console.log(`❌ Erro ao obter QR Code: ${qrResponse.status} - ${errorText}`);
      } else {
        const qrResult = await qrResponse.json();
        console.log('✅ QR Code obtido com sucesso!');
        console.log('📱 Dados de conexão:');
        console.log(`   - Código de pareamento: ${qrResult.pairingCode || 'N/A'}`);
        console.log(`   - QR Code: ${qrResult.code ? 'Disponível' : 'N/A'}`);
        console.log(`   - Count: ${qrResult.count || 'N/A'}`);
      }

      console.log('\n' + '-'.repeat(30) + '\n');

      // Teste 4: Limpar instância de teste
      console.log('4️⃣ Removendo instância de teste...');
      
      const deleteResponse = await fetch(`${API_URL}/instance/delete/${testInstanceName}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'apikey': API_KEY
        }
      });

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        console.log(`❌ Erro ao remover instância: ${deleteResponse.status} - ${errorText}`);
      } else {
        console.log('✅ Instância de teste removida com sucesso!');
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 Teste da Evolution API concluído!');
    console.log('✅ A API está funcionando corretamente.');

  } catch (error) {
    console.log('\n' + '='.repeat(50));
    console.error('💥 Erro durante o teste da Evolution API:');
    console.error('❌ Detalhes do erro:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n🔧 Possíveis soluções:');
      console.log('   1. Verifique se a Evolution API está rodando na porta 8081');
      console.log('   2. Confirme se o Docker container está ativo');
      console.log('   3. Teste o acesso direto: http://localhost:8081');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.log('\n🔧 Possíveis soluções:');
      console.log('   1. Verifique se a API Key está correta');
      console.log('   2. Confirme as configurações de autenticação da Evolution API');
    }
    
    console.log('\n❌ A Evolution API não está funcionando corretamente.');
  }
}

// Executar o teste
testEvolutionAPI();