/* 2025 provincial and territorial income tax, for use on top of the federal
   estimate. Brackets: CRA last-year rates page (2025 tax year).
   https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html
   Basic personal amounts: CRA line 30000 / 58040 page for 2025.
   https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-30000-basic-personal-amount.html
   Non-refundable credit rate is the lowest provincial/territorial rate
   (T4127: K1P uses the lowest tax rate of the province or territory).
   Manitoba keeps the existing engine in tax.js (indexation pause at
   $47,000 / $100,000). Quebec provincial tax is not calculated here. */
(function (root) {
  "use strict";
  root.BF = root.BF || {};

  function r2(n) {
    var v = Number(n) || 0;
    return Math.round(v * 100 + (v >= 0 ? 1e-9 : -1e-9)) / 100;
  }

  /* [low, high, rate] */
  var DATA = {
    AB: {
      brackets: [[0, 60000, 0.08], [60000, 151234, 0.10], [151234, 181481, 0.12], [181481, 241974, 0.13], [241974, 362961, 0.14], [362961, Infinity, 0.15]],
      bpa: 22323,
      creditRate: 0.08,
      source: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html"
    },
    BC: {
      brackets: [[0, 49279, 0.0506], [49279, 98560, 0.077], [98560, 113158, 0.105], [113158, 137407, 0.1229], [137407, 186306, 0.147], [186306, 259829, 0.168], [259829, Infinity, 0.205]],
      bpa: 12932,
      creditRate: 0.0506,
      source: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html"
    },
    MB: {
      brackets: [[0, 47000, 0.108], [47000, 100000, 0.1275], [100000, Infinity, 0.174]],
      bpa: 15780,
      creditRate: 0.108,
      source: "https://www.gov.mb.ca/finance/personal/ptaxes.html"
    },
    NB: {
      brackets: [[0, 51306, 0.094], [51306, 102614, 0.14], [102614, 190060, 0.16], [190060, Infinity, 0.195]],
      bpa: 13396,
      creditRate: 0.094,
      source: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html"
    },
    NL: {
      brackets: [[0, 44192, 0.087], [44192, 88382, 0.145], [88382, 157792, 0.158], [157792, 220910, 0.178], [220910, 282214, 0.198], [282214, 564429, 0.208], [564429, 1128858, 0.213], [1128858, Infinity, 0.218]],
      bpa: 11067,
      creditRate: 0.087,
      source: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html"
    },
    NS: {
      brackets: [[0, 30507, 0.0879], [30507, 61015, 0.1495], [61015, 95883, 0.1667], [95883, 154650, 0.175], [154650, Infinity, 0.21]],
      bpa: 11744,
      creditRate: 0.0879,
      source: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html"
    },
    NT: {
      brackets: [[0, 51964, 0.059], [51964, 103930, 0.086], [103930, 168967, 0.122], [168967, Infinity, 0.1405]],
      bpa: 17842,
      creditRate: 0.059,
      source: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html"
    },
    NU: {
      brackets: [[0, 54707, 0.04], [54707, 109413, 0.07], [109413, 177881, 0.09], [177881, Infinity, 0.115]],
      bpa: 19274,
      creditRate: 0.04,
      source: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html"
    },
    ON: {
      brackets: [[0, 52886, 0.0505], [52886, 105775, 0.0915], [105775, 150000, 0.1116], [150000, 220000, 0.1216], [220000, Infinity, 0.1316]],
      bpa: 12747,
      creditRate: 0.0505,
      spouse: 11905,
      surtax: [[5710, 0.20], [7307, 0.36]],
      taxReduction: { basic: 294, dependantUnder18: 544 },
      healthPremium: true,
      source: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables-previous-years/t4032on-july-2025/t4032on-july-general-information.html"
    },
    PE: {
      brackets: [[0, 33328, 0.095], [33328, 64656, 0.1347], [64656, 105000, 0.166], [105000, 140000, 0.1762], [140000, Infinity, 0.19]],
      bpa: 14650,
      creditRate: 0.095,
      source: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html"
    },
    SK: {
      brackets: [[0, 53463, 0.105], [53463, 152750, 0.125], [152750, Infinity, 0.145]],
      bpa: 19491,
      creditRate: 0.105,
      source: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html"
    },
    YT: {
      brackets: [[0, 57375, 0.064], [57375, 114750, 0.09], [114750, 177882, 0.109], [177882, 500000, 0.128], [500000, Infinity, 0.15]],
      bpaFederal: true,
      bpa: 16129,
      creditRate: 0.064,
      source: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/last-year.html"
    }
  };

  function calcProgressive(taxable, brackets) {
    var tax = 0;
    var marginal = brackets[0][2];
    for (var i = 0; i < brackets.length; i++) {
      var low = brackets[i][0];
      var high = brackets[i][1];
      var rate = brackets[i][2];
      if (taxable > low) {
        tax += (Math.min(taxable, high) - low) * rate;
        marginal = rate;
      }
    }
    return { tax: r2(tax), marginalRate: marginal };
  }

  root.BF.PROVINCIAL_TAX_2025 = DATA;

  root.BF.provincialThresholds = function (code) {
    var d = DATA[code];
    if (!d) return [];
    return d.brackets.map(function (b) { return b[1]; }).filter(function (h) { return isFinite(h); });
  };

  root.BF.provincialMarginalRate = function (code, taxable) {
    var d = DATA[code];
    if (!d) return 0;
    return calcProgressive(Math.max(0, Number(taxable) || 0), d.brackets).marginalRate;
  };

  /* Official 2025 Ontario health premium (T4032-ON July 2025). */
  function ontarioHealthPremium(taxable) {
    if (taxable <= 20000) return 0;
    if (taxable <= 36000) return r2(Math.min(300, 0.06 * (taxable - 20000)));
    if (taxable <= 48000) return r2(Math.min(450, 300 + 0.06 * (taxable - 36000)));
    if (taxable <= 72000) return r2(Math.min(600, 450 + 0.25 * (taxable - 48000)));
    if (taxable <= 200000) return r2(Math.min(750, 600 + 0.25 * (taxable - 72000)));
    return r2(Math.min(900, 750 + 0.25 * (taxable - 200000)));
  }

  /* Basic provincial tax after BPA and CPP/EI credits. Ontario surtax, health
     premium, and tax reduction are applied where official 2025 figures exist.
     Spouse amount included only where an official 2025 figure is on the record (ON). */
  root.BF.provincialBasicTax = function (code, taxableIncome, opts) {
    opts = opts || {};
    var d = DATA[code];
    if (!d) return null;
    var taxable = Math.max(0, Number(taxableIncome) || 0);
    var gross = calcProgressive(taxable, d.brackets);
    var bpa = d.bpa;
    if (d.bpaFederal && typeof opts.federalBpa === "number") bpa = opts.federalBpa;
    var creditBase = bpa;
    var cpp = Number(opts.cppBase) || 0;
    var ei = Number(opts.ei) || 0;
    creditBase += Math.max(0, cpp) + Math.max(0, ei);
    if (d.spouse && opts.couple && typeof opts.spouseIncome === "number" && opts.spouseIncome < d.spouse) {
      creditBase += d.spouse - opts.spouseIncome;
    } else if (d.spouse && opts.singleWithChild) {
      creditBase += d.spouse;
    }
    var credits = r2(creditBase * d.creditRate);
    var basic = Math.max(0, r2(gross.tax - credits));
    if (d.surtax && d.surtax.length) {
      var sur = 0;
      for (var i = 0; i < d.surtax.length; i++) {
        sur += Math.max(0, basic - d.surtax[i][0]) * d.surtax[i][1];
      }
      basic = r2(basic + sur);
    }
    var health = 0;
    if (d.healthPremium) {
      health = ontarioHealthPremium(taxable);
    }
    var reduction = 0;
    if (d.taxReduction) {
      var personal = d.taxReduction.basic;
      var kidsU18 = Number(opts.dependantsUnder18) || 0;
      personal += (d.taxReduction.dependantUnder18 || 0) * kidsU18;
      reduction = Math.min(basic, Math.max(0, r2(2 * personal - basic)));
    }
    var tax = Math.max(0, r2(basic + health - reduction));
    return {
      code: code,
      grossTax: gross.tax,
      credits: credits,
      surtaxAndBasic: basic,
      healthPremium: health,
      taxReduction: reduction,
      tax: tax,
      marginalRate: gross.marginalRate,
      creditRate: d.creditRate,
      bpa: bpa
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
