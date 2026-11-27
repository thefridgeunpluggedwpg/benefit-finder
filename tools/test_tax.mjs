import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = { window: {}, console };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../js/config.js", import.meta.url), "utf8"), ctx);
vm.runInContext(fs.readFileSync(new URL("../js/match.js", import.meta.url), "utf8"), ctx);
vm.runInContext(fs.readFileSync(new URL("../js/tax.js", import.meta.url), "utf8"), ctx);

const { BF } = ctx;
let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log("PASS " + name);
}

test("1. Single MB T4 employee ($55k, $3k RRSP, $10.5k withheld) -> $2,516.24 refund", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 32, marital: "single",
    householdIncome: 55000, working: true, workingIncome: 55000,
    housing: "own", rrspDeduction: 3000, taxWithheld: 10500, children: []
  });
  assert.equal(res.taxYear, 2025);
  assert.equal(res.netIncome, 51485);
  assert.equal(res.federalTax, 4412.9);
  assert.equal(res.manitobaTax, 3570.86);
  assert.equal(res.totalTaxPayable, 7983.76);
  assert.equal(res.status, "refund");
  assert.equal(res.amountAbs, 2516.24);
});

test("2. Low-income MB renter ($24k working, $1.5k withheld) -> CWB + MB RATC -> $2,300.41 refund", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 28, marital: "single",
    householdIncome: 24000, working: true, workingIncome: 24000,
    housing: "rent", monthlyRent: 1100, taxWithheld: 1500, children: []
  });
  assert.equal(res.totalTaxPayable, 1407.59);
  assert.equal(res.totalRefundableCredits, 2208);
  assert.equal(res.status, "refund");
  assert.equal(res.amountAbs, 2300.41);
});

test("3. Permanent rule: alreadyReceiving excludes CWB and MB RATC from tax refund", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 28, marital: "single",
    householdIncome: 24000, working: true, workingIncome: 24000,
    housing: "rent", monthlyRent: 1100, taxWithheld: 1500, children: []
  }, { alreadyReceiving: { cwb: true, "ratc": true } });
  assert.equal(res.totalRefundableCredits, 0);
  assert.equal(res.refundableCredits.length, 0);
  assert.equal(res.status, "refund");
  assert.equal(res.amountAbs, 92.41);
});

test("4. Higher-income MB employee ($95k, $15k withheld) -> balance owing & CPP2 cap", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 45, marital: "single",
    householdIncome: 95000, working: true, workingIncome: 95000,
    housing: "own", taxWithheld: 15000, children: []
  });
  assert.equal(res.cppDeduction, 1074);
  assert.equal(res.netIncome, 93926);
  assert.equal(res.status, "owing");
  assert.ok(res.amountAbs > 4000);
});

test("5. Senior MB renter with DTC ($30k income) gets Age Amount, DTC, and RATC seniors top-up", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 68, marital: "single",
    householdIncome: 30000, working: false, workingIncome: 0,
    housing: "rent", monthlyRent: 950, disability: "has-dtc", taxWithheld: 0, children: []
  });
  assert.equal(res.federalTax, 0);
  // MB credits: 15780 BPA + 3390.35 Age + 6180 DTC = 25350.35; (30000 - 25350.35) * 10.8% = 502.16
  assert.equal(res.manitobaTax, 502.16);
  // MB RATC $575 + seniors top-up ($328 - 0.0075 * 30000 = $103) = $678
  assert.equal(res.totalRefundableCredits, 678);
  assert.equal(res.status, "refund");
  assert.equal(res.amountAbs, 175.84);
});

test("6. Married couple with low-income spouse uses spousal credit", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 40, marital: "married",
    householdIncome: 65000, working: true, workingIncome: 60000,
    spouseIncome: 5000, housing: "own", taxWithheld: 10000, children: []
  });
  const noSpouseRes = BF.estimateTaxRefund({
    province: "MB", age: 40, marital: "single",
    householdIncome: 60000, working: true, workingIncome: 60000,
    housing: "own", taxWithheld: 10000, children: []
  });
  assert.ok(res.federalCredits > noSpouseRes.federalCredits);
  assert.ok(res.manitobaCredits > noSpouseRes.manitobaCredits);
  assert.ok(res.totalTaxPayable < noSpouseRes.totalTaxPayable);
});


vm.runInContext(fs.readFileSync(new URL("../js/writeoffs.js", import.meta.url), "utf8"), ctx);

test("7. Detailed T4 $55k plus $10k capital gains uses 50% inclusion", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 32, marital: "single",
    householdIncome: 65000, working: true, workType: "employee",
    incomeEmployment: 55000, incomeCapitalGains: 10000,
    housing: "own", taxWithheld: 10500, children: []
  });
  assert.equal(res.breakdown.usedDetailed, true);
  assert.equal(res.breakdown.taxableCapitalGains, 5000);
  assert.equal(res.breakdown.employment, 55000);
  assert.equal(res.grossIncome, 60000);
  assert.equal(res.workIncome, 55000);
});

test("8. Eligible dividends $10k use 138% gross-up and official DTCs", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 40, marital: "single",
    householdIncome: 73800, working: true, workType: "employee",
    incomeEmployment: 60000, incomeDividendsEligible: 10000,
    housing: "own", taxWithheld: 10000, children: []
  });
  assert.equal(res.breakdown.divEligTaxable, 13800);
  assert.equal(res.grossIncome, 73800);
  assert.equal(res.fedDivCredit, 1246.15);
  assert.equal(res.mbDivCredit, 1104);
});

test("9. Carpenter $55k T4, $3k RRSP, $2,500 tools -> $1,000 deduction and $2,788.74 refund", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 32, marital: "single", profession: "carpenter",
    workType: "employee", householdIncome: 55000, working: true,
    incomeEmployment: 55000, rrspDeduction: 3000, taxWithheld: 10500,
    housing: "own", children: [], writeoffAmounts: { tradesTools: 2500 }
  });
  assert.equal(BF.tradesToolsDeduction(2500, 55000), 1000);
  assert.equal(res.deductions.tradesTools, 1000);
  assert.equal(res.netIncome, 50485);
  assert.equal(res.federalTax, 4267.9);
  assert.equal(res.manitobaTax, 3443.36);
  assert.equal(res.totalTaxPayable, 7711.26);
  assert.equal(res.status, "refund");
  assert.equal(res.amountAbs, 2788.74);
});

test("10. alreadyReceiving tradesTools drops the tools deduction", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 32, marital: "single", profession: "carpenter",
    workType: "employee", householdIncome: 55000, working: true,
    incomeEmployment: 55000, rrspDeduction: 3000, taxWithheld: 10500,
    housing: "own", children: [], writeoffAmounts: { tradesTools: 2500 }
  }, { alreadyReceiving: { tradesTools: true } });
  assert.equal(res.deductions.tradesTools, 0);
  assert.equal(res.amountAbs, 2516.24);
});

test("11. $500 donations use 14.5%/29% federal and 10.8%/17.4% Manitoba rates", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 32, marital: "single",
    householdIncome: 55000, working: true, workingIncome: 55000,
    housing: "own", rrspDeduction: 3000, taxWithheld: 10500, children: [],
    writeoffAmounts: { donations: 500 }
  });
  assert.equal(res.federalTax, 4296.9);
  assert.equal(res.manitobaTax, 3497.06);
  assert.equal(res.amountAbs, 2706.04);
});

test("12. $5,000 medical expenses use the 3% of net / $2,834 threshold", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 32, marital: "single",
    householdIncome: 55000, working: true, workingIncome: 55000,
    housing: "own", rrspDeduction: 3000, taxWithheld: 10500, children: [],
    writeoffAmounts: { medical: 5000 }
  });
  assert.equal(res.federalTax, 3911.86);
  assert.equal(res.manitobaTax, 3197.67);
  assert.equal(res.amountAbs, 3390.47);
});

test("13. Self-employment expenses reduce gross only when net is not entered", () => {
  const fromGross = BF.incomeBreakdown({
    incomeSelfEmployedGross: 80000, writeoffAmounts: { seExpenses: 20000 }
  });
  assert.equal(fromGross.seNet, 60000);
  assert.equal(fromGross.seExpensesAppliedToGross, true);
  const withNet = BF.incomeBreakdown({
    incomeSelfEmployedGross: 80000, incomeSelfEmployedNet: 60000,
    writeoffAmounts: { seExpenses: 20000 }
  });
  assert.equal(withNet.seNet, 60000);
  assert.equal(withNet.seExpensesAppliedToGross, false);
  const res = BF.estimateTaxRefund({
    province: "MB", age: 40, marital: "single", workType: "self-employed",
    householdIncome: 60000, incomeSelfEmployedGross: 80000, incomeSelfEmployedNet: 60000,
    housing: "own", taxWithheld: 0, children: [], writeoffAmounts: { seExpenses: 20000 }
  });
  assert.equal(res.grossIncome, 60000);
});

test("14. RRSP and FHSA caps, labour mobility cap, pension not working income", () => {
  const caps = BF.estimateTaxRefund({
    province: "MB", age: 32, marital: "single", profession: "carpenter",
    workType: "employee", householdIncome: 55000, working: true,
    incomeEmployment: 55000, rrspDeduction: 50000, taxWithheld: 0,
    housing: "own", children: [],
    writeoffAmounts: { fhsaDeduction: 10000, labourMobility: 5000 }
  });
  assert.equal(caps.rrspDeduction, 32490);
  assert.equal(caps.deductions.fhsa, 8000);
  assert.equal(caps.deductions.labourMobility, 4000);
  const pension = BF.incomeBreakdown({ incomePension: 20000, incomeInterest: 1000 });
  assert.equal(pension.taxableIncomeBeforeDeductions, 21000);
  assert.equal(pension.workingIncome, 0);
});

test("15. Write-off list is profession-tailored and omits the expired digital news credit", () => {
  const titles = (list) => list.map((w) => w.id);
  const carpenter = titles(BF.writeoffsFor({ profession: "carpenter", workType: "employee", working: true, province: "MB" }));
  assert.ok(carpenter.includes("tradesTools"));
  assert.ok(carpenter.includes("labourMobility"));
  assert.ok(!carpenter.includes("educatorSupplies"));
  const teacher = titles(BF.writeoffsFor({ profession: "teacher", workType: "employee", working: true, province: "MB" }));
  assert.ok(teacher.includes("educatorSupplies"));
  assert.ok(!teacher.includes("tradesTools"));
  const contractor = titles(BF.writeoffsFor({ profession: "contractor", workType: "self-employed", selfEmployed: true, province: "MB" }));
  assert.ok(contractor.includes("seExpenses"));
  assert.ok(!contractor.includes("tradesTools"));
  const catalog = titles(BF.WRITEOFFS);
  assert.ok(!catalog.includes("digitalNews"));
  assert.ok(!catalog.some((id) => /digital|news/.test(id)));
  const excluded = titles(BF.writeoffsFor(
    { profession: "carpenter", workType: "employee", working: true, province: "MB" },
    { tradesTools: true }
  ));
  assert.ok(!excluded.includes("tradesTools"));
});

test("16. Other-than-eligible dividends use the 115% gross-up and 15.0198% / 0.7835% credits", () => {
  const res = BF.estimateTaxRefund({
    province: "MB", age: 40, marital: "single",
    householdIncome: 20000, working: false,
    incomeDividendsOther: 10000, housing: "own", taxWithheld: 0, children: []
  });
  assert.equal(res.breakdown.divOtherTaxable, 11500);
  assert.equal(res.fedDivCredit, 1727.28);
  assert.equal(res.mbDivCredit, 90.1);
});

console.log(`\n${passed} passed, 0 failed, ${passed} total`);
