import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/integrations/supabase/client';
import stripeMcpService from '@/services/stripeMcpService';

// Configuração para desabilitar o parser do body para webhooks
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
  created: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const signature = req.headers['stripe-signature'] as string;
    const body = JSON.stringify(req.body);

    // Verificar se o webhook é válido (se temos webhook secret configurado)
    const { data: config } = await supabase
      .from('stripe_config')
      .select('webhook_secret')
      .single();

    if (config?.webhook_secret && signature) {
      // Aqui você pode adicionar validação do webhook usando o secret
      // Por enquanto, vamos apenas logar que recebemos o webhook
      console.log('Webhook recebido com assinatura:', signature);
    }

    const event: StripeWebhookEvent = req.body;

    console.log('Processando evento Stripe:', event.type, event.id);

    // Processar diferentes tipos de eventos
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event);
        break;
      
      case 'customer.created':
        await handleCustomerCreated(event);
        break;
      
      case 'customer.updated':
        await handleCustomerUpdated(event);
        break;
      
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event);
        break;
      
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;
      
      default:
        console.log('Evento não processado:', event.type);
    }

    // Atualizar o registro da transação com o evento do webhook
    if (event.data.object.id) {
      await updateTransactionWithWebhookEvent(event.data.object.id, event);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Erro ao processar webhook do Stripe:', error);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
}

async function handlePaymentIntentSucceeded(event: StripeWebhookEvent) {
  const paymentIntent = event.data.object;
  
  try {
    // Atualizar status da transação para succeeded
    const { error } = await supabase
      .from('stripe_transactions')
      .update({
        status: 'succeeded',
        processed_at: new Date().toISOString(),
        stripe_fee: paymentIntent.charges?.data[0]?.balance_transaction?.fee || null,
        net_amount: paymentIntent.charges?.data[0]?.balance_transaction?.net || null,
        payment_method: paymentIntent.charges?.data[0]?.payment_method_details?.type || null
      })
      .eq('stripe_payment_intent_id', paymentIntent.id);

    if (error) {
      console.error('Erro ao atualizar transação:', error);
      return;
    }

    // Buscar a transação para obter o commission_payment_id
    const { data: transaction } = await supabase
      .from('stripe_transactions')
      .select('commission_payment_id, affiliate_id')
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .single();

    if (transaction?.commission_payment_id) {
      // Atualizar o status do pagamento de comissão
      await supabase
        .from('commission_payments')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_method: 'stripe',
          transaction_id: paymentIntent.id
        })
        .eq('id', transaction.commission_payment_id);

      console.log('Pagamento de comissão atualizado para pago:', transaction.commission_payment_id);
    }

    console.log('Payment Intent succeeded processado:', paymentIntent.id);
  } catch (error) {
    console.error('Erro ao processar payment_intent.succeeded:', error);
  }
}

async function handlePaymentIntentFailed(event: StripeWebhookEvent) {
  const paymentIntent = event.data.object;
  
  try {
    // Atualizar status da transação para failed
    const { error } = await supabase
      .from('stripe_transactions')
      .update({
        status: 'failed',
        failure_reason: paymentIntent.last_payment_error?.message || 'Payment failed'
      })
      .eq('stripe_payment_intent_id', paymentIntent.id);

    if (error) {
      console.error('Erro ao atualizar transação falhada:', error);
      return;
    }

    // Buscar a transação para obter o commission_payment_id
    const { data: transaction } = await supabase
      .from('stripe_transactions')
      .select('commission_payment_id')
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .single();

    if (transaction?.commission_payment_id) {
      // Atualizar o status do pagamento de comissão para failed
      await supabase
        .from('commission_payments')
        .update({
          status: 'failed',
          notes: `Falha no pagamento Stripe: ${paymentIntent.last_payment_error?.message || 'Payment failed'}`
        })
        .eq('id', transaction.commission_payment_id);

      console.log('Pagamento de comissão marcado como falhado:', transaction.commission_payment_id);
    }

    console.log('Payment Intent failed processado:', paymentIntent.id);
  } catch (error) {
    console.error('Erro ao processar payment_intent.payment_failed:', error);
  }
}

async function handleCustomerCreated(event: StripeWebhookEvent) {
  const customer = event.data.object;
  console.log('Cliente criado no Stripe:', customer.id, customer.email);
  
  // Aqui você pode associar o cliente do Stripe com um afiliado
  // se necessário, baseado no email ou outros metadados
}

async function handleCustomerUpdated(event: StripeWebhookEvent) {
  const customer = event.data.object;
  console.log('Cliente atualizado no Stripe:', customer.id, customer.email);
}

async function handleInvoicePaymentSucceeded(event: StripeWebhookEvent) {
  const invoice = event.data.object;
  console.log('Pagamento de fatura bem-sucedido:', invoice.id);
  
  // Processar pagamentos de faturas se necessário
}

async function handleInvoicePaymentFailed(event: StripeWebhookEvent) {
  const invoice = event.data.object;
  console.log('Pagamento de fatura falhado:', invoice.id);
  
  // Processar falhas de pagamento de faturas se necessário
}

async function updateTransactionWithWebhookEvent(
  paymentIntentId: string,
  event: StripeWebhookEvent
) {
  try {
    // Buscar a transação atual
    const { data: transaction } = await supabase
      .from('stripe_transactions')
      .select('webhook_events')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single();

    if (transaction) {
      const currentEvents = transaction.webhook_events || [];
      const newEvent = {
        id: event.id,
        type: event.type,
        created: event.created,
        processed_at: new Date().toISOString()
      };

      // Adicionar o novo evento ao histórico
      const updatedEvents = [...currentEvents, newEvent];

      await supabase
        .from('stripe_transactions')
        .update({ webhook_events: updatedEvents })
        .eq('stripe_payment_intent_id', paymentIntentId);

      console.log('Evento de webhook adicionado ao histórico da transação:', paymentIntentId);
    }
  } catch (error) {
    console.error('Erro ao atualizar eventos de webhook:', error);
  }
}