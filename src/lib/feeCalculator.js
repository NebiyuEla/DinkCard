export const DEFAULT_GATEWAY_FEE_PERCENTAGE = 5.6;
export const DEFAULT_FIXED_CHARGE_ETB = 100;
export const DEFAULT_PERCENT_CHARGE = 5;

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

export function getEffectiveMinCardFunding(settings = {}) {
  const raw = safeNumber(settings.min_card_funding_usd, 3);
  if (raw <= 0) return 3;
  return Math.max(3, raw);
}

export function getEffectiveMinCardCreation(settings = {}) {
  const raw = safeNumber(settings.min_card_creation_usd, 3);
  if (raw <= 0) return 3;
  return Math.max(3, raw);
}

function roundUpTo(value, nearest) {
  const step = safeNumber(nearest, 0);
  if (step <= 0) return money(value);
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
  const serviceMarginPercentage = Math.max(0, safeNumber(settings?.service_margin_percentage, DEFAULT_PERCENT_CHARGE));
  const minimumServiceFeeEtb = Math.max(0, safeNumber(settings?.minimum_service_fee_etb, DEFAULT_FIXED_CHARGE_ETB));
  const maximumServiceFeeEtb = Math.max(0, safeNumber(settings?.maximum_service_fee_etb, 0));
  const totalAmountFeePercentage = Math.max(0, safeNumber(settings?.total_amount_fee_percentage, 0));
  const enableMinimumFee = Number(settings?.enable_minimum_fee ?? 1) ? true : false;
  const showGatewayFeePercent = Number(settings?.show_gateway_fee_percentage ?? 1) ? true : false;
  const roundingRuleEtb = Math.max(0, safeNumber(settings?.rounding_rule_etb, 0));
  const feeDisplayStyle = ['simple', 'detailed', 'hybrid'].includes(settings?.customer_fee_display_style)
    ? settings.customer_fee_display_style
    : 'simple';

  const etbAmount = money(usdAmount * rate);
  const platformPercentFeeEtb = money(etbAmount * serviceMarginPercentage / 100);
  const platformFeeWithMinimum = enableMinimumFee ? Math.max(platformPercentFeeEtb, minimumServiceFeeEtb) : platformPercentFeeEtb;
  const platformFeeEtb = money(maximumServiceFeeEtb > 0 ? Math.min(platformFeeWithMinimum, maximumServiceFeeEtb) : platformFeeWithMinimum);
  const gatewayFeeBaseEtb = money(etbAmount + platformFeeEtb);
  const gatewayFeeEtb = money(gatewayFeeBaseEtb * gatewayFeePercentage / 100);
  const subtotalBeforeTotalFeeEtb = money(etbAmount + platformFeeEtb + gatewayFeeEtb);
  const totalAmountFeeEtb = money(subtotalBeforeTotalFeeEtb * totalAmountFeePercentage / 100);
  const feesAndChargesEtb = money(platformFeeEtb + gatewayFeeEtb + totalAmountFeeEtb);
  const grossTotalBeforeRoundEtb = money(subtotalBeforeTotalFeeEtb + totalAmountFeeEtb);
  const totalPayableEtb = roundUpTo(grossTotalBeforeRoundEtb, roundingRuleEtb);
  const roundingAdjustmentEtb = money(Math.max(0, totalPayableEtb - grossTotalBeforeRoundEtb));
  const serviceAndProcessingFeeEtb = money(feesAndChargesEtb + roundingAdjustmentEtb);
  const effectivePayableRate = usdAmount > 0 ? money(totalPayableEtb / usdAmount) : 0;
  const providerCostUsd = 0;
  const providerCostEtb = 0;

  return {
    usdAmount,
    cardAmountUsd: money(usdAmount),
    cardAmountEtb: etbAmount,
    exchangeRate: rate,
    etbAmount,
    conversionAmountEtb: etbAmount,
    platformFeeEtb,
    platformFeePercentage: serviceMarginPercentage,
    serviceFeeEtb: platformFeeEtb,
    serviceAndProcessingFeeEtb,
    feesAndChargesEtb: serviceAndProcessingFeeEtb,
    gatewayFeeEtb,
    gatewayFeePercentage,
    totalAmountFeeEtb,
    totalAmountFeePercentage,
    subtotalBeforeTotalFeeEtb,
    showGatewayFeePercent,
    totalPayableEtb,
    effectivePayableRate,
    finalUsdCredit: money(usdAmount),
    providerCostUsd,
    providerCostEtb,
    topupFeeUsd: 0,
    topupFeeEtb: providerCostEtb,
    safetyBufferEtb: 0,
    dinkServiceFeeEtb: platformFeeEtb,
    settlementFeeEtb: 0,
    requiredBeforeChapaEtb: gatewayFeeBaseEtb,
    grossTotalBeforeRoundEtb,
    roundingAdjustmentEtb,
    roundingRuleEtb,
    minimumFeeAmountEtb: minimumServiceFeeEtb,
    maximumFeeAmountEtb: maximumServiceFeeEtb,
    enableMinimumFee,
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
  gateway_fee_percentage: 5.6,
  deposit_fee_percentage: 0,
  deposit_fixed_fee_etb: 0,
  service_margin_percentage: 5,
  minimum_service_fee_etb: 100,
  maximum_service_fee_etb: 0,
  enable_minimum_fee: 1,
  show_gateway_fee_percentage: 1,
  total_amount_fee_percentage: 0,
  safety_buffer_percentage: 0,
  chapa_settlement_fee_etb: 0,
  card_creation_fee_usd: 1,
  bitnob_topup_fee_under_100_usd: 1,
  bitnob_topup_fee_percent_100_plus: 1,
  card_funding_fee_percentage: 0,
  card_withdrawal_fee_percentage: 1,
  rounding_rule_etb: 0,
  customer_fee_display_style: 'simple',
  min_deposit_usd: 5,
  max_deposit_usd: 1000,
  daily_deposit_limit_usd: 2000,
  monthly_deposit_limit_usd: 10000,
  min_card_creation_usd: 3,
  min_card_funding_usd: 3,
  max_card_funding_usd: 500,
  max_cards_per_user: 3,
  kyc_level1_deposit_limit: 0,
  kyc_level2_deposit_limit: 0
};
