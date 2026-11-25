/* 2025 Canadian Federal & Manitoba Personal Income Tax Refund Estimator.
   Only verified 2025 official figures are used. Sources:
   - Federal 2025 brackets & 14.5% lowest rate:
     https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html
   - Federal 2025 Basic Personal Amount ($16,129 -> $14,538):
     https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-30000-basic-personal-amount.html
   - Federal 2025 Age Amount ($9,028, phase-out $45,522 to $105,709):
     https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-30100-amount.html
   - Federal 2025 Spouse/Partner Amount (Line 30300) & Eligible Dependant (Line 30400):
     https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-30300-spouse-common-law-partner-amount.html
   - Federal 2025 Canada Employment Amount ($1,471, Line 31260):
     https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-31260-canada-employment-amount.html
   - Federal 2025 Disability Amount self ($10,138, Line 31600):
     https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-31600-disability-amount-self.html
   - Federal 2025 CPP/CPP2 (YMPE $71,300, YAMPE $81,200, exemption $3,500, 4.95% base + 1.0% enhanced + 4% CPP2):
     https://www.canada.ca/content/dam/cra-arc/migration/cra-arc/tx/bsnss/tpcs/pyrll/t4032/2025/t4032-oc-7-25e.pdf
   - Federal 2025 EI (max insurable $65,700, 1.64% outside QC, max $1,077.48):
     https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html
   - Federal 2025 CWB (Line 45300 / Schedule 6: $1,633 single, $2,813 family; disability supp $843):
     https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-45300-canada-workers-benefit-cwb/how-much-you-can-get.html
   - Manitoba 2025 brackets (10.8% / 12.75% / 17.4% at $47,000 and $100,000):
     https://www.gov.mb.ca/finance/personal/ptaxes.html
   - Manitoba 2025 non-refundable credits & Renters/Homeowners Affordability Tax Credits ($575 + $328 seniors; $1,500 HATC):
     https://www.gov.mb.ca/finance/personal/pcredits.html
     https://www.gov.mb.ca/finance/tao/hatc.html
*/
(function (root) {
  "use strict";
  root.BF = root.BF || {};

  function r2(n) {
    var v = Number(n) || 0;
    return Math.round(v * 100 + (v >= 0 ? 1e-9 : -1e-9)) / 100;
  }

  function num(v) {
    var x = Number(v);
    return isFinite(x) && x > 0 ? x : 0;
  }

  function hasVal(v) {
    return v !== "" && v != null && isFinite(Number(v));
  }

  function calcProgressive(taxable, brackets) {
    var tax = 0;
    var marginal = brackets[0][2];
    for (var i = 0; i < brackets.length; i++) {
      var low = brackets[i][0];
      var high = brackets[i][1];
      var rate = brackets[i][2];
      if (taxable > low) {
        var slice = Math.min(taxable, high) - low;
        tax += slice * rate;
        marginal = rate;
      }
    }
    return { tax: r2(tax), marginalRate: marginal };
  }

  var FED_BRACKETS_2025 = [
    [0, 57375, 0.145],
    [57375, 114750, 0.205],
    [114750, 177882, 0.26],
    [177882, 253414, 0.29],
    [253414, Infinity, 0.33]
  ];

  var MB_BRACKETS_2025 = [
    [0, 47000, 0.108],
    [47000, 100000, 0.1275],
    [100000, Infinity, 0.174]
  ];

  function fedBasicPersonal2025(netIncome) {
    if (netIncome <= 177882) return 16129;
    if (netIncome >= 253414) return 14538;
    var ratio = (netIncome - 177882) / (253414 - 177882);
    return r2(16129 - (16129 - 14538) * ratio);
  }

  function mbBasicPersonal2025(netIncome) {
    if (netIncome <= 200000) return 15780;
    if (netIncome >= 400000) return 0;
    return r2(15780 * (1 - (netIncome - 200000) / 200000));
  }

  root.BF.TAX_YEAR = 2025;

  root.BF.estimateTaxRefund = function (profile, opts) {
    var p = profile || {};
    opts = opts || {};
    var already = opts.alreadyReceiving || {};
    var province = p.province || "MB";
    var age = num(p.age);
    var couple = p.marital === "married" || p.marital === "common-law";
    var kids = (root.BF.childStats ? root.BF.childStats(p) : { under18: 0 });
    var hasDtcSelf = p.disability === "has-dtc";
    var selfEmployed = !!p.selfEmployed;

    var hhIncome = num(p.householdIncome);
    var workEntered = hasVal(p.workingIncome) ? num(p.workingIncome) : 0;
    var workInc = workEntered > 0 ? workEntered : (p.working ? hhIncome : 0);
    var hasSpouseIncome = couple && hasVal(p.spouseIncome);
    var spouseInc = hasSpouseIncome ? num(p.spouseIncome) : 0;

    var assumptions = [];
    var grossIncome;
    if (couple) {
      if (hasSpouseIncome) {
        grossIncome = Math.max(workInc, Math.max(0, hhIncome - spouseInc));
      } else {
        grossIncome = workInc > 0 ? workInc : hhIncome;
        if (hhIncome > 0 && workInc === 0) {
          assumptions.push("Canadian tax returns are filed individually. Because spouse income was not entered, your household income was used as your individual income.");
        } else if (hhIncome > workInc && workInc > 0) {
          assumptions.push("Your working income was used as your individual income; enter your spouse's net income in Step 3 for an exact spousal credit check.");
        }
      }
    } else {
      grossIncome = Math.max(hhIncome, workInc);
    }

    var familyNetGross = hhIncome > 0 ? hhIncome : (grossIncome + spouseInc);
    var rrsp = num(p.rrspDeduction);

    // 2025 CPP, CPP2, and EI on working income
    var cpp1Contrib = Math.max(0, Math.min(workInc, 71300) - 3500);
    var cpp2Contrib = Math.max(0, Math.min(workInc, 81200) - 71300);

    var baseCppCredit = 0;
    var cppDeduction = 0;
    var selfEmployedCppPayable = 0;
    var eiPremiums = 0;

    if (workInc > 0) {
      if (selfEmployed) {
        var seBaseHalf = r2(cpp1Contrib * 0.0495);
        var seEnh = r2(cpp1Contrib * 0.02 + cpp2Contrib * 0.08);
        baseCppCredit = seBaseHalf;
        cppDeduction = r2(seBaseHalf + seEnh);
        selfEmployedCppPayable = r2(cpp1Contrib * 0.119 + cpp2Contrib * 0.08);
      } else {
        baseCppCredit = r2(cpp1Contrib * 0.0495);
        cppDeduction = r2(cpp1Contrib * 0.01 + cpp2Contrib * 0.04);
        eiPremiums = r2(Math.min(workInc, 65700) * 0.0164);
      }
    }

    var totalDeductions = r2(rrsp + cppDeduction);
    var netIncome = Math.max(0, r2(grossIncome - totalDeductions));
    var taxableIncome = netIncome;
    var adjFamilyNet = Math.max(0, r2(familyNetGross - totalDeductions));

    // Federal 2025 tax & non-refundable credits (14.5%)
    var fedGross = calcProgressive(taxableIncome, FED_BRACKETS_2025);
    var fedBpa = fedBasicPersonal2025(netIncome);
    var fedAgeAmt = (age >= 65 && netIncome < 105709) ? Math.max(0, r2(9028 - 0.15 * Math.max(0, netIncome - 45522))) : 0;
    var fedSpouseAmt = (couple && hasSpouseIncome && spouseInc < fedBpa) ? r2(fedBpa - spouseInc) : 0;
    var fedDependantAmt = (!couple && kids.under18 > 0) ? fedBpa : 0;
    var fedCea = (!selfEmployed && workInc > 0) ? Math.min(1471, workInc) : 0;
    var fedDtcAmt = hasDtcSelf ? 10138 : 0;

    var fedCreditBase = r2(fedBpa + fedAgeAmt + fedSpouseAmt + fedDependantAmt + baseCppCredit + eiPremiums + fedCea + fedDtcAmt);
    var fedCredits = r2(fedCreditBase * 0.145);
    var federalTax = Math.max(0, r2(fedGross.tax - fedCredits));

    // Manitoba 2025 tax & non-refundable credits (10.8%)
    var isMb = province === "MB";
    var mbGross = isMb ? calcProgressive(taxableIncome, MB_BRACKETS_2025) : { tax: 0, marginalRate: 0 };
    var mbCredits = 0;
    var manitobaTax = 0;
    if (isMb) {
      var mbBpa = mbBasicPersonal2025(netIncome);
      var mbAgeAmt = (age >= 65 && netIncome < 52602) ? Math.max(0, r2(3728 - 0.15 * Math.max(0, netIncome - 27749))) : 0;
      var mbSpouseAmt = (couple && hasSpouseIncome && spouseInc < 9134) ? r2(9134 - spouseInc) : 0;
      var mbDependantAmt = (!couple && kids.under18 > 0) ? 9134 : 0;
      var mbDtcAmt = hasDtcSelf ? 6180 : 0;
      var mbCreditBase = r2(mbBpa + mbAgeAmt + mbSpouseAmt + mbDependantAmt + baseCppCredit + eiPremiums + mbDtcAmt);
      mbCredits = r2(mbCreditBase * 0.108);
      manitobaTax = Math.max(0, r2(mbGross.tax - mbCredits));
    } else {
      assumptions.push("Provincial income tax is calculated for Manitoba only in this build. Federal tax and refundable credits are still estimated.");
    }

    // Refundable tax credits claimed on the 2025 return (respecting permanent alreadyReceiving exclusion!)
    var refundableItems = [];
    var cwbAmount = 0;
    var cwbEligibleAge = age >= 19 || couple || kids.under18 > 0;
    if (!already["cwb"] && workInc >= 3000 && cwbEligibleAge && !p.student) {
      var isFamily = couple || kids.under18 > 0;
      var cwbMax = isFamily ? 2813 : 1633;
      var cwbThreshold = isFamily ? 30639 : 26855;
      var cwbIncomeBase = isFamily ? adjFamilyNet : netIncome;
      var cwbPhaseIn = Math.min(cwbMax, 0.27 * (workInc - 3000));
      var cwbPhaseOut = 0.15 * Math.max(0, cwbIncomeBase - cwbThreshold);
      cwbAmount = Math.max(0, r2(cwbPhaseIn - cwbPhaseOut));
      if (cwbAmount > 0) {
        refundableItems.push({ id: "cwb", label: "Canada Workers Benefit (2025 Schedule 6)", amount: cwbAmount });
      }
    }

    var cwbSuppAmount = 0;
    if (!already["cwb-disability"] && hasDtcSelf && workInc >= 1150 && cwbEligibleAge && !p.student) {
      var isFamSupp = couple || kids.under18 > 0;
      var suppThresh = isFamSupp ? 49389 : 37740;
      var suppBase = isFamSupp ? adjFamilyNet : netIncome;
      var suppIn = Math.min(843, 0.27 * (workInc - 1150));
      var suppOut = 0.15 * Math.max(0, suppBase - suppThresh);
      cwbSuppAmount = Math.max(0, r2(suppIn - suppOut));
      if (cwbSuppAmount > 0) {
        refundableItems.push({ id: "cwb-disability", label: "CWB disability supplement (2025)", amount: cwbSuppAmount });
      }
    }

    var mbRatcAmount = 0;
    if (isMb && p.housing === "rent" && !already["ratc"]) {
      var rentEntered = hasVal(p.monthlyRent) ? num(p.monthlyRent) : 0;
      var rentBase = rentEntered > 0 ? Math.min(575, r2(rentEntered * 12)) : 575;
      if (rentEntered === 0) {
        assumptions.push("Full-year Manitoba rent of at least $575/yr is assumed for the Renters Affordability Tax Credit (enter monthly rent to refine).");
      }
      var seniorsTopUp = age >= 65 ? Math.max(0, r2(328 - 0.0075 * adjFamilyNet)) : 0;
      mbRatcAmount = r2(rentBase + seniorsTopUp);
      if (mbRatcAmount > 0) {
        refundableItems.push({ id: "ratc", label: "Manitoba Renters Affordability Tax Credit (2025 MB479)", amount: mbRatcAmount });
      }
    }

    if (isMb && p.housing === "own" && !already["hatc"]) {
      assumptions.push("Manitoba Homeowners Affordability Tax Credit (up to $1,500 for 2025) is usually applied on your property tax bill; if not, it can be claimed on Form MB479 with your school tax amount.");
    }

    var totalRefundableCredits = r2(cwbAmount + cwbSuppAmount + mbRatcAmount);
    var totalTaxPayable = r2(federalTax + manitobaTax + selfEmployedCppPayable);
    var hasTaxWithheld = hasVal(p.taxWithheld);
    var taxWithheld = hasTaxWithheld ? num(p.taxWithheld) : 0;

    // Net position: positive = refund, negative = balance owing
    var netBalance = r2(taxWithheld + totalRefundableCredits - totalTaxPayable);
    var status = netBalance >= 0 ? "refund" : "owing";
    var marginalRate = grossIncome > 0 ? r2((fedGross.marginalRate + (isMb ? mbGross.marginalRate : 0)) * 100) : 0;
    var effectiveRate = grossIncome > 0 ? r2((totalTaxPayable / grossIncome) * 100) : 0;

    return {
      taxYear: 2025,
      province: province,
      isManitoba: isMb,
      grossIncome: r2(grossIncome),
      workIncome: r2(workInc),
      rrspDeduction: r2(rrsp),
      cppDeduction: r2(cppDeduction),
      netIncome: netIncome,
      taxableIncome: taxableIncome,
      federalGrossTax: fedGross.tax,
      federalCredits: fedCredits,
      federalTax: federalTax,
      manitobaGrossTax: mbGross.tax,
      manitobaCredits: mbCredits,
      manitobaTax: manitobaTax,
      selfEmployedCppPayable: selfEmployedCppPayable,
      totalTaxPayable: totalTaxPayable,
      refundableCredits: refundableItems,
      totalRefundableCredits: totalRefundableCredits,
      hasTaxWithheld: hasTaxWithheld,
      taxWithheld: taxWithheld,
      netBalance: netBalance,
      status: status,
      amountAbs: Math.abs(netBalance),
      marginalRatePercent: marginalRate,
      effectiveRatePercent: effectiveRate,
      assumptions: assumptions
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
