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
   - 2025 capital gains inclusion rate remains one-half (proposed increase deferred to 1 January 2026):
     https://www.canada.ca/en/department-finance/news/2025/01/government-of-canada-announces-deferral-in-implementation-of-change-to-capital-gains-inclusion-rate.html
     https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12700-capital-gains.html
   - 2025 dividends if no information slip: eligible × 138%, other-than-eligible × 115% (lines 12000 / 12010):
     https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12000-taxable-amount-dividends-eligible-other-than-eligible-taxable-canadian-corporations.html
   - 2025 federal dividend tax credit (line 40425) from Federal Worksheet: 9.0301% of eligible taxable amount, 15.0198% of other-than-eligible taxable amount.
   - 2025 Manitoba dividend tax credit (Worksheet MB428 line 61520): 8% of eligible taxable amount, 0.7835% of other-than-eligible taxable amount (5007-D E (25)).
   - 2025 medical expense threshold $2,834 or 3% of net income:
     https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4065/medical-expenses.html
   - 2025 donation credit rates (14.5% / 29% / 33% federal; MB 10.8% / 17.4%):
     https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-34900-donations-gifts/how-much-claim.html
   - 2025 RRSP dollar limit $32,490; FHSA annual contribution limit $8,000, lifetime $40,000.
   - Digital news subscription tax credit ended after 2024 and is not used for 2025:
     https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/deductions-credits-expenses/digital-news-subscription.html
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


  var INCOME_DETAIL_KEYS = [
    "incomeEmployment", "incomeSelfEmployedGross", "incomeSelfEmployedNet",
    "incomeEiBenefits", "incomePension", "incomeInterest",
    "incomeDividendsEligible", "incomeDividendsOther", "incomeRentalNet",
    "incomeCapitalGains", "incomeOther"
  ];

  root.BF.incomeBreakdown = function (p) {
    p = p || {};
    var used = INCOME_DETAIL_KEYS.some(function (k) { return hasVal(p[k]); });
    var wo = p.writeoffAmounts || {};
    var employment = num(p.incomeEmployment);
    var seGross = num(p.incomeSelfEmployedGross);
    var seNet = hasVal(p.incomeSelfEmployedNet) ? num(p.incomeSelfEmployedNet) : 0;
    var seExp = num(wo.seExpenses);
    if (!hasVal(p.incomeSelfEmployedNet) && seGross > 0) {
      seNet = Math.max(0, r2(seGross - seExp));
    }
    var ei = num(p.incomeEiBenefits);
    var pension = num(p.incomePension);
    var interest = num(p.incomeInterest);
    var divEligActual = num(p.incomeDividendsEligible);
    var divOtherActual = num(p.incomeDividendsOther);
    var divEligTaxable = r2(divEligActual * 1.38);
    var divOtherTaxable = r2(divOtherActual * 1.15);
    var rental = num(p.incomeRentalNet);
    var capGains = num(p.incomeCapitalGains);
    var taxableGains = r2(capGains * 0.5);
    var other = num(p.incomeOther);
    var taxable = r2(employment + seNet + ei + pension + interest + divEligTaxable + divOtherTaxable + rental + taxableGains + other);
    var tipsAsWork = other > 0 && (p.workType === "employee" || p.workType === "both" || p.profession === "gig" || employment > 0);
    var working = r2(employment + seNet + (tipsAsWork ? other : 0));
    var hasEmployment = employment > 0 || p.workType === "employee" || p.workType === "both";
    var hasSE = seNet > 0 || seGross > 0 || !!p.selfEmployed || p.workType === "self-employed" || p.workType === "both";
    return {
      usedDetailed: used,
      employment: r2(employment),
      seGross: r2(seGross),
      seNet: r2(seNet),
      seExpensesAppliedToGross: !hasVal(p.incomeSelfEmployedNet) && seGross > 0 && seExp > 0,
      ei: r2(ei),
      pension: r2(pension),
      interest: r2(interest),
      divEligActual: r2(divEligActual),
      divOtherActual: r2(divOtherActual),
      divEligTaxable: divEligTaxable,
      divOtherTaxable: divOtherTaxable,
      rental: r2(rental),
      capitalGains: r2(capGains),
      taxableCapitalGains: taxableGains,
      other: r2(other),
      taxableIncomeBeforeDeductions: taxable,
      workingIncome: working,
      hasEmployment: hasEmployment,
      hasSE: hasSE
    };
  };

  function woAmt(p, key) {
    var wo = p.writeoffAmounts || {};
    if (hasVal(wo[key])) return num(wo[key]);
    if (key === "rrspDeduction" || key === "rrsp") return num(p.rrspDeduction);
    return 0;
  }

  function tradesToolsDeduction(cost, tradesIncome) {
    var a = Math.min(num(cost), num(tradesIncome));
    return r2(Math.max(0, Math.min(1000, a - 1471)));
  }

  root.BF.tradesToolsDeduction = tradesToolsDeduction;

  root.BF.TAX_YEAR = 2025;

  root.BF.estimateTaxRefund = function (profile, opts) {
    var p = profile || {};
    opts = opts || {};
    var already = opts.alreadyReceiving || {};
    function woGet(p2, key) {
      var map = { rrspDeduction: "rrsp", rrsp: "rrsp", fhsaDeduction: "fhsa", fhsa: "fhsa" };
      var id = map[key] || key;
      if (already[id]) return 0;
      return woAmt(p2, key);
    }
    var province = p.province || "MB";
    var age = num(p.age);
    var couple = p.marital === "married" || p.marital === "common-law";
    var kids = (root.BF.childStats ? root.BF.childStats(p) : { under18: 0 });
    var hasDtcSelf = p.disability === "has-dtc";
    var selfEmployed = !!p.selfEmployed;

    var breakdown = root.BF.incomeBreakdown(p);
    if (p.workType === "self-employed" || p.workType === "both") selfEmployed = true;
    if (breakdown.hasSE && breakdown.usedDetailed) selfEmployed = true;

    var hhIncome = num(p.householdIncome);
    var workEntered = hasVal(p.workingIncome) ? num(p.workingIncome) : 0;
    var workInc = workEntered > 0 ? workEntered : (p.working ? hhIncome : 0);
    var hasSpouseIncome = couple && hasVal(p.spouseIncome);
    var spouseInc = hasSpouseIncome ? num(p.spouseIncome) : 0;
    var employmentInc = workInc;
    var seNetInc = selfEmployed ? workInc : 0;

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

    if (breakdown.usedDetailed) {
      grossIncome = breakdown.taxableIncomeBeforeDeductions;
      workInc = breakdown.workingIncome;
      employmentInc = breakdown.employment + ((breakdown.other && (p.workType === "employee" || p.workType === "both" || p.profession === "gig" || breakdown.employment > 0)) ? breakdown.other : 0);
      seNetInc = breakdown.seNet;
      selfEmployed = breakdown.hasSE;
      assumptions.push("Taxable income uses your 2025 income details: 50% of capital gains (line 12700) and the official dividend gross-up (eligible × 138%, other-than-eligible × 115%).");
      if (hhIncome > 0) {
        assumptions.push("Adjusted family net income still uses the household total you entered, for benefits that use family income.");
      }
    }

    var familyNetGross = hhIncome > 0 ? hhIncome : (grossIncome + spouseInc);
    var rrsp = Math.min(32490, woGet(p, "rrspDeduction"));
    var fhsa = Math.min(8000, woGet(p, "fhsaDeduction") || woGet(p, "fhsa"));

    // 2025 CPP, CPP2, and EI
    var baseCppCredit = 0;
    var cppDeduction = 0;
    var selfEmployedCppPayable = 0;
    var eiPremiums = 0;
    var empForCpp = breakdown.usedDetailed ? employmentInc : (selfEmployed ? 0 : workInc);
    var seForCpp = breakdown.usedDetailed ? seNetInc : (selfEmployed ? workInc : 0);
    if (!breakdown.usedDetailed) {
      if (selfEmployed) { seForCpp = workInc; empForCpp = 0; }
      else { empForCpp = workInc; seForCpp = 0; }
    }

    function cppSlices(pensionable) {
      var c1 = Math.max(0, Math.min(pensionable, 71300) - 3500);
      var c2 = Math.max(0, Math.min(pensionable, 81200) - 71300);
      return { c1: c1, c2: c2 };
    }

    if (empForCpp > 0 && seForCpp > 0) {
      var empS = cppSlices(empForCpp);
      baseCppCredit = r2(empS.c1 * 0.0495);
      cppDeduction = r2(empS.c1 * 0.01 + empS.c2 * 0.04);
      eiPremiums = r2(Math.min(empForCpp, 65700) * 0.0164);
      var sePensionable = Math.max(0, Math.min(seForCpp, Math.max(0, 81200 - empForCpp)));
      var seOnYmpe = Math.max(0, Math.min(sePensionable, Math.max(0, 71300 - empForCpp)));
      var seC1 = empForCpp >= 71300 ? 0 : Math.max(0, seOnYmpe - Math.max(0, 3500 - empForCpp));
      if (empForCpp >= 3500) seC1 = Math.max(0, Math.min(seForCpp, Math.max(0, 71300 - empForCpp)));
      var seC2 = Math.max(0, Math.min(empForCpp + seForCpp, 81200) - Math.max(empForCpp, 71300));
      baseCppCredit = r2(baseCppCredit + seC1 * 0.0495);
      cppDeduction = r2(cppDeduction + seC1 * 0.0495 + seC1 * 0.02 + seC2 * 0.08);
      selfEmployedCppPayable = r2(seC1 * 0.119 + seC2 * 0.08);
    } else if (seForCpp > 0) {
      var seS = cppSlices(seForCpp);
      var seBaseHalf = r2(seS.c1 * 0.0495);
      var seEnh = r2(seS.c1 * 0.02 + seS.c2 * 0.08);
      baseCppCredit = seBaseHalf;
      cppDeduction = r2(seBaseHalf + seEnh);
      selfEmployedCppPayable = r2(seS.c1 * 0.119 + seS.c2 * 0.08);
    } else if (empForCpp > 0) {
      var eS = cppSlices(empForCpp);
      baseCppCredit = r2(eS.c1 * 0.0495);
      cppDeduction = r2(eS.c1 * 0.01 + eS.c2 * 0.04);
      eiPremiums = r2(Math.min(empForCpp, 65700) * 0.0164);
    }

    var tradesIncome = breakdown.usedDetailed ? breakdown.employment : (selfEmployed ? 0 : workInc);
    var toolsCost = woGet(p, "tradesTools");
    var toolsDed = toolsCost > 0 ? tradesToolsDeduction(toolsCost, tradesIncome) : 0;
    var lmd = woGet(p, "labourMobility");
    if (lmd > 0) lmd = r2(Math.min(4000, lmd, tradesIncome * 0.5 || lmd));
    var unionDues = woGet(p, "unionDues");
    var childCare = woGet(p, "childCare");
    var moving = woGet(p, "moving");
    var t777 = woGet(p, "t777");
    var homeOffice = woGet(p, "homeOffice");
    var vehicle = woGet(p, "vehicle");
    var apprenticeTools = woGet(p, "apprenticeTools");
    var northern = woGet(p, "northern");
    var seExpDed = 0;
    if (woGet(p, "seExpenses") > 0 && !breakdown.seExpensesAppliedToGross) {
      if (!hasVal(p.incomeSelfEmployedNet)) seExpDed = woGet(p, "seExpenses");
    }

    var extraDeductions = r2(fhsa + unionDues + childCare + moving + toolsDed + lmd + t777 + homeOffice + vehicle + apprenticeTools + northern + seExpDed);
    var totalDeductions = r2(rrsp + cppDeduction + extraDeductions);
    var netIncome = Math.max(0, r2(grossIncome - totalDeductions));
    var taxableIncome = netIncome;
    var adjFamilyNet = Math.max(0, r2(familyNetGross - totalDeductions));

    // Federal 2025 tax & non-refundable credits (14.5%)
    var fedGross = calcProgressive(taxableIncome, FED_BRACKETS_2025);
    var fedBpa = fedBasicPersonal2025(netIncome);
    var fedAgeAmt = (age >= 65 && netIncome < 105709) ? Math.max(0, r2(9028 - 0.15 * Math.max(0, netIncome - 45522))) : 0;
    var fedSpouseAmt = (couple && hasSpouseIncome && spouseInc < fedBpa) ? r2(fedBpa - spouseInc) : 0;
    var fedDependantAmt = (!couple && kids.under18 > 0) ? fedBpa : 0;
    var ceaBase = breakdown.usedDetailed ? employmentInc : workInc;
    var fedCea = (ceaBase > 0 && !(selfEmployed && !breakdown.hasEmployment && breakdown.usedDetailed) && !(selfEmployed && !breakdown.usedDetailed)) ? Math.min(1471, ceaBase) : 0;
    if (breakdown.usedDetailed && breakdown.hasEmployment) fedCea = Math.min(1471, employmentInc);
    var fedDtcAmt = hasDtcSelf ? 10138 : 0;

    var fedCreditBase = r2(fedBpa + fedAgeAmt + fedSpouseAmt + fedDependantAmt + baseCppCredit + eiPremiums + fedCea + fedDtcAmt);
    var fedCredits = r2(fedCreditBase * 0.145);
    var federalTax = Math.max(0, r2(fedGross.tax - fedCredits));

    // Manitoba 2025 tax & non-refundable credits (10.8%)
    var isMb = province === "MB";
    var mbGross = isMb ? calcProgressive(taxableIncome, MB_BRACKETS_2025) : { tax: 0, marginalRate: 0 };
    var mbCredits = 0;
    var mbCreditBase = 0;
    var manitobaTax = 0;
    if (isMb) {
      var mbBpa = mbBasicPersonal2025(netIncome);
      var mbAgeAmt = (age >= 65 && netIncome < 52602) ? Math.max(0, r2(3728 - 0.15 * Math.max(0, netIncome - 27749))) : 0;
      var mbSpouseAmt = (couple && hasSpouseIncome && spouseInc < 9134) ? r2(9134 - spouseInc) : 0;
      var mbDependantAmt = (!couple && kids.under18 > 0) ? 9134 : 0;
      var mbDtcAmt = hasDtcSelf ? 6180 : 0;
      mbCreditBase = r2(mbBpa + mbAgeAmt + mbSpouseAmt + mbDependantAmt + baseCppCredit + eiPremiums + mbDtcAmt);
      mbCredits = r2(mbCreditBase * 0.108);
      manitobaTax = Math.max(0, r2(mbGross.tax - mbCredits));
    } else {
      var provName = (root.BF.provinceName && root.BF.provinceName(province)) || province;
      assumptions.push("Provincial tax not yet included for " + provName + "; federal estimate shown.");
    }

    // Write-off credits (tuition, medical, donations, volunteer firefighter, MB items)
    var tuition = woGet(p, "tuition");
    var volunteerAmt = woGet(p, "volunteerFirefighter");
    if (volunteerAmt > 0) volunteerAmt = Math.min(6000, volunteerAmt);
    fedCreditBase = r2(fedCreditBase + tuition + volunteerAmt);
    fedCredits = r2(fedCreditBase * 0.145);
    if (isMb) {
      mbCreditBase = r2((typeof mbCreditBase === "number" ? mbCreditBase : 0) + tuition + volunteerAmt);
      mbCredits = r2(mbCreditBase * 0.108);
    }

    var fedDivCredit = r2(breakdown.divEligTaxable * 0.090301 + breakdown.divOtherTaxable * 0.150198);
    var mbDivCredit = isMb ? r2(breakdown.divEligTaxable * 0.08 + breakdown.divOtherTaxable * 0.007835) : 0;
    var medicalExp = woGet(p, "medical");
    var medicalBase = medicalExp > 0 ? Math.max(0, r2(medicalExp - Math.min(2834, 0.03 * netIncome))) : 0;
    var fedMedCredit = r2(medicalBase * 0.145);
    var mbMedCredit = isMb ? r2(medicalBase * 0.108) : 0;
    var donations = Math.min(woGet(p, "donations"), r2(0.75 * netIncome));
    var donFirst = Math.min(200, donations);
    var donRest = Math.max(0, donations - donFirst);
    var donTop = 0;
    if (taxableIncome > 253414) {
      donTop = Math.min(donRest, r2(taxableIncome - 253414));
      donRest = r2(donRest - donTop);
    }
    var fedDonCredit = r2(donFirst * 0.145 + donRest * 0.29 + donTop * 0.33);
    var mbDonCredit = isMb ? r2(donFirst * 0.108 + (donations - donFirst) * 0.174) : 0;
    var mbFit = isMb ? Math.min(500, woGet(p, "mbFitness")) : 0;
    var mbFitCredit = r2(mbFit * 0.108);
    var mbLsvccIn = woGet(p, "mbLabourSponsored");
    var mbLsvccCredit = 0;
    if (isMb && mbLsvccIn > 0) {
      mbLsvccCredit = mbLsvccIn <= 1800 ? r2(mbLsvccIn) : r2(Math.min(1800, mbLsvccIn * 0.15));
    }

    fedCredits = r2(fedCredits + fedDivCredit + fedMedCredit + fedDonCredit);
    federalTax = Math.max(0, r2(fedGross.tax - fedCredits));
    if (isMb) {
      mbCredits = r2(mbCredits + mbDivCredit + mbMedCredit + mbDonCredit + mbFitCredit + mbLsvccCredit);
      manitobaTax = Math.max(0, r2(mbGross.tax - mbCredits));
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

    var educatorExp = woGet(p, "educatorSupplies");
    var educatorCredit = 0;
    if (!already["educatorSupplies"] && educatorExp > 0) {
      educatorCredit = r2(Math.min(1000, educatorExp) * 0.25);
      if (educatorCredit > 0) refundableItems.push({ id: "educatorSupplies", label: "Eligible educator school supply tax credit (2025 lines 46800/46900)", amount: educatorCredit });
    }
    var ctcLimit = woGet(p, "ctcLimit");
    var ctcCredit = 0;
    if (!already["ctcLimit"] && ctcLimit > 0 && tuition > 0) {
      ctcCredit = r2(Math.min(ctcLimit, tuition * 0.5));
      if (ctcCredit > 0) refundableItems.push({ id: "ctcLimit", label: "Canada training credit (2025 line 45350)", amount: ctcCredit });
    }
    var mbCare = 0;
    if (isMb && !already["mbCaregiver"] && woGet(p, "mbCaregiver") > 0) {
      mbCare = r2(Math.min(1400, woGet(p, "mbCaregiver")));
      if (mbCare > 0) refundableItems.push({ id: "mbCaregiver", label: "Manitoba Primary Caregiver Tax Credit (2025 MB479)", amount: mbCare });
    }

    var totalRefundableCredits = r2(cwbAmount + cwbSuppAmount + mbRatcAmount + educatorCredit + ctcCredit + mbCare);

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
      assumptions: assumptions,
      breakdown: breakdown,
      deductions: {
        rrsp: r2(rrsp),
        fhsa: r2(fhsa),
        cpp: r2(cppDeduction),
        tradesTools: toolsDed,
        labourMobility: r2(lmd),
        other: r2(extraDeductions - toolsDed - lmd - fhsa)
      },
      fedDivCredit: r2(fedDivCredit || 0),
      mbDivCredit: r2(mbDivCredit || 0),
      federalOnly: !isMb,
      provincialIncluded: isMb,
      provinceName: (root.BF.provinceName && root.BF.provinceName(province)) || province
    };
  };

  /* Combined federal + Manitoba taxable-income thresholds where the
     combined marginal rate changes (union of 2025 federal and MB brackets). */
  var COMBINED_THRESHOLDS_MB_2025 = [47000, 57375, 100000, 114750, 177882, 253414];
  var FED_THRESHOLDS_2025 = [57375, 114750, 177882, 253414];
  var RRSP_DOLLAR_LIMIT_2025 = 32490;
  var SUGGESTED_RRSP_STEPS = [0, 1000, 2500, 5000, 10000];

  root.BF.RRSP_DOLLAR_LIMIT_2025 = RRSP_DOLLAR_LIMIT_2025;
  root.BF.combinedBracketThresholds = function (province) {
    return (province === "MB" ? COMBINED_THRESHOLDS_MB_2025 : FED_THRESHOLDS_2025).slice();
  };

  function cloneProfileForRrsp(profile, amount) {
    var q = {};
    Object.keys(profile || {}).forEach(function (k) { q[k] = profile[k]; });
    q.rrspDeduction = amount;
    if (profile && profile.writeoffAmounts && typeof profile.writeoffAmounts === "object") {
      var wo = {};
      Object.keys(profile.writeoffAmounts).forEach(function (k) {
        if (k !== "rrspDeduction" && k !== "rrsp") wo[k] = profile.writeoffAmounts[k];
      });
      q.writeoffAmounts = wo;
    }
    return q;
  }

  function combinedMarginalPercent(taxable, isMb) {
    var fed = calcProgressive(taxable, FED_BRACKETS_2025).marginalRate;
    var mb = isMb ? calcProgressive(taxable, MB_BRACKETS_2025).marginalRate : 0;
    return r2((fed + mb) * 100);
  }

  function nextLowerThreshold(taxable, thresholds) {
    var found = null;
    for (var i = 0; i < thresholds.length; i++) {
      if (thresholds[i] < taxable - 0.005) found = thresholds[i];
    }
    return found;
  }

  root.BF.rrspHelper = function (profile, opts) {
    opts = opts || {};
    var p = profile || {};
    var already = opts.alreadyReceiving || {};
    var isMb = (p.province || "MB") === "MB";
    var hasRoom = hasVal(p.rrspRoom);
    var room = hasRoom ? Math.max(0, Number(p.rrspRoom) || 0) : null;
    var cap = hasRoom ? room : RRSP_DOLLAR_LIMIT_2025;
    if (cap < 0) cap = 0;

    var amounts = [];
    SUGGESTED_RRSP_STEPS.forEach(function (a) {
      if (a <= cap + 0.005) amounts.push(a);
    });
    if (cap > 0 && amounts.indexOf(cap) < 0) {
      var alreadyIn = amounts.some(function (a) { return Math.abs(a - cap) < 0.005; });
      if (!alreadyIn) amounts.push(cap);
    }
    var entered = hasVal(p.rrspDeduction) ? num(p.rrspDeduction) : 0;
    if (entered > 0 && entered <= cap + 0.005) {
      var hasEntered = amounts.some(function (a) { return Math.abs(a - entered) < 0.005; });
      if (!hasEntered) amounts.push(entered);
    }
    amounts.sort(function (a, b) { return a - b; });

    function estimateAt(amount) {
      return root.BF.estimateTaxRefund(cloneProfileForRrsp(p, amount), { alreadyReceiving: already });
    }

    var zero = estimateAt(0);
    var thresholds = root.BF.combinedBracketThresholds(p.province || "MB");
    var targetThreshold = nextLowerThreshold(zero.taxableIncome, thresholds);
    var sweetSpot = targetThreshold != null ? r2(Math.max(0, zero.taxableIncome - targetThreshold)) : null;
    if (sweetSpot != null && sweetSpot <= cap + 0.005 && sweetSpot > 0) {
      var hasSweet = amounts.some(function (a) { return Math.abs(a - sweetSpot) < 0.005; });
      if (!hasSweet) {
        amounts.push(sweetSpot);
        amounts.sort(function (a, b) { return a - b; });
      }
    }

    var steps = amounts.map(function (contrib, i) {
      var res = estimateAt(contrib);
      var prevAmount = i === 0 ? contrib : amounts[i - 1];
      var prevRes = i === 0 ? res : estimateAt(prevAmount);
      var deltaContrib = r2(contrib - prevAmount);
      var extraVsZero = r2(res.netBalance - zero.netBalance);
      var extraVsPrev = r2(res.netBalance - prevRes.netBalance);
      var marginal = deltaContrib > 0 ? r2((extraVsPrev / deltaContrib) * 100) : 0;
      return {
        contribution: contrib,
        taxableIncome: res.taxableIncome,
        totalTaxPayable: res.totalTaxPayable,
        totalRefundableCredits: res.totalRefundableCredits,
        netBalance: res.netBalance,
        status: res.status,
        amountAbs: res.amountAbs,
        hasTaxWithheld: res.hasTaxWithheld,
        extraRefund: extraVsZero,
        extraVsPrevious: extraVsPrev,
        marginalRatePercent: marginal,
        isEntered: entered > 0 && Math.abs(contrib - entered) < 0.005,
        isRoom: hasRoom && Math.abs(contrib - room) < 0.005,
        isSweetSpot: sweetSpot != null && contrib > 0 && Math.abs(contrib - sweetSpot) < 0.005
      };
    });

    var fedBpa = 16129;
    var alreadyBelowBpa = zero.taxableIncome <= fedBpa;
    var taxAlreadyZero = zero.totalTaxPayable <= 0;
    var last = steps[steps.length - 1] || steps[0];
    var taxZeroWithinCap = taxAlreadyZero ? 0 : (last && last.totalTaxPayable <= 0 ? true : (estimateAt(cap).totalTaxPayable <= 0));
    var taxZeroAt = null;
    if (taxAlreadyZero) taxZeroAt = 0;
    else if (estimateAt(cap).totalTaxPayable <= 0) {
      var lo = 0;
      var hi = cap;
      for (var n = 0; n < 40; n++) {
        var mid = r2((lo + hi) / 2);
        if (estimateAt(mid).totalTaxPayable <= 0) hi = mid;
        else lo = mid;
      }
      taxZeroAt = r2(hi);
    }

    var refundableAtZero = zero.totalRefundableCredits;
    var refundableAtCap = estimateAt(cap).totalRefundableCredits;
    var refundableRiseStops = false;
    var i;
    for (i = 1; i < steps.length; i++) {
      if (steps[i - 1].totalRefundableCredits > refundableAtZero + 0.005 &&
          Math.abs(steps[i].totalRefundableCredits - steps[i - 1].totalRefundableCredits) < 0.005) {
        refundableRiseStops = true;
      }
    }

    function cadLabel(n) {
      var v = r2(n);
      var neg = v < 0;
      var abs = Math.abs(v);
      var parts = abs.toFixed(2).split(".");
      var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      var s = "$" + whole + (parts[1] === "00" ? "" : "." + parts[1]);
      return (neg ? "−" : "") + s;
    }

    var rateNow = combinedMarginalPercent(Math.max(0, zero.taxableIncome), isMb);
    var rateAfter = targetThreshold != null ? combinedMarginalPercent(targetThreshold, isMb) : rateNow;

    var notes = [];
    if (alreadyBelowBpa || taxAlreadyZero) {
      notes.push("Your taxable income is already at or below the basic personal amount, or your estimated tax is already $0, so more RRSP generally will not reduce 2025 tax.");
    } else if (targetThreshold == null) {
      notes.push("You are already in the lowest combined federal" + (isMb ? " and Manitoba" : "") + " tax bracket, so there is no lower bracket to drop into. Each extra dollar still saves tax at about " + String(rateNow) + "% until tax reaches $0.");
    } else if (sweetSpot > cap) {
      notes.push("About " + cadLabel(sweetSpot) + " would bring taxable income down to " + cadLabel(targetThreshold) + ", where the combined rate drops from " + String(rateNow) + "% to " + String(rateAfter) + "%. " + (hasRoom ? "The room you entered is not enough to get there, so each dollar in this list saves at about the same rate." : "That target is above the amounts shown."));
    } else if (sweetSpot > 0) {
      notes.push("The sweet spot is about " + cadLabel(sweetSpot) + ": that is the amount that brings taxable income down to the next lower combined bracket of " + cadLabel(targetThreshold) + ". Beyond that, each extra dollar saves less (the combined rate drops from " + String(rateNow) + "% to " + String(rateAfter) + "%).");
    }
    if (taxZeroAt != null && taxZeroAt > 0 && !taxAlreadyZero) {
      notes.push("Around " + cadLabel(taxZeroAt) + " of RRSP, estimated 2025 tax reaches $0. Contributions above that do not reduce this year's tax.");
    }
    if (refundableAtCap > refundableAtZero + 0.005) {
      notes.push("A larger RRSP can also increase refundable benefits that phase out with income, such as the Canada Workers Benefit. That extra help stops once those benefits have reached their maximum.");
    } else if (refundableRiseStops) {
      notes.push("Refundable benefits stop increasing after a point in this list, so further contributions no longer help those credits.");
    }
    if (!hasRoom) {
      notes.push("No RRSP room was entered, so this list uses the 2025 RRSP dollar limit of $32,490 as a cap. Your personal room is on your CRA Notice of Assessment and may be higher because unused room carries forward.");
    }
    if (!isMb) {
      notes.push("Savings rates shown are federal. Provincial tax savings for " + ((root.BF.provinceName && root.BF.provinceName(p.province)) || p.province || "your province") + " would be extra.");
    }
    notes.push("Contributions in the first 60 days of 2026 count for the 2025 tax year.");
    notes.push("Unused RRSP room carries forward.");
    notes.push("You can contribute now and deduct the amount later, in a higher-income year.");
    notes.push("At lower income, an FHSA or a TFSA may leave you better off than an RRSP. This is general information, not personal advice.");

    return {
      taxYear: 2025,
      hasRoom: hasRoom,
      room: room,
      cap: cap,
      taxableIncomeAtZero: zero.taxableIncome,
      totalTaxAtZero: zero.totalTaxPayable,
      netBalanceAtZero: zero.netBalance,
      sweetSpot: sweetSpot,
      sweetSpotThreshold: targetThreshold,
      sweetSpotWithinCap: sweetSpot != null && sweetSpot > 0 && sweetSpot <= cap + 0.005,
      rateBeforePercent: rateNow,
      rateAfterPercent: rateAfter,
      alreadyBelowBpa: alreadyBelowBpa,
      taxAlreadyZero: taxAlreadyZero,
      taxZeroAt: taxZeroAt,
      steps: steps,
      notes: notes,
      isManitoba: isMb
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
