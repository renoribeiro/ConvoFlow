import { NextApiRequest, NextApiResponse } from 'next';

// Configuração da Evolution API
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://localhost:8081';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'convoflow-evolution-api-key-2024';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apenas métodos GET são permitidos
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚀 [fetchInstances.ts] Proxy para Evolution API - Buscando instâncias');

    // Fazer a requisição para a Evolution API
    const response = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
    });

    const data = await response.json();
    
    console.log('📥 [fetchInstances.ts] Resposta da Evolution API:', {
      status: response.status,
      instanceCount: Array.isArray(data) ? data.length : 'N/A'
    });

    // Retornar a resposta da Evolution API
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('❌ [fetchInstances.ts] Erro no proxy da Evolution API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}