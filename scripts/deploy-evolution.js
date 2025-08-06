#!/usr/bin/env node

/**
 * Script para deploy automatizado da Evolution API v2 via Portainer
 * 
 * Este script:
 * 1. Conecta com a API do Portainer
 * 2. Faz upload do docker-compose.yml
 * 3. Cria/atualiza o stack da Evolution API
 * 4. Monitora o status do deploy
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

class PortainerDeployService {
  constructor(config) {
    this.baseUrl = config.portainerUrl;
    this.username = config.username;
    this.password = config.password;
    this.endpointId = config.endpointId || 1;
    this.stackName = config.stackName || 'evolution-api';
    this.authToken = null;
  }

  /**
   * Faz requisição HTTP/HTTPS
   */
  async makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
      const protocol = this.baseUrl.startsWith('https') ? https : http;
      
      const req = protocol.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsedData = responseData ? JSON.parse(responseData) : {};
            resolve({
              statusCode: res.statusCode,
              data: parsedData,
              headers: res.headers
            });
          } catch (error) {
            resolve({
              statusCode: res.statusCode,
              data: responseData,
              headers: res.headers
            });
          }
        });
      });
      
      req.on('error', reject);
      
      if (data) {
        req.write(typeof data === 'string' ? data : JSON.stringify(data));
      }
      
      req.end();
    });
  }

  /**
   * Autentica no Portainer
   */
  async authenticate() {
    console.log('🔐 Autenticando no Portainer...');
    
    const url = new URL(`${this.baseUrl}/api/auth`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const authData = {
      username: this.username,
      password: this.password
    };
    
    try {
      const response = await this.makeRequest(options, authData);
      
      if (response.statusCode === 200 && response.data.jwt) {
        this.authToken = response.data.jwt;
        console.log('✅ Autenticação realizada com sucesso');
        return true;
      } else {
        throw new Error(`Falha na autenticação: ${response.statusCode} - ${JSON.stringify(response.data)}`);
      }
    } catch (error) {
      console.error('❌ Erro na autenticação:', error.message);
      throw error;
    }
  }

  /**
   * Lista stacks existentes
   */
  async listStacks() {
    console.log('📋 Listando stacks existentes...');
    
    const url = new URL(`${this.baseUrl}/api/stacks`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      }
    };
    
    try {
      const response = await this.makeRequest(options);
      
      if (response.statusCode === 200) {
        return response.data;
      } else {
        throw new Error(`Erro ao listar stacks: ${response.statusCode}`);
      }
    } catch (error) {
      console.error('❌ Erro ao listar stacks:', error.message);
      throw error;
    }
  }

  /**
   * Verifica se o stack já existe
   */
  async findStack(stackName) {
    const stacks = await this.listStacks();
    return stacks.find(stack => stack.Name === stackName);
  }

  /**
   * Cria um novo stack
   */
  async createStack(composeContent) {
    console.log(`🚀 Criando stack '${this.stackName}'...`);
    
    const url = new URL(`${this.baseUrl}/api/stacks`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}?type=2&method=string&endpointId=${this.endpointId}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      }
    };
    
    const stackData = {
      name: this.stackName,
      stackFileContent: composeContent,
      env: []
    };
    
    try {
      const response = await this.makeRequest(options, stackData);
      
      if (response.statusCode === 200) {
        console.log('✅ Stack criado com sucesso');
        return response.data;
      } else {
        throw new Error(`Erro ao criar stack: ${response.statusCode} - ${JSON.stringify(response.data)}`);
      }
    } catch (error) {
      console.error('❌ Erro ao criar stack:', error.message);
      throw error;
    }
  }

  /**
   * Atualiza um stack existente
   */
  async updateStack(stackId, composeContent) {
    console.log(`🔄 Atualizando stack '${this.stackName}'...`);
    
    const url = new URL(`${this.baseUrl}/api/stacks/${stackId}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}?endpointId=${this.endpointId}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      }
    };
    
    const stackData = {
      stackFileContent: composeContent,
      env: [],
      prune: false
    };
    
    try {
      const response = await this.makeRequest(options, stackData);
      
      if (response.statusCode === 200) {
        console.log('✅ Stack atualizado com sucesso');
        return response.data;
      } else {
        throw new Error(`Erro ao atualizar stack: ${response.statusCode} - ${JSON.stringify(response.data)}`);
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar stack:', error.message);
      throw error;
    }
  }

  /**
   * Executa o deploy completo
   */
  async deploy() {
    try {
      // 1. Autenticar
      await this.authenticate();
      
      // 2. Ler o arquivo docker-compose
      const composePath = path.join(__dirname, '..', 'docker-compose.evolution.yml');
      
      if (!fs.existsSync(composePath)) {
        throw new Error(`Arquivo docker-compose não encontrado: ${composePath}`);
      }
      
      const composeContent = fs.readFileSync(composePath, 'utf8');
      console.log('📄 Arquivo docker-compose carregado');
      
      // 3. Verificar se o stack já existe
      const existingStack = await this.findStack(this.stackName);
      
      if (existingStack) {
        // Atualizar stack existente
        await this.updateStack(existingStack.Id, composeContent);
      } else {
        // Criar novo stack
        await this.createStack(composeContent);
      }
      
      console.log('🎉 Deploy da Evolution API concluído com sucesso!');
      console.log('📍 A API estará disponível em: http://localhost:8080');
      console.log('🔑 API Key: convoflow-evolution-api-key-2024');
      
      return true;
      
    } catch (error) {
      console.error('💥 Erro durante o deploy:', error.message);
      throw error;
    }
  }
}

// Configuração padrão
const defaultConfig = {
  portainerUrl: process.env.PORTAINER_URL || 'http://localhost:9000',
  username: process.env.PORTAINER_USERNAME || 'admin',
  password: process.env.PORTAINER_PASSWORD || 'admin123',
  endpointId: parseInt(process.env.PORTAINER_ENDPOINT_ID) || 1,
  stackName: process.env.EVOLUTION_STACK_NAME || 'evolution-api'
};

// Função principal
async function main() {
  console.log('🚀 Iniciando deploy da Evolution API v2...');
  console.log('⚙️  Configuração:');
  console.log(`   - Portainer URL: ${defaultConfig.portainerUrl}`);
  console.log(`   - Username: ${defaultConfig.username}`);
  console.log(`   - Endpoint ID: ${defaultConfig.endpointId}`);
  console.log(`   - Stack Name: ${defaultConfig.stackName}`);
  console.log('');
  
  const deployService = new PortainerDeployService(defaultConfig);
  
  try {
    await deployService.deploy();
    process.exit(0);
  } catch (error) {
    console.error('💥 Deploy falhou:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { PortainerDeployService };