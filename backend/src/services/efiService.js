import EfiPay from 'sdk-node-apis-efi';
import { efiBankService } from './efiBankService.js';

let sdkClient = null;
let sdkClientKey = null;

function getEnvironment() {
  return process.env.EFI_ENVIRONMENT === 'production' || process.env.EFI_SANDBOX === 'false'
    ? 'production'
    : 'sandbox';
}

function buildSdkOptions() {
  const certificate = process.env.EFI_CERT_BASE64 || process.env.EFI_CERT_PATH;

  return {
    sandbox: getEnvironment() !== 'production',
    client_id: process.env.EFI_CLIENT_ID,
    client_secret: process.env.EFI_CLIENT_SECRET,
    certificate,
    cert_base64: Boolean(process.env.EFI_CERT_BASE64)
  };
}

export function getEfiSdkClient() {
  const options = buildSdkOptions();
  const key = JSON.stringify({
    sandbox: options.sandbox,
    client_id: options.client_id,
    certificate: options.certificate,
    cert_base64: options.cert_base64
  });

  if (!sdkClient || sdkClientKey !== key) {
    sdkClient = new EfiPay(options);
    sdkClientKey = key;
  }

  return sdkClient;
}

export const efiService = {
  getSdkClient: getEfiSdkClient,
  criarPix: efiBankService.criarPix,
  criarBoleto: efiBankService.criarBoleto,
  criarCartao: efiBankService.criarCartao,
  consultarPagamento: efiBankService.consultarPagamento,
  onlyDigits: efiBankService.onlyDigits
};
