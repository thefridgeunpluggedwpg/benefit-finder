/* Eligibility matching and estimates. Only official amounts are used.
   If a precise number cannot be verified, the result is "amount varies". */
window.BF = window.BF || {};

BF.clampFeePercent = function (n) {
  var x = Number(n);
  if (!isFinite(x)) x = BF.DEFAULT_FEE_PERCENT;
  return Math.min(BF.MAX_FEE_PERCENT, Math.max(BF.MIN_FEE_PERCENT, x));
};

BF.isCouple = function (p) {
  return p.marital === "married" || p.marital === "common-law";
};

BF.childStats = function (p) {
  var kids = Array.isArray(p.children) ? p.children : [];
  var under6 = 0, age6to17 = 0, under18 = 0, under19 = 0, withDtc = 0, clbAge = 0, cesgAge = 0;
  kids.forEach(function (c) {
    var age = Number(c.age);
    if (!isFinite(age) || age < 0) return;
    if (age < 6) under6 += 1;
    if (age >= 6 && age <= 17) age6to17 += 1;
    if (age < 18) under18 += 1;
    if (age < 19) under19 += 1;
    if (age < 18 && c.hasDtc) withDtc += 1;
    if (age <= 15) clbAge += 1;
    if (age <= 17) cesgAge += 1;
  });
  return { under6: under6, age6to17: age6to17, under18: under18, under19: under19, withDtc: withDtc, clbAge: clbAge, cesgAge: cesgAge };
};

BF.householdSize = function (p) {
  return 1 + (BF.isCouple(p) ? 1 : 0) + BF.childStats(p).under18;
};

BF.hasDtcSelf = function (p) {
  return p.disability === "has-dtc";
};

BF.seekingDtc = function (p) {
  return p.disability === "yes-no-dtc";
};

BF.yearsInCanada = function (p) {
  if (p.livedInCanadaMostOfLife) return 40;
  var y = Number(p.yearsInCanadaAfter18);
  return isFinite(y) ? y : 0;
};

BF.ethnicityList = function (p) {
  var raw = p && p.ethnicity;
  if (Array.isArray(raw)) return raw.slice();
  if (raw) return [raw];
  return ["prefer-not"];
};

BF.hasEthnicity = function (p, id) {
  var list = BF.ethnicityList(p);
  if (list.indexOf("prefer-not") >= 0 || list.indexOf("not-listed") >= 0) return false;
  return list.indexOf(id) >= 0;
};

BF.indigenousId = function (p) {
  if (p && p.indigenous && p.indigenous !== "prefer-not" && p.indigenous !== "no" && p.indigenous !== "yes") return p.indigenous;
  if (BF.hasEthnicity(p, "first-nations")) return "first-nations";
  if (BF.hasEthnicity(p, "metis")) return "metis";
  if (BF.hasEthnicity(p, "inuit")) return "inuit";
  return (p && p.indigenous) || "prefer-not";
};

BF.isIndigenous = function (p) {
  var id = BF.indigenousId(p);
  return id === "first-nations" || id === "metis" || id === "inuit";
};

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

function skip(reason) {
  return { match: false, reason: reason };
}

function varies(extra) {
  return Object.assign({
    match: true,
    kind: "varies",
    amountCad: null,
    label: "Amount varies",
    note: ""
  }, extra || {});
}

function estimated(amount, extra) {
  return Object.assign({
    match: true,
    kind: "estimated",
    amountCad: money(amount),
    label: "Approximate estimate",
    note: ""
  }, extra || {});
}

function maximum(amount, extra) {
  return Object.assign({
    match: true,
    kind: "maximum",
    amountCad: money(amount),
    label: "Approximate maximum",
    note: "This is the official maximum, not a guarantee of what you will receive."
  }, extra || {});
}

BF.estimateProgram = function (program, profile) {
  var p = profile || {};
  var income = Number(p.householdIncome);
  if (!isFinite(income) || income < 0) income = 0;
  var work = Number(p.workingIncome);
  if (!isFinite(work) || work < 0) work = p.working ? income : 0;
  var kids = BF.childStats(p);
  var couple = BF.isCouple(p);
  var mb = p.province === "MB";
  var age = Number(p.age);
  if (!isFinite(age)) age = 0;
  var years = BF.yearsInCanada(p);
  var family = couple || kids.under18 > 0;
  var id = program.id;

  var JURISDICTION_CODE = {
    federal: null,
    manitoba: "MB",
    bc: "BC",
    "british-columbia": "BC",
    alberta: "AB",
    ontario: "ON",
    saskatchewan: "SK",
    "nova-scotia": "NS",
    "new-brunswick": "NB",
    "newfoundland-and-labrador": "NL",
    "prince-edward-island": "PE",
    quebec: "QC",
    yukon: "YT",
    "northwest-territories": "NT",
    nunavut: "NU"
  };
  if (program.jurisdiction && program.jurisdiction !== "federal") {
    var need = JURISDICTION_CODE[program.jurisdiction] || String(program.jurisdiction).toUpperCase();
    if (p.province !== need) {
      var needName = (BF.provinceName && BF.provinceName(need)) || need;
      return skip("This program is for residents of " + needName + ".");
    }
  }

  if (id === "ccb") {
    if (kids.under18 < 1) return skip("You need a child under 18 in your care.");
    var ccbMax = kids.under6 * 8157 + kids.age6to17 * 6883;
    var n = Math.min(kids.under18, 4);
    var r1 = { 1: 0.07, 2: 0.135, 3: 0.19, 4: 0.23 }[n];
    var fixed = { 1: 3123, 2: 6022, 3: 8476, 4: 10260 }[n];
    var r2 = { 1: 0.032, 2: 0.057, 3: 0.08, 4: 0.095 }[n];
    var reduction = 0;
    if (income > 38237 && income <= 82847) reduction = r1 * (income - 38237);
    else if (income > 82847) reduction = fixed + r2 * (income - 82847);
    var amt = Math.max(0, ccbMax - reduction);
    if (amt <= 0) return skip("At this income, the official reduction would bring the Canada Child Benefit to zero.");
    var note = "Official maximums for July 2026 – June 2027 are $8,157 per child under 6 and $6,883 per child aged 6 to 17. Reductions follow the published CRA percentages.";
    if (income <= 38237) return estimated(amt, { note: note + " Your income is under the $38,237 threshold, so the maximum is used." });
    return estimated(amt, { note: note + " Your income is over $38,237, so the official reduction formula was applied." });
  }

  if (id === "child-disability-benefit") {
    if (kids.withDtc < 1) return skip("This benefit is for a child who is eligible for the Disability Tax Credit.");
    if (income > 82847) return varies({ note: "Up to $3,480 ($290 a month) per eligible child for July 2026 – June 2027. The amount is reduced when adjusted family net income is over $82,847. A precise reduced amount is not calculated here." });
    return estimated(kids.withDtc * 3480, { note: "Official amount for July 2026 – June 2027: up to $3,480 ($290 a month) per child eligible for the Disability Tax Credit, when income is at or under $82,847." });
  }

  if (id === "cgeb") {
    if (age < 19 && !couple && kids.under19 < 1) return skip("This benefit is generally for people 19 or older, or for younger people who have a spouse, common-law partner, or child.");
    var cgeb = 445;
    if (couple) cgeb += 445;
    if (!couple && kids.under19 >= 1) {
      cgeb += 445;
      if (kids.under19 > 1) cgeb += 234 * (kids.under19 - 1);
    } else if (!couple && kids.under19 < 1) {
      if (income >= 11564) cgeb += 234;
    } else if (couple && kids.under19 > 0) {
      cgeb += 234 * kids.under19;
    }
    if (income > 46432) return varies({ note: "Official July 2026 – June 2027 amounts start at $445 per eligible adult, with published amounts for children and for single people. The official phase-out threshold is $46,432. Because the exact phase-out rate is not applied here, a dollar estimate is not shown at this income." });
    return estimated(cgeb, { note: "Official July 2026 – June 2027 (2025 base year) payment amounts from the CRA: $445 per eligible individual, $445 per eligible spouse, $234 per eligible child under 19, $445 for the first child in a single-parent family, and an additional $234 for an eligible single person (that additional amount phases in at $11,564 for a single person without children). Your income is at or under the $46,432 phase-out threshold, so the published full amount for your household type is used." });
  }

  if (id === "cwb") {
    if (!p.working && work < 3000) return skip("The Canada Workers Benefit requires working income (the official minimum working-income threshold is $3,000).");
    if (work < 3000) return skip("Working income is under the official $3,000 minimum threshold.");
    if (age < 19 && !couple && kids.under18 < 1) return skip("You must be 19 or older on December 31, or live with a spouse, common-law partner, or child.");
    var cwbMax = family ? 2869 : 1665;
    var phaseStart = family ? 31251 : 27392;
    if (income <= phaseStart && work >= 15000) {
      return estimated(cwbMax, { note: "Official 2026 maximums (CRA): $1,665 for a single person with no children, $2,869 for a family. The benefit begins to phase out at $27,392 (single, no children) or $31,251 (families). Your income is at or under that start point, and working income is high enough that a full phase-in is assumed. This is still approximate." });
    }
    if (income <= phaseStart) {
      return varies({ note: "You may qualify. The official 2026 maximum is $" + cwbMax.toLocaleString("en-CA") + ", but the benefit also phases in with working income. A precise amount is not shown because the official phase-in rate is not applied here." });
    }
    return varies({ note: "Income is above the official 2026 phase-out starting point ($" + phaseStart.toLocaleString("en-CA") + "). The benefit may be reduced or zero. Confirm with the CRA. Official maximums are $1,665 (single, no children) or $2,869 (family)." });
  }

  if (id === "cwb-disability") {
    if (!BF.hasDtcSelf(p)) return skip("The disability supplement requires an approved Disability Tax Credit certificate on file with the CRA.");
    if (work < 1150 && !p.working) return skip("The official minimum working-income threshold for the supplement is $1,150.");
    if (work < 1150) return skip("Working income is under the official $1,150 minimum threshold for the supplement.");
    var suppStart = family ? 50377 : 38495;
    if (income <= suppStart) return estimated(860, { note: "Official 2026 maximum disability supplement is $860. Phase-out starts at $38,495 (single, no children) or $50,377 (families)." });
    return varies({ note: "Income is above the official 2026 phase-out starting point for the supplement. The amount may be reduced or zero. Official maximum is $860." });
  }

  if (id === "dtc") {
    if (BF.hasDtcSelf(p) || kids.withDtc > 0) return skip("You already indicated an approved Disability Tax Credit. No new application is listed.");
    if (!BF.seekingDtc(p)) return skip("Only listed when you say you have a disability and have not yet been approved for the Disability Tax Credit.");
    return varies({ note: "The Disability Tax Credit is a non-refundable credit. What you actually save depends on tax payable and on provincial credits, so no dollar amount is shown. A medical practitioner must complete Form T2201." });
  }

  if (id === "oas") {
    if (age < 65) return skip("Old Age Security starts at age 65.");
    if (years < 10) return skip("A pension generally requires at least 10 years of residence in Canada after age 18 (some international agreements can change this — check with Service Canada).");
    var oasMax = (age >= 75 ? 838.75 : 762.50) * 12;
    var oasStop = age >= 75 ? 157923 : 152062;
    if (income >= oasStop) return skip("Income appears at or above the official October–December 2026 cutoff for a full OAS pension ($" + oasStop.toLocaleString("en-CA") + " of 2025 net world income).");
    if (years < 40 && !p.livedInCanadaMostOfLife) {
      return varies({ note: "A partial pension applies if you lived in Canada for at least 10 years but less than 40 years after age 18. Official October–December 2026 maximums for a full pension are $762.50 a month (ages 65–74) or $838.75 a month (age 75+). Use the official OAS estimator for a partial amount." });
    }
    if (income >= 93454) {
      return varies({ note: "A recovery tax applies when 2025 net world income is over $93,454. Official maximum monthly payments (October–December 2026) are $762.50 (ages 65–74) or $838.75 (age 75+). A reduced amount is not calculated here." });
    }
    return estimated(oasMax, { note: "Official October–December 2026 maximum monthly payment of $" + (age >= 75 ? "838.75" : "762.50") + ", times 12, for a full pension (40 years in Canada after age 18) when income is under the $93,454 recovery-tax threshold. Rates change every quarter." });
  }

  if (id === "gis") {
    if (age < 65) return skip("The Guaranteed Income Supplement is for people 65 and older who receive OAS.");
    if (years < 10) return skip("You generally need to qualify for OAS first, which usually requires at least 10 years in Canada after age 18.");
    if (couple) {
      if (income >= 55392) return skip("Combined income appears at or above the official October–December 2026 GIS cutoff for a couple when the spouse does not receive OAS or the Allowance ($55,392). Other couple cutoffs are lower.");
      return varies({ note: "Official October–December 2026 maximums: $1,138.90 a month (single, or a couple when the spouse does not receive OAS or the Allowance) or $685.56 a month when the spouse receives a full OAS pension or the Allowance. Cutoffs depend on your spouse's benefits. Use the official OAS estimator." });
    }
    if (income >= 23112) return skip("Income appears at or above the official October–December 2026 cutoff for a single GIS recipient ($23,112).");
    return maximum(1138.90 * 12, { note: "Official October–December 2026 maximum for a single, widowed, or divorced person is $1,138.90 a month, if annual income is under $23,112. The actual amount is reduced as income rises. Use the official OAS estimator." });
  }

  if (id === "allowance") {
    if (age < 60 || age > 64) return skip("The Allowance is for people aged 60 to 64.");
    if (!couple) return skip("The Allowance is for a person whose spouse or common-law partner receives the Guaranteed Income Supplement.");
    if (!p.spouseReceivesGis) return skip("Listed only when your spouse or common-law partner receives the Guaranteed Income Supplement.");
    if (years < 10) return skip("You generally need to have lived in Canada for at least 10 years after age 18.");
    return varies({ note: "Payment amounts depend on combined income and are set out in the official OAS payment tables. Use the official estimator or Service Canada." });
  }

  if (id === "allowance-survivor") {
    if (age < 60 || age > 64) return skip("The Allowance for the Survivor is for people aged 60 to 64.");
    if (p.marital !== "widowed") return skip("This benefit is for a person whose spouse or common-law partner has died and who has not remarried or entered a new common-law relationship.");
    if (years < 10) return skip("You generally need to have lived in Canada for at least 10 years after age 18.");
    return varies({ note: "Payment amounts depend on your income and are set out in the official OAS payment tables. Use the official estimator or Service Canada." });
  }

  if (id === "canada-disability-benefit") {
    if (age < 18 || age >= 65) return skip("The Canada Disability Benefit is for people aged 18 to 64 (limited back-pay rules apply around those ages).");
    if (!BF.hasDtcSelf(p) && !BF.seekingDtc(p)) return skip("You must be approved for the Disability Tax Credit.");
    if (!BF.hasDtcSelf(p)) return varies({ note: "You can apply for the Canada Disability Benefit once the Disability Tax Credit is approved. Official maximum for July 2026 – June 2027 is $204.20 a month, based on 2025 income. A dollar amount is not shown until the DTC is approved." });
    return maximum(204.20 * 12, { note: "Official maximum for July 2026 – June 2027 is $204.20 a month ($2,450.40 a year), based on 2025 adjusted family net income. Income reduces the payment above a threshold; a precise reduced amount is not calculated here. A $150 supplemental payment related to the cost of obtaining the DTC may also apply — see the official page." });
  }

  if (id === "cdcp") {
    if (p.dentalInsurance) return skip("You are not eligible if you have access to private dental insurance or coverage.");
    if (income >= 90000) return skip("Adjusted family net income must be under $90,000.");
    return varies({ note: "This is dental coverage, not a cash benefit. Official eligibility includes no access to private dental insurance, a filed tax return, adjusted family net income under $90,000, and Canadian tax residency." });
  }

  if (id === "clb") {
    if (kids.clbAge < 1) return skip("The Canada Learning Bond is for eligible children (amounts accumulate until the year the child turns 15).");
    var clbLimit = 58523;
    if (kids.under18 === 4) clbLimit = 66035.99;
    else if (kids.under18 === 5) clbLimit = 73576.99;
    else if (kids.under18 >= 6) clbLimit = 81116.99;
    if (income > clbLimit && kids.under18 <= 5) return skip("Adjusted family income appears above the official July 2026 – June 2027 Canada Learning Bond bracket for this number of children.");
    if (income > clbLimit) return varies({ note: "Larger families can have higher income brackets. Confirm eligibility on the official page." });
    var per = p.hasResp ? 100 : 500;
    var clbAmt = per * kids.clbAge;
    var clbNote = p.hasResp
      ? "Official amounts: $500 in the first eligible year in an RESP, then $100 each eligible year up to and including age 15, to a lifetime maximum of $2,000. Because an RESP already exists, this estimate uses the $100 subsequent-year amount per eligible child, which is approximate if the first-year $500 has not yet been paid."
      : "Official amounts: $500 in the first eligible year in an RESP, then $100 each eligible year, to a lifetime maximum of $2,000. This estimate uses the $500 first-year amount per eligible child, assuming the bond has not already been paid. You still need to open an RESP. No personal contribution is required.";
    return estimated(clbAmt, { note: clbNote });
  }

  if (id === "cesg") {
    if (kids.cesgAge < 1) return skip("The CESG is available until the end of the calendar year a child turns 17, and only when a contribution is made to an RESP.");
    var extra = "none";
    if (income <= 58523) extra = "up to another $100 (20% of the first $500 contributed)";
    else if (income <= 117045) extra = "up to another $50 (10% of the first $500 contributed)";
    return varies({ note: "Official 2026 basic CESG is 20% of the first $2,500 contributed (up to $500 a year), plus " + extra + " depending on income. Lifetime maximum $7,200 per beneficiary. The amount depends on contributions, so no dollar estimate is added to your total." });
  }

  if (id === "cdsg") {
    if (!BF.hasDtcSelf(p) && kids.withDtc < 1 && !BF.seekingDtc(p)) return skip("A Registered Disability Savings Plan, and this grant, require Disability Tax Credit eligibility.");
    return varies({ note: "Grant amounts depend on contributions and family income. No dollar estimate is shown." });
  }

  if (id === "rent-assist") {
    if (!mb) return skip("Rent Assist is a Manitoba program.");
    if (p.housing !== "rent") return skip("This benefit is for renters.");
    if (p.receivesEia) return skip("This listing is for the non-EIA Rent Assist stream. If you receive Employment and Income Assistance, shelter support is handled through that program instead.");
    var size = BF.householdSize(p);
    var selfDtc = BF.hasDtcSelf(p);
    var single = size === 1;
    var twoAdults = size === 2 && kids.under18 === 0;
    var twoWithChild = size === 2 && kids.under18 > 0;
    var threshold, maxMo;
    if (single && age < 55 && !selfDtc) { threshold = 29120; maxMo = 728; }
    else if (single) { threshold = 33920; maxMo = 848; }
    else if (twoAdults) { threshold = 38720; maxMo = 968; }
    else if (twoWithChild || size === 3 || size === 4) { threshold = 50240; maxMo = 1256; }
    else { threshold = 60768; maxMo = 1519; }
    if (income >= threshold) return skip("Household net income appears at or above the official July 2026 threshold for your household type ($" + threshold.toLocaleString("en-CA") + ").");
    return maximum(maxMo * 12, { note: "Official maximum monthly shelter assistance from Manitoba Regulation 51/2026 (from July 2026) is $" + maxMo.toLocaleString("en-CA") + " for this household type, if net income is under $" + threshold.toLocaleString("en-CA") + ". Your actual payment depends on rent and income and is often lower than the maximum." });
  }

  if (id === "manitoba-child-benefit") {
    if (!mb) return skip("This is a Manitoba program.");
    if (kids.under18 < 1) return skip("You need a dependent child under 18.");
    if (p.receivesEia) return skip("You generally cannot receive this benefit while on Employment and Income Assistance (except the health-benefits-only portion).");
    if (income > 20000) return skip("Official materials describe full benefits at $15,000 or less and partial benefits between $15,000 and $20,000 (example family). Income appears above that range. Confirm the official income table for your family size.");
    if (income > 15000) return varies({ note: "Official materials say low-income families may be eligible for up to $35 a month ($420 a year) per child, with partial benefits between $15,000 and $20,000. A precise partial amount is not shown." });
    return estimated(kids.under18 * 420, { note: "Official materials: up to $35 a month ($420 a year) per child when income is $15,000 or less. The published example is a single parent of three children; confirm the official table for your family." });
  }

  if (id === "hatc") {
    if (!mb) return skip("This is a Manitoba program.");
    if (p.housing !== "own") return skip("This credit is for a principal residence you own in Manitoba. Renters may use the Renters Affordability Tax Credit instead.");
    return maximum(1600, { note: "For the 2026 tax year the official maximum Homeowners Affordability Tax Credit is $1,600, or the gross school taxes on your principal residence, whichever is less. Because school taxes are not entered here, the maximum is shown." });
  }

  if (id === "ratc") {
    if (!mb) return skip("This is a Manitoba program.");
    if (p.housing !== "rent") return skip("This credit is for renters. Homeowners may use the Homeowners Affordability Tax Credit instead.");
    var ratc = 625 + (age >= 65 ? 357 : 0);
    var ratcNote = "Manitoba Budget 2026: maximum Renters Affordability Tax Credit for the 2026 tax year is $625, and the maximum seniors' top-up is $357. The actual credit can be lower. Claimed on the tax return.";
    return maximum(ratc, { note: ratcNote });
  }

  if (id === "seniors-school-tax-rebate") {
    if (!mb) return skip("This is a Manitoba program.");
    if (p.housing !== "own") return skip("This rebate is for a senior's principal residence.");
    if (age < 65) return skip("Listed for seniors (age 65 or older).");
    var rebate = Math.max(0, 235 - Math.max(0, income - 40000) * 0.01);
    if (rebate <= 0) return skip("At this income the official formula ($235 minus 1.0% of family net income over $40,000) would be zero.");
    return estimated(rebate, { note: "Official Manitoba formula as published: $235 minus 1.0% of family net annual income over $40,000, for a principal residence, claimed on the tax return." });
  }

  if (id === "fifty-five-plus") {
    if (!mb) return skip("This is a Manitoba program.");
    if (age < 55) return skip("You must be 55 or older.");
    if (p.receivesEia) return skip("People who receive Employment and Income Assistance are not eligible (except the health-benefits-only portion).");
    var q = couple ? 173.90 : 161.80;
    var juniorLimit = couple ? 16255.20 : 9746.40;
    if (age < 65 && income > juniorLimit) {
      return skip("For people who do not yet receive OAS, official junior-component materials describe partial benefits up to $" + juniorLimit.toLocaleString("en-CA") + " of income. Income appears above that range.");
    }
    if (age >= 65 && income > 23112 && !couple) return skip("Income appears above the range where a single GIS-related supplement is likely. Confirm with the 55 PLUS office; OAS recipients are often assessed automatically.");
    if (age >= 65 && couple && income > 30528) return varies({ note: "If you receive OAS, eligibility is often determined automatically from your GIS or Allowance. Official maximum quarterly benefits are $161.80 (single) or $173.90 for each eligible person in a couple. Confirm with official materials." });
    return maximum(q * 4, { note: "Official maximum quarterly benefits are $161.80 for a single person and $173.90 for each eligible person in a married or common-law relationship, paid four times a year. The actual amount depends on income. This figure is four times the maximum quarterly payment for one person." });
  }

  if (id === "prenatal") {
    if (!mb) return skip("This is a Manitoba program.");
    if (!p.pregnant) return skip("This benefit is for eligible pregnant people.");
    if (income >= 32000) return skip("Official materials describe eligibility when net family income is below $32,000.");
    return maximum(162.82 * 6, { note: "Official program materials describe a maximum of $162.82 per month, with the exact amount based on income, and payments for up to six months when you apply during pregnancy. This figure is six times the monthly maximum and is not a guarantee." });
  }

  if (id === "canada-student-grant") {
    if (!p.student) return skip("Listed when you are a student in an eligible post-secondary program.");
    return varies({ note: "Grant amounts depend on your situation and the type of grant. Apply through Manitoba Student Aid if you live in Manitoba, or through the student-aid office for your province." });
  }

  if (id === "nihb") {
    var ind = BF.indigenousId(p);
    if (ind !== "first-nations" && ind !== "inuit") {
      return skip("This program is for eligible First Nations and Inuit people. It is only listed if you choose that identity. The question is optional.");
    }
    return varies({ note: "This is health-benefits coverage, not a cash payment. Confirm eligibility on the official Non-Insured Health Benefits page." });
  }

  if (id === "wes-loan-fund") {
    if (p.gender !== "woman") return skip("This loan fund is for women entrepreneurs. It is only listed if you choose Female.");
    if (!p.businessOwner) return skip("Listed when you own a business or are starting one.");
    return maximum(50000, { excludeFromTotal: true, note: "Official maximum is a loan of up to $50,000 to start or grow a business. This is a loan, not a grant, so it is not included in the dollar total. Apply through a delivery organization listed on the official ISED page. In Manitoba those partners include WEOC (WECM), Nventure, and NACCA for Indigenous entrepreneurs. Those organizations are currently accepting applications." });
  }

  if (id === "wes-business-support") {
    if (p.gender !== "woman") return skip("Women Entrepreneurship Strategy business support is listed if you choose Female.");
    if (!p.businessOwner) return skip("Listed when you own a business or are starting one.");
    return varies({ note: "This is training, mentorship, and networks funded through the Women Entrepreneurship Strategy, not a cash payment to you. Use the official WES page to find a participating organization." });
  }

  if (id === "mb-women-trades") {
    if (p.gender !== "woman") return skip("These Manitoba supports are for women in the trades. They are only listed if you choose Female.");
    if (!p.tradesApprentice) return skip("Listed when you are a trades apprentice or looking at a skilled trade.");
    if (!mb) return skip("These supports are described by Apprenticeship Manitoba.");
    return varies({ note: "Official Apprenticeship Manitoba supports include the Office to Advance Women Apprentices and LauncHER into Trades. These are services, not a fixed cash benefit." });
  }

  if (id === "mb-gbv-supports") {
    if (p.gender !== "woman") return skip("These shelter and transition supports are listed if you choose Female. Official materials also say shelters can help find a safe place for men; this catalog does not treat that as a separate men-only program.");
    if (!mb) return skip("This is a Manitoba program.");
    return varies({ note: "This is a support service (shelters, resource centres, and second-stage housing), not a cash benefit. Use the official resources page for current local services. Information you enter stays on this device." });
  }

  if (id === "ei-maternity") {
    if (!p.pregnant) return skip("Employment Insurance maternity benefits are for a person who is pregnant or has recently given birth.");
    if (p.province === "QC") return skip("Quebec residents use the Québec Parental Insurance Plan, not federal EI maternity benefits.");
    var eiNote = "Official rates (page updated 22 October 2026): up to 15 weeks at 55% of average weekly earnings, to a maximum of $729 a week. You generally need 600 insured hours in the qualifying period, and earnings must drop by more than 40% for at least one week. Official rules say these benefits are available to eligible people regardless of gender identity.";
    if (work > 0) {
      var weekly = Math.min(729, 0.55 * (work / 52));
      return estimated(weekly * 15, { note: eiNote + " This estimate uses 55% of the working income you entered, capped at the official weekly maximum, times 15 weeks. It does not check your insured hours." });
    }
    return varies({ note: eiNote + " A personal dollar estimate is not shown without working income. The official weekly maximum times 15 weeks would be $10,935, and only applies at the cap." });
  }

  if (id === "bep-loan-fund") {
    if (!BF.hasEthnicity(p, "black")) return skip("The Black Entrepreneurship Loan Fund is for Black entrepreneurs and majority Black-owned businesses. It is only listed if you choose Black.");
    if (age < 18) return skip("Official eligibility requires you to be at least 18.");
    if (!p.businessOwner) return skip("Listed when you own a business or are starting one.");
    return maximum(250000, { excludeFromTotal: true, note: "Official materials describe loans of up to $250,000, delivered by FACE in partnership with BDC. The former microloan pilot ($10,000–$25,000) ended 31 March 2025. This is a loan, not a grant, so it is not included in the dollar total." });
  }

  if (id === "ircc-settlement") {
    if (!p.newcomer && p.residency !== "pr" && p.residency !== "protected" && p.residency !== "temporary") {
      return skip("IRCC-funded settlement services are for eligible newcomers (permanent residents, protected persons, and certain temporary residents). Canadian citizens are not eligible.");
    }
    if (p.residency === "citizen") return skip("Canadian citizens are not eligible for IRCC-funded settlement services.");
    return varies({ note: "These are free support services (language training, employment help, and community connections), not a cash payment. Starting 1 April 2026, economic-class permanent residents generally have a time-limited window. Use the official IRCC service finder." });
  }

  if (id === "psssp") {
    if (BF.indigenousId(p) !== "first-nations") return skip("The Post-Secondary Student Support Program is for eligible First Nations students. Inuit and Métis students should ask about the Inuit and Métis Nation Post-Secondary Education Strategies.");
    if (!p.student) return skip("Listed when you are a student in an eligible post-secondary program.");
    return varies({ note: "Amounts are set by your First Nation or designated education organization, so no dollar estimate is shown. Contact that organization to apply." });
  }

  if (id === "home-buyers-amount") {
    if (p.housing !== "own") return skip("Listed if you own your principal residence and bought a qualifying home in 2025 as a first-time buyer, or for a person eligible for the Disability Tax Credit.");
    return varies({ note: "You may claim up to $10,000 on line 31270 for a qualifying 2025 home purchase if you are a first-time buyer, or if the home is for a person eligible for the Disability Tax Credit. This is a non-refundable credit, so no cash amount is added to your total." });
  }

  if (id === "mhrtc") {
    if (p.housing !== "own") return skip("This credit is for a qualifying renovation to a home you own.");
    return varies({ note: "If you completed a qualifying renovation to create a self-contained secondary unit for a senior or an adult eligible for the Disability Tax Credit, you can claim 14.5% of up to $50,000 of eligible expenses (maximum $7,250) on line 45355. A dollar amount is shown only if you have qualifying expenses." });
  }

  if (id === "canada-caregiver-amount") {
    var infirmChild = (p.children || []).some(function (c) { return c && c.hasDtc; });
    if (!infirmChild && !BF.hasDtcSelf(p) && !BF.seekingDtc(p)) return skip("Listed if you support a spouse, partner, or dependant with a physical or mental impairment.");
    return varies({ note: "The Canada caregiver amount is a non-refundable credit. The official amount depends on who you support and their net income, so no dollar estimate is shown. See lines 30425, 30450, and 30500." });
  }

  if (id === "student-loan-interest") {
    if (!p.student) return skip("Listed if you are a student and may have paid interest on a qualifying student loan.");
    return varies({ note: "You can claim interest paid in 2025 on a qualifying Canada Student Loan or provincial student loan on line 31900. This is a non-refundable credit, so no cash amount is added to your total." });
  }

  if (id === "cpp-disability") {
    if (age >= 65) return skip("CPP disability benefits end at age 65, when they convert to a CPP retirement pension.");
    if (p.province === "QC") return skip("Quebec residents apply for the Quebec Pension Plan disability benefit, not the federal CPP disability benefit.");
    if (p.disability !== "has-dtc" && p.disability !== "yes-no-dtc") return skip("Listed if you have a severe and prolonged disability and have made enough CPP contributions.");
    return varies({ note: "Official 2025 maximum monthly amounts rose from $1,673.24 in January to $1,685.61 in December. Your payment depends on your CPP contributions, so no personal dollar estimate is shown. Apply through Service Canada." });
  }

  if (id === "ei-regular") {
    var workEntered = p.workingIncome !== "" && p.workingIncome != null && isFinite(Number(p.workingIncome));
    if (p.working || !workEntered || Number(p.workingIncome) > 0) return skip("Employment Insurance regular benefits are listed when you are not working and you entered $0 working income.");
    if (age < 15 || age >= 71) return skip("Listed when you may be in the usual working-age range and are not currently working.");
    return varies({ note: "If you lost your job through no fault of your own and have enough insurable hours, apply through Service Canada. The weekly amount depends on your insurable earnings, so no dollar estimate is shown." });
  }

  if (id === "northern-residents") {
    if (["YT", "NT", "NU"].indexOf(p.province) < 0) return skip("Listed automatically for residents of Yukon, the Northwest Territories, or Nunavut. Some prescribed northern or intermediate zones in the provinces also qualify — use Form T2222 if that applies.");
    return varies({ note: "If you lived in a prescribed zone for at least six consecutive months, complete Form T2222 and claim the deduction on line 25500. The residency and travel amounts depend on your zone and trips, so no dollar estimate is shown." });
  }

  if (id === "home-accessibility") {
    if (p.housing !== "own") return skip("This credit is for eligible renovations to a qualifying home.");
    if (age < 65 && !BF.hasDtcSelf(p) && !BF.seekingDtc(p) && !(p.children || []).some(function (c) { return c && c.hasDtc; })) return skip("A qualifying person must be 65 or older or eligible for the Disability Tax Credit.");
    return varies({ note: "Eligible renovation expenses that improve accessibility may qualify for the home accessibility tax credit on line 31285. Official limits are on the CRA page, so no dollar estimate is invented here." });
  }

  if (id === "fhsa-account") {
    if (p.housing === "own") return skip("An FHSA is generally for qualifying first-time home buyers.");
    if (age < 18 || age > 71) return skip("You generally must be a resident of Canada and at least 18 to open an FHSA.");
    return varies({ note: "The official 2025 FHSA annual contribution limit is $8,000, with a $40,000 lifetime limit. Contributions may be deductible on line 20805. This is not a government cash payment, so it is not added to your total." });
  }

  if (id === "bc-renters-tax-credit") {
    if (p.housing !== "rent") return skip("This credit is for people who rented an eligible home in B.C.");
    if (age < 19 && !couple && kids.under18 < 1) return skip("You must be 19 or older, a parent, or living with a spouse or common-law partner.");
    var rtc = Math.max(0, Math.round((400 - 0.02 * Math.max(0, income - 64764)) * 100) / 100);
    if (rtc <= 0) return skip("At this income the official 2025 formula (up to $400, reduced by 2% of adjusted income over $64,764) would be zero at $84,764.");
    return estimated(rtc, { note: "Official 2025 B.C. renter's tax credit: up to $400, reduced by 2% of adjusted income over $64,764, and zero at $84,764. Claimed on Form BC479. Amount of rent paid does not change the credit." });
  }

  if (id === "ab-child-family-benefit") {
    if (kids.under18 < 1) return skip("This benefit is for families with a child under 18.");
    var acfbMax = ({ 1: 1499 + 767, 2: 2248 + 1465, 3: 2997 + 1883 }[Math.min(kids.under18, 4)] || (3746 + 2021));
    return varies({ note: "Official Alberta maximums for July 2025 to June 2026 are $1,499 base plus $767 working (1 child), up to $3,746 plus $2,021 (4 or more children). Your payment depends on family net income and working income, so no personal dollar estimate is shown. The CRA calculates it when you file. Combined maximum at this family size would be up to $" + acfbMax.toLocaleString("en-CA") + "." });
  }

  if (id === "on-trillium") {
    return varies({ note: "The Ontario Trillium Benefit can include the Ontario sales tax credit, the Ontario energy and property tax credit, and the Northern Ontario energy credit. Amounts depend on income, family size, rent or property tax, and whether you live in Northern Ontario, so no dollar estimate is invented here. File your return and Form ON-BEN if it applies." });
  }

  return skip("No matching rule is defined for this program.");
};

BF.matchAll = function (profile) {
  return BF.PROGRAMS.map(function (program) {
    var est = BF.estimateProgram(program, profile);
    return { program: program, estimate: est };
  });
};

BF.programType = function (program) {
  if (program && program.type) return program.type;
  var id = program && program.id;
  if (["hatc", "ratc", "seniors-school-tax-rebate", "dtc"].indexOf(id) >= 0) return "tax credit";
  if (["clb", "cesg", "cdsg", "canada-student-grant", "psssp"].indexOf(id) >= 0) return "grant";
  if (["cdcp", "nihb"].indexOf(id) >= 0) return "coverage";
  if (id === "bep-loan-fund") return "loan";
  if (id === "ircc-settlement") return "support service";
  return "benefit";
};

BF.typeLabel = function (type) {
  return ({
    benefit: "Benefit",
    "tax credit": "Tax credit",
    grant: "Grant",
    loan: "Loan",
    "support service": "Support service",
    coverage: "Coverage"
  })[type] || type;
};

BF.inCashTotal = function (program, estimate) {
  if (!estimate || !estimate.match) return false;
  if (estimate.excludeFromTotal) return false;
  if (program && (program.excludeFromTotal || program.notCash)) return false;
  var t = BF.programType(program);
  if (t === "loan" || t === "support service" || t === "coverage") return false;
  if (estimate.kind === "varies" || estimate.amountCad == null) return false;
  return true;
};

BF.totals = function (matches, opts) {
  opts = opts || {};
  var skip = opts.skipIds || [];
  var cash = 0;
  var hasVaries = false;
  var hasLoans = false;
  var matched = [];
  var already = [];
  matches.forEach(function (m) {
    if (!m.estimate.match) return;
    if (skip.indexOf(m.program.id) >= 0) {
      already.push(m);
      return;
    }
    matched.push(m);
    if (BF.programType(m.program) === "loan") hasLoans = true;
    if (!BF.inCashTotal(m.program, m.estimate)) {
      if (m.estimate.kind === "varies" || m.estimate.amountCad == null) hasVaries = true;
      return;
    }
    cash += m.estimate.amountCad;
  });
  return { cash: money(cash), hasVaries: hasVaries, hasLoans: hasLoans, matched: matched, alreadyReceiving: already };
};

BF.feeBaseAmount = function (amountCad, program) {
  if (program && (program.dtcContingent || program.feeCapped)) return 0;
  if (program && (program.excludeFromTotal || program.notCash || BF.programType(program) === "loan")) return 0;
  if (amountCad == null || !isFinite(amountCad)) return 0;
  return amountCad;
};

BF.computeFees = function (items, settings) {
  settings = settings || {};
  var rate = BF.clampFeePercent(settings.feePercent) / 100;
  var refRate = Math.max(0, Number(settings.referralPercent != null ? settings.referralPercent : BF.DEFAULT_REFERRAL_PERCENT)) / 100;
  var cap = BF.DTC_FEE_CAP_CAD;
  var baseFound = 0;
  var dtcFound = 0;
  var dtcItems = 0;
  (items || []).forEach(function (it) {
    var amt = Number(it.amountCad);
    if (!isFinite(amt)) amt = 0;
    if (it.dtcContingent || it.feeCapped) {
      dtcFound += amt;
      dtcItems += 1;
    } else {
      baseFound += amt;
    }
  });
  var percentFee = money(baseFound * rate);
  return {
    baseFound: money(baseFound),
    dtcFound: money(dtcFound),
    dtcItems: dtcItems,
    percentFee: percentFee,
    dtcCapCad: cap,
    dtcFeeIncluded: 0,
    referralCredit: money(baseFound * refRate),
    feePercent: BF.clampFeePercent(settings.feePercent),
    referralPercent: Math.max(0, Number(settings.referralPercent != null ? settings.referralPercent : BF.DEFAULT_REFERRAL_PERCENT))
  };
};
