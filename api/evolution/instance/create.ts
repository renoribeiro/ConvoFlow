import { NextApiRequest, NextApiResponse } from 'next';

// Configuração da Evolution API
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://localhost:8081';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'convoflow-evolution-api-key-2024';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apenas métodos POST são permitidos
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚀 [create.ts] Proxy para Evolution API - Criando instância');
    console.log('📤 [create.ts] Payload recebido:', JSON.stringify(req.body, null, 2));

    // Fazer a requisição para a Evolution API
    const response = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    
    console.log('📥 [create.ts] Resposta da Evolution API:', {
      status: response.status,
      data: JSON.stringify(data, null, 2)
    });

    // Retornar a resposta da Evolution API
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('❌ [create.ts] Erro no proxy da Evolution API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}