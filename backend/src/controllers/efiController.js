import {
  criarBoletoEfi,
  criarCartaoEfi,
  criarPixEfi,
  statusPagamentoEfi,
  webhookEfi
} from './pagamentoController.js';

function logEfiPaymentEvent({ action, userId = null, plan = null, status = null, paymentId = null, outcome = null }) {
  console.info('[efi:payment]', {
    action,
    user_id: userId,
    plan,
    status,
    payment_id: paymentId,
    outcome
  });
}

function withEfiPaymentLog(action, handler) {
  return async (req, res) => {
    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      res.payload = payload;
      return originalJson(payload);
    };

    logEfiPaymentEvent({
      action,
      userId: req.user?.id || null,
      plan: req.body?.plano || null,
      outcome: 'started'
    });

    try {
      await handler(req, res);
      logEfiPaymentEvent({
        action,
        userId: req.user?.id || null,
        plan: req.body?.plano || null,
        status: res.statusCode,
        paymentId: res.payload?.payment_id || res.payload?.txid || res.payload?.charge_id || null,
        outcome: 'completed'
      });
    } catch (error) {
      logEfiPaymentEvent({
        action,
        userId: req.user?.id || null,
        plan: req.body?.plano || null,
        outcome: 'failed'
      });
      throw error;
    }
  };
}

export const criarPix = withEfiPaymentLog('create_pix', criarPixEfi);
export const criarBoleto = withEfiPaymentLog('create_boleto', criarBoletoEfi);
export const criarCartao = withEfiPaymentLog('create_card', criarCartaoEfi);
export const consultarStatus = statusPagamentoEfi;
export const receberWebhook = webhookEfi;
