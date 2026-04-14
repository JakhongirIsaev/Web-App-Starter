import { describe, it, expect } from "vitest";
import { buildPaymentSchedule, buildCalculationSummary } from "../lib/calculations";

describe("buildCalculationSummary", () => {
  it("computes annuity payment correctly", () => {
    const result = buildCalculationSummary({
      loanAmount: 10000000,
      interestRate: 18,
      termMonths: 12,
      repaymentType: "annuity",
    });
    expect(result).not.toBeNull();
    expect(result!.monthlyPayment).toBeGreaterThan(0);
    expect(result!.totalPayment).toBeGreaterThan(10000000);
    expect(result!.totalInterest).toBeGreaterThan(0);
    expect(result!.principal).toBe(10000000);
  });

  it("computes differentiated payment correctly", () => {
    const result = buildCalculationSummary({
      loanAmount: 12000000,
      interestRate: 20,
      termMonths: 12,
      repaymentType: "differentiated",
    });
    expect(result).not.toBeNull();
    expect(result!.monthlyPayment).toBeGreaterThan(0);
    expect(result!.totalPayment).toBeGreaterThan(12000000);
    expect(result!.principal).toBe(12000000);
  });

  it("handles zero rate", () => {
    const result = buildCalculationSummary({
      loanAmount: 10000000,
      interestRate: 0,
      termMonths: 10,
      repaymentType: "annuity",
    });
    expect(result).not.toBeNull();
    expect(result!.monthlyPayment).toBe(1000000);
    expect(result!.totalInterest).toBe(0);
  });

  it("handles grace period without division by zero", () => {
    const result = buildCalculationSummary({
      loanAmount: 5000000,
      interestRate: 15,
      termMonths: 11,
      repaymentType: "annuity",
      gracePeriodMonths: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.monthlyPayment).toBeGreaterThan(0);
    expect(isFinite(result!.monthlyPayment)).toBe(true);
    expect(isFinite(result!.totalPayment)).toBe(true);
  });

  it("clamps grace to term - 1 via paymentTerm = max(1, ...)", () => {
    const result = buildCalculationSummary({
      loanAmount: 5000000,
      interestRate: 15,
      termMonths: 1,
      repaymentType: "annuity",
      gracePeriodMonths: 1,
    });
    expect(result).not.toBeNull();
    expect(isFinite(result!.monthlyPayment)).toBe(true);
    expect(isFinite(result!.totalPayment)).toBe(true);
  });

  it("returns null for zero principal", () => {
    expect(
      buildCalculationSummary({
        loanAmount: 0,
        interestRate: 15,
        termMonths: 12,
        repaymentType: "annuity",
      }),
    ).toBeNull();
  });

  it("returns null for zero term", () => {
    expect(
      buildCalculationSummary({
        loanAmount: 10000000,
        interestRate: 15,
        termMonths: 0,
        repaymentType: "annuity",
      }),
    ).toBeNull();
  });

  it("does NOT double-subtract initialPayment (route does that)", () => {
    const result = buildCalculationSummary({
      loanAmount: "8000000",
      interestRate: "18",
      termMonths: 12,
      repaymentType: "annuity",
      initialPayment: "2000000",
    });
    expect(result).not.toBeNull();
    expect(result!.principal).toBe(8000000);
  });
});

describe("buildPaymentSchedule", () => {
  it("produces correct number of rows", () => {
    const schedule = buildPaymentSchedule({
      loanAmount: 10000000,
      interestRate: 18,
      termMonths: 12,
      repaymentType: "annuity",
    });
    expect(schedule).toHaveLength(12);
    expect(schedule[0].month).toBe(1);
    expect(schedule[11].month).toBe(12);
  });

  it("grace months have zero principal", () => {
    const schedule = buildPaymentSchedule({
      loanAmount: 10000000,
      interestRate: 18,
      termMonths: 12,
      repaymentType: "annuity",
      gracePeriodMonths: 3,
    });
    expect(schedule).toHaveLength(12);
    for (let i = 0; i < 3; i++) {
      expect(schedule[i].principal).toBe(0);
      expect(schedule[i].interest).toBeGreaterThan(0);
    }
    expect(schedule[3].principal).toBeGreaterThan(0);
  });

  it("returns empty for invalid inputs", () => {
    expect(
      buildPaymentSchedule({
        loanAmount: 0,
        interestRate: 15,
        termMonths: 12,
        repaymentType: "annuity",
      }),
    ).toHaveLength(0);
  });

  it("differentiated schedule has decreasing payments", () => {
    const schedule = buildPaymentSchedule({
      loanAmount: 12000000,
      interestRate: 20,
      termMonths: 12,
      repaymentType: "differentiated",
    });
    expect(schedule).toHaveLength(12);
    expect(schedule[0].payment).toBeGreaterThan(schedule[11].payment);
  });
});
