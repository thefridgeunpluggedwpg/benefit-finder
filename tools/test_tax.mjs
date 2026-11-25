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

console.log(`\n${passed} passed, 0 failed, ${passed} total`);
