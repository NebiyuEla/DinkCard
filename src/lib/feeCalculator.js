export const DEFAULT_GATEWAY_FEE_PERCENTAGE = 2.5;

export function getGatewayFeePercentage(settings = {}) {
  const value = Number(settings.gateway_fee_percentage ?? DEFAULT_GATEWAY_FEE_PERCENTAGE);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_GATEWAY_FEE_PERCENTAGE;
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function safeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundUpTo(value, nearest) {
  const step = Math.max(1, safeNumber(nearest, 50));
  return money(Math.ceil(Number(value || 0) / step) * step);
}

export function calculateTopupProviderFeeUsd(usdAmount, settings = {}) {
  const usd = safeNumber(usdAmount, 0);
  const fixedUnder100 = Math.max(0, safeNumber(settings.bitnob_topup_fee_under_100_usd, 1));
  const percent100Plus = Math.max(0, safeNumber(settings.bitnob_topup_fee_percent_100_plus, 1));
  if (usd <= 0) return 0;
  return money(usd < 100 ? fixedUnder100 : (usd * percent100Plus) / 100);
}

export function calculateDepositFees(usdAmount, exchangeRate, settings = {}) {
  const gatewayFeePercentage = getGatewayFeePercentage(settings);
  const rate = Math.max(0, safeNumber(exchangeRate || settings?.usd_to_etb_rate, 190));
  const serviceMarginPercentage = Math.max(0, safeNumber(settings?.service_margin_percentage, 8));
  const minimumServiceFeeEtb = Math.max(0, safeNumber(settings?.minimum_service_fee_etb, 100));
  const safetyBufferPercentage = Math.max(0, safeNumber(settings?.safety_buffer_percentage, 3));
  const settlementFeeEtb = Math.max(0, safeNumber(settings?.chapa_settlement_fee_etb, 0));
  const roundingRuleEtb = Math.max(1, safeNumber(settings?.rounding_rule_etb, 50));
  const feeDisplayStyle = ['simple', 'detailed', 'hybrid'].includes(settings?.customer_fee_display_style)
    ? settings.customer_fee_display_style
    : 'hybrid';
  const etbAmount = money(usdAmount * rate);
  const topupFeeUsd = calculateTopupProviderFeeUsd(usdAmount, settings);
  const providerCostUsd = topupFeeUsd;
  const providerCostEtb = money(providerCostUsd * rate);
  const baseCostEtb = money(etbAmount + providerCostEtb);
  const safetyBufferEtb = money(baseCostEtb * safetyBufferPercentage / 100);
  const dinkServiceFeeEtb = money(Math.max(baseCostEtb * serviceMarginPercentage / 100, minimumServiceFeeEtb));
  const requiredBeforeChapaEtb = money(baseCostEtb + safetyBufferEtb + dinkServiceFeeEtb + settlementFeeEtb);
  const grossDivisor = Math.max(0.01, 1 - gatewayFeePercentage / 100);
  const grossTotalBeforeRoundEtb = money(requiredBeforeChapaEtb / grossDivisor);
  const totalPayableEtb = roundUpTo(grossTotalBeforeRoundEtb, roundingRuleEtb);
  const gatewayFeeEtb = money(Math.max(0, totalPayableEtb - requiredBeforeChapaEtb));
  const serviceAndProcessingFeeEtb = money(Math.max(0, totalPayableEtb - etbAmount));

  return {
    usdAmount,
    cardAmountUsd: money(usdAmount),
    cardAmountEtb: etbAmount,
    exchangeRate: rate,
    etbAmount,
    serviceFeeEtb: serviceAndProcessingFeeEtb,
    serviceAndProcessingFeeEtb,
    gatewayFeeEtb,
    gatewayFeePercentage,
    totalPayableEtb,
    finalUsdCredit: money(usdAmount),
    providerCostUsd,
    providerCostEtb,
    topupFeeUsd,
    topupFeeEtb: providerCostEtb,
    safetyBufferEtb,
    dinkServiceFeeEtb,
    settlementFeeEtb,
    requiredBeforeChapaEtb,
    grossTotalBeforeRoundEtb,
    roundingAdjustmentEtb: money(Math.max(0, totalPayableEtb - grossTotalBeforeRoundEtb)),
    roundingRuleEtb,
    feeDisplayStyle
  };
}

export function calculateCardCreationFees(fundingAmount, settings = {}) {
  const bitnobFee = safeNumber(settings.card_creation_fee_usd, 1);
  const totalDeduction = bitnobFee + fundingAmount;

  return {
    fundingAmount,
    creationFee: bitnobFee,
    bitnobFee,
    fundingFee: 0,
    totalDeduction: money(totalDeduction)
  };
}

export function calculateCardFundingFees(amount, settings = {}) {
  const fundingFee = calculateTopupProviderFeeUsd(amount, settings);
  return {
    amount,
    fundingFee,
    totalDeduction: money(Number(amount || 0) + fundingFee)
  };
}

export const DEFAULT_SETTINGS = {
  usd_to_etb_rate: 190,
  gateway_fee_percentage: 2.5,
  deposit_fee_percentage: 0,
  deposit_fixed_fee_etb: 0,
  service_margin_percentage: 8,
  minimum_service_fee_etb: 100,
  safety_buffer_percentage: 3,
  chapa_settlement_fee_etb: 0,
  card_creation_fee_usd: 1,
  bitnob_topup_fee_under_100_usd: 1,
  bitnob_topup_fee_percent_100_plus: 1,
  card_funding_fee_percentage: 0,
  card_withdrawal_fee_percentage: 1,
  rounding_rule_etb: 50,
  customer_fee_display_style: 'hybrid',
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
