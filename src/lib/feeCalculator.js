export const DEFAULT_GATEWAY_FEE_PERCENTAGE = 2.5;

export function getGatewayFeePercentage(settings = {}) {
  const value = Number(settings.gateway_fee_percentage ?? DEFAULT_GATEWAY_FEE_PERCENTAGE);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_GATEWAY_FEE_PERCENTAGE;
}

export function calculateDepositFees(usdAmount, exchangeRate, settings) {
  const gatewayFeePercentage = getGatewayFeePercentage(settings);
  const etbAmount = usdAmount * exchangeRate;
  const serviceFeeEtb = 0;
  const gatewayFeeEtb = (etbAmount * gatewayFeePercentage) / 100;
  const totalPayableEtb = etbAmount + gatewayFeeEtb;

  return {
    usdAmount,
    exchangeRate,
    etbAmount: Math.round(etbAmount * 100) / 100,
    serviceFeeEtb: Math.round(serviceFeeEtb * 100) / 100,
    gatewayFeeEtb: Math.round(gatewayFeeEtb * 100) / 100,
    gatewayFeePercentage,
    totalPayableEtb: Math.round(totalPayableEtb * 100) / 100,
    finalUsdCredit: usdAmount
  };
}

export function calculateCardCreationFees(fundingAmount, settings) {
  const bitnobFee = settings.card_creation_fee_usd || 3;
  const totalDeduction = bitnobFee + fundingAmount;

  return {
    fundingAmount,
    creationFee: bitnobFee,
    bitnobFee,
    fundingFee: 0,
    totalDeduction: Math.round(totalDeduction * 100) / 100
  };
}

export function calculateCardFundingFees(amount) {
  return {
    amount,
    fundingFee: 0,
    totalDeduction: Math.round(amount * 100) / 100
  };
}

export const DEFAULT_SETTINGS = {
  usd_to_etb_rate: 135,
  gateway_fee_percentage: 2.5,
  deposit_fee_percentage: 0,
  deposit_fixed_fee_etb: 0,
  card_creation_fee_usd: 7,
  card_funding_fee_percentage: 0,
  card_withdrawal_fee_percentage: 1,
  min_deposit_usd: 5,
  max_deposit_usd: 1000,
  daily_deposit_limit_usd: 2000,
  monthly_deposit_limit_usd: 10000,
  min_card_funding_usd: 1,
  max_card_funding_usd: 500,
  max_cards_per_user: 3,
  kyc_level1_deposit_limit: 100,
  kyc_level2_deposit_limit: 1000
};
