export interface CalculationScheduleRow {
  month: number;
  principal: number;
  interest: number;
  payment: number;
  remaining: number;
}

export interface StoredCalculationLike {
  loanAmount: string | number;
  interestRate: string | number;
  termMonths: number;
  repaymentType: string;
  gracePeriodMonths?: number | null;
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value);
  return 0;
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

export function buildPaymentSchedule(calculation: StoredCalculationLike): CalculationScheduleRow[] {
  const principal = toNumber(calculation.loanAmount);
  const annualRate = toNumber(calculation.interestRate);
  const term = Number(calculation.termMonths || 0);
  const grace = Math.max(0, Number(calculation.gracePeriodMonths || 0));

  if (principal <= 0 || annualRate < 0 || term <= 0) {
    return [];
  }

  const monthlyRate = annualRate / 100 / 12;
  const paymentTerm = Math.max(1, term - grace);
  const schedule: CalculationScheduleRow[] = [];

  if (calculation.repaymentType === "differentiated") {
    const principalPayment = principal / paymentTerm;
    let remaining = principal;

    for (let month = 1; month <= term; month += 1) {
      if (month <= grace) {
        const interest = remaining * monthlyRate;
        schedule.push({
          month,
          principal: 0,
          interest: roundCurrency(interest),
          payment: roundCurrency(interest),
          remaining: roundCurrency(remaining),
        });
        continue;
      }

      const interest = remaining * monthlyRate;
      const payment = principalPayment + interest;
      remaining = Math.max(0, remaining - principalPayment);
      schedule.push({
        month,
        principal: roundCurrency(principalPayment),
        interest: roundCurrency(interest),
        payment: roundCurrency(payment),
        remaining: roundCurrency(remaining),
      });
    }

    return schedule;
  }

  let remaining = principal;

  if (grace > 0) {
    for (let month = 1; month <= grace; month += 1) {
      const interest = remaining * monthlyRate;
      schedule.push({
        month,
        principal: 0,
        interest: roundCurrency(interest),
        payment: roundCurrency(interest),
        remaining: roundCurrency(remaining),
      });
    }
  }

  const annuityCoefficient =
    monthlyRate === 0
      ? 1 / paymentTerm
      : (monthlyRate * Math.pow(1 + monthlyRate, paymentTerm)) /
        (Math.pow(1 + monthlyRate, paymentTerm) - 1);
  const monthlyPayment = principal * annuityCoefficient;

  for (let month = grace + 1; month <= term; month += 1) {
    const interest = remaining * monthlyRate;
    const principalPart = monthlyPayment - interest;
    remaining = Math.max(0, remaining - principalPart);
    schedule.push({
      month,
      principal: roundCurrency(principalPart),
      interest: roundCurrency(interest),
      payment: roundCurrency(monthlyPayment),
      remaining: roundCurrency(remaining),
    });
  }

  return schedule;
}
