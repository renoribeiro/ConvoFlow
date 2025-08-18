import { NextApiRequest, NextApiResponse } from 'next';

// Configuração da Evolution API
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://localhost:8081';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'convoflow-evolution-api-key-2024';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { params } = req.query;
  
  // Construir o path da API
  const apiPath = Array.isArray(params) ? params.join('/') : params;
  const fullPath = `/instance/${apiPath}`;
  
  try {
    console.log(`🚀 [instance-proxy] Proxy para Evolution API - ${req.method} ${fullPath}`);
    console.log('📤 [instance-proxy] Payload:', req.method !== 'GET' ? JSON.stringify(req.body, null, 2) : 'N/A');

    // Configurar a requisição
    const requestOptions: RequestInit = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
    };

    // Adicionar body para métodos que não são GET
    if (req.method !== 'GET' && req.body) {
      requestOptions.body = JSON.stringify(req.body);
    }

    // Fazer a requisição para a Evolution API
    const response = await fetch(`${EVOLUTION_API_URL}${fullPath}`, requestOptions);

    let data;
    try {
      data = await response.json();
    } catch {
      // Se não conseguir fazer parse do JSON, retornar resposta vazia
      data = {};
    }
    
    console.log('📥 [instance-proxy] Resposta da Evolution API:', {
      status: response.status,
      path: fullPath,
      hasData: !!data
    });

    // Retornar a resposta da Evolution API
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error(`❌ [instance-proxy] Erro no proxy da Evolution API para ${fullPath}:`, error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      path: fullPath
    });
  }
}