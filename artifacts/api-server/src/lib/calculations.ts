import { roundMoney } from "./money";

interface CalculationScheduleRow {
  month: number;
  principal: number;
  interest: number;
  /** Monthly commission charged on the outstanding balance (added 2026-05-09). */
  fee: number;
  /** Monthly insurance premium charged on the original principal (added 2026-05-09). */
  insurance: number;
  /** Total payment for the month: principal + interest + fee + insurance. */
  payment: number;
  remaining: number;
}

interface StoredCalculationLike {
  loanAmount: string | number;
  interestRate: string | number;
  termMonths: number;
  repaymentType: string;
  initialPayment?: string | number | null;
  gracePeriodMonths?: number | null;
  productName?: string;
  currency?: string;
  /** Single one-off fee charged at disbursement (UZS, absolute value). Optional. */
  feeOnceAmount?: string | number | null;
  /** Monthly commission rate (% of remaining balance). Optional. */
  feeMonthlyPct?: string | number | null;
  /** Monthly insurance premium rate (% of original principal). Optional. */
  insuranceMonthlyPct?: string | number | null;
}

interface CalculationSummaryLike {
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  /** Sum of all fees + insurance the borrower pays. */
  totalFees: number;
  /** Approximate effective annual rate including fees and insurance. */
  effectiveAnnualPct: number;
  principal: number;
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value);
  return 0;
}

function nonNegative(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function buildPaymentSchedule(calculation: StoredCalculationLike): CalculationScheduleRow[] {
  const principal = toNumber(calculation.loanAmount);
  const annualRate = toNumber(calculation.interestRate);
  const term = Number(calculation.termMonths || 0);
  const grace = Math.max(0, Number(calculation.gracePeriodMonths || 0));
  const feeMonthlyPct = nonNegative(toNumber(calculation.feeMonthlyPct));
  const insuranceMonthlyPct = nonNegative(toNumber(calculation.insuranceMonthlyPct));

  if (principal <= 0 || annualRate < 0 || term <= 0) {
    return [];
  }

  const monthlyRate = annualRate / 100 / 12;
  const monthlyFeeRate = feeMonthlyPct / 100;
  const monthlyInsuranceAmount = principal * (insuranceMonthlyPct / 100);
  const paymentTerm = Math.max(1, term - grace);
  const schedule: CalculationScheduleRow[] = [];

  if (calculation.repaymentType === "differentiated") {
    const principalPayment = principal / paymentTerm;
    let remaining = principal;

    for (let month = 1; month <= term; month += 1) {
      const interest = remaining * monthlyRate;
      const fee = remaining * monthlyFeeRate;
      const insurance = monthlyInsuranceAmount;
      if (month <= grace) {
        schedule.push({
          month,
          principal: 0,
          interest: roundMoney(interest),
          fee: roundMoney(fee),
          insurance: roundMoney(insurance),
          payment: roundMoney(interest + fee + insurance),
          remaining: roundMoney(remaining),
        });
        continue;
      }

      const payment = principalPayment + interest + fee + insurance;
      remaining = Math.max(0, remaining - principalPayment);
      schedule.push({
        month,
        principal: roundMoney(principalPayment),
        interest: roundMoney(interest),
        fee: roundMoney(fee),
        insurance: roundMoney(insurance),
        payment: roundMoney(payment),
        remaining: roundMoney(remaining),
      });
    }

    return schedule;
  }

  let remaining = principal;

  if (grace > 0) {
    for (let month = 1; month <= grace; month += 1) {
      const interest = remaining * monthlyRate;
      const fee = remaining * monthlyFeeRate;
      const insurance = monthlyInsuranceAmount;
      schedule.push({
        month,
        principal: 0,
        interest: roundMoney(interest),
        fee: roundMoney(fee),
        insurance: roundMoney(insurance),
        payment: roundMoney(interest + fee + insurance),
        remaining: roundMoney(remaining),
      });
    }
  }

  const annuityCoefficient =
    monthlyRate === 0
      ? 1 / paymentTerm
      : (monthlyRate * Math.pow(1 + monthlyRate, paymentTerm)) /
        (Math.pow(1 + monthlyRate, paymentTerm) - 1);
  const monthlyPaymentBase = principal * annuityCoefficient;

  for (let month = grace + 1; month <= term; month += 1) {
    const interest = remaining * monthlyRate;
    const principalPart = monthlyPaymentBase - interest;
    const fee = remaining * monthlyFeeRate;
    const insurance = monthlyInsuranceAmount;
    remaining = Math.max(0, remaining - principalPart);
    schedule.push({
      month,
      principal: roundMoney(principalPart),
      interest: roundMoney(interest),
      fee: roundMoney(fee),
      insurance: roundMoney(insurance),
      payment: roundMoney(monthlyPaymentBase + fee + insurance),
      remaining: roundMoney(remaining),
    });
  }

  return schedule;
}

export function buildCalculationSummary(
  calculation: StoredCalculationLike,
): CalculationSummaryLike | null {
  const principal = toNumber(calculation.loanAmount);
  const annualRate = toNumber(calculation.interestRate);
  const term = Number(calculation.termMonths || 0);

  if (principal <= 0 || annualRate < 0 || term <= 0) {
    return null;
  }

  const feeOnceAmount = nonNegative(toNumber(calculation.feeOnceAmount));
  const schedule = buildPaymentSchedule(calculation);
  if (schedule.length === 0) return null;

  let totalPayment = feeOnceAmount;
  let totalInterest = 0;
  let totalFees = feeOnceAmount;

  for (const row of schedule) {
    totalPayment += row.payment;
    totalInterest += row.interest;
    totalFees += row.fee + row.insurance;
  }

  // Use the first non-grace month as the canonical "monthly payment" for display.
  const grace = Math.max(0, Number(calculation.gracePeriodMonths || 0));
  const referenceRow = schedule[grace] ?? schedule[0];
  const monthlyPayment = referenceRow?.payment ?? 0;

  // Approximate APR including fees + insurance + one-off fee.
  // Formula: ((totalPayment / principal) - 1) / years * 100.
  // This is an indicative figure for the leave-behind PDF; not a regulator-
  // grade ПСК. Replace with IRR once we lock down fee/insurance schedules.
  const years = term / 12;
  const effectiveAnnualPct =
    years > 0 && principal > 0
      ? roundMoney(((totalPayment / principal) - 1) / years * 100)
      : 0;

  return {
    monthlyPayment: roundMoney(monthlyPayment),
    totalPayment: roundMoney(totalPayment),
    totalInterest: roundMoney(totalInterest),
    totalFees: roundMoney(totalFees),
    effectiveAnnualPct,
    principal: roundMoney(principal),
  };
}
