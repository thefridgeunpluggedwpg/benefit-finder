/* 2025 possible deductions and tax credits. Only items verified on canada.ca
   or gov.mb.ca for the 2025 tax year are listed. Expired credits are omitted.
   Sources are on each record. Matching by profession is for display only;
   eligibility still depends on the official rules. */
(function (root) {
  "use strict";
  root.BF = root.BF || {};

  BF.PROFESSIONS = [
    { id: "", label: "Prefer not to say / not listed" },
    { id: "carpenter", label: "Carpenter", group: "trades" },
    { id: "electrician", label: "Electrician", group: "trades" },
    { id: "trades-other", label: "Other skilled trade", group: "trades" },
    { id: "trucker", label: "Trucker / transport", group: "transport" },
    { id: "healthcare", label: "Nurse / healthcare", group: "healthcare" },
    { id: "teacher", label: "Teacher / early childhood educator", group: "education" },
    { id: "retail", label: "Retail", group: "service" },
    { id: "office", label: "Office / administrative", group: "service" },
    { id: "gig", label: "Gig / rideshare / delivery", group: "gig" },
    { id: "real-estate", label: "Real estate", group: "sales" },
    { id: "contractor", label: "Self-employed / contractor", group: "se" },
    { id: "student", label: "Student", group: "student" },
    { id: "retired", label: "Retired", group: "retired" },
    { id: "other", label: "Other", group: "other" }
  ];

  function prof(p) { return (p && p.profession) || ""; }
  function groupOf(id) {
    var found = BF.PROFESSIONS.filter(function (x) { return x.id === id; })[0];
    return found && found.group;
  }
  function isTrades(p) {
    var g = groupOf(prof(p));
    return g === "trades" || !!(p && p.tradesApprentice);
  }
  function isEmployee(p) {
    if (p && (p.workType === "employee" || p.workType === "both")) return true;
    if (p && p.workType === "self-employed") return false;
    if (p && Number(p.incomeEmployment) > 0) return true;
    if (p && p.selfEmployed) return false;
    if (p && (p.profession === "retired" || p.profession === "student") && !p.working && !(Number(p.workingIncome) > 0)) return false;
    return !!(p && (p.working || Number(p.workingIncome) > 0));
  }
  function isSE(p) {
    if (p && (p.workType === "self-employed" || p.workType === "both")) return true;
    if (p && (Number(p.incomeSelfEmployedNet) > 0 || Number(p.incomeSelfEmployedGross) > 0)) return true;
    return !!(p && p.selfEmployed);
  }

  /* kind: deduction (reduces net income), credit (non-refundable), refundable */
  BF.WRITEOFFS = [
    {
      id: "rrsp",
      title: "RRSP deduction",
      line: "Line 20800",
      form: "Schedule 7",
      kind: "deduction",
      amountKey: "rrspDeduction",
      cap: 32490,
      capNote: "The 2025 RRSP dollar limit is $32,490; your personal room is on your notice of assessment (generally 18% of prior-year earned income, minus any pension adjustment).",
      explanation: "Contributions to your RRSP or PRPP can reduce your 2025 taxable income, up to your deduction limit.",
      eligibility: "You have unused RRSP room. Transfers from an RRSP to an FHSA are not deductible.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/contributing-a-rrsp-prpp/contributions-affect-your-rrsp-prpp-deduction-limit.html",
      show: function () { return true; }
    },
    {
      id: "fhsa",
      title: "FHSA deduction",
      line: "Line 20805",
      form: "Schedule 15",
      kind: "deduction",
      amountKey: "fhsaDeduction",
      cap: 8000,
      capNote: "Annual FHSA contribution limit is $8,000, with a $40,000 lifetime deduction cap. Your available room may be lower.",
      explanation: "Contributions to a first home savings account are generally deductible, similar to RRSP contributions.",
      eligibility: "You opened an FHSA and contributed in 2025 (January to December). RRSP-to-FHSA transfers are not deductible.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-20805-fhsa-deduction.html",
      show: function () { return true; }
    },
    {
      id: "unionDues",
      title: "Annual union, professional, or like dues",
      line: "Line 21200",
      form: "T4 box 44 or receipts",
      kind: "deduction",
      amountKey: "unionDues",
      explanation: "You can deduct union or professional dues you paid, except the GST/HST portion if you can claim a rebate, and initiation fees that are really insurance.",
      eligibility: "The dues were required to keep your membership and were not reimbursed.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-21200-annual-union-professional-or-like-dues.html",
      show: function (p) { return isEmployee(p) || isTrades(p) || ["healthcare", "teacher", "trucker", "office", "retail"].indexOf(prof(p)) >= 0; }
    },
    {
      id: "childCare",
      title: "Child care expenses",
      line: "Line 21400",
      form: "Form T778",
      kind: "deduction",
      amountKey: "childCare",
      explanation: "You may deduct amounts paid so you (and your spouse, if you have one) could work, run a business, or attend school.",
      eligibility: "You paid a caregiver or program for an eligible child and have receipts. Limits depend on the child's age and your earned income.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-21400-child-care-expenses.html",
      show: function (p) { return !!(p && p.children && p.children.length); }
    },
    {
      id: "moving",
      title: "Moving expenses",
      line: "Line 21900",
      form: "Form T1-M",
      kind: "deduction",
      amountKey: "moving",
      explanation: "You may deduct eligible moving costs if you moved for work, a business, or full-time post-secondary studies and are at least 40 km closer to the new location.",
      eligibility: "The move meets the 40 km test and you have receipts. You can only deduct up to income at the new location.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-21900-moving-expenses.html",
      show: function () { return true; }
    },
    {
      id: "tradesTools",
      title: "Tradesperson's tools deduction",
      line: "Line 22900 (T777 line 1770)",
      form: "Form T777 and T2200",
      kind: "deduction",
      amountKey: "tradesTools",
      cap: 1000,
      capNote: "Maximum $1,000. The deductible amount is the lesser of $1,000 and (A − $1,471), where A is the lesser of the cost of eligible new tools and your trades employment income (plus certain apprenticeship grants).",
      explanation: "Employed tradespeople can deduct eligible new tools bought in 2025, if the employer certifies they were required for the job.",
      eligibility: "You were an employed tradesperson, bought unused eligible tools in 2025, and have a T2200 with question 12 completed. Cell phones and general electronics do not qualify.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-22900-other-employment-expenses.html",
      show: function (p) { return isTrades(p) && isEmployee(p); }
    },
    {
      id: "apprenticeTools",
      title: "Apprentice mechanic tools deduction",
      line: "Line 22900 (T777 line 9131)",
      form: "Form T777 and T2200",
      kind: "deduction",
      amountKey: "apprenticeTools",
      explanation: "Eligible apprentice mechanics may deduct tool costs above a threshold that uses the $1,000 tradesperson deduction and the $1,471 Canada employment amount, with unused amounts carried forward.",
      eligibility: "You were employed as an apprentice mechanic, your employer certified the tools on Form T2200, and you have receipts. Complete the T4044 / T777 calculation; this app treats an entered amount as the already-calculated deduction.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4044/employment-expenses.html",
      show: function (p) { return (isTrades(p) || !!(p && p.tradesApprentice)) && isEmployee(p); }
    },
    {
      id: "labourMobility",
      title: "Labour mobility deduction for tradespeople",
      line: "Line 22900 (T777 line 1771)",
      form: "Form T777",
      kind: "deduction",
      amountKey: "labourMobility",
      cap: 4000,
      capNote: "Maximum $4,000 per year, and not more than 50% of your employment income from construction activities at the temporary work location.",
      explanation: "Eligible construction tradespeople and apprentices can deduct certain temporary lodging, round-trip transportation, and travel meal costs for a temporary relocation.",
      eligibility: "You had employment income from construction activities and an eligible temporary relocation. See T4044 Chapter 7 for the distance and duration tests.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4044/employment-expenses.html",
      show: function (p) { return isTrades(p) && isEmployee(p); }
    },
    {
      id: "t777",
      title: "Employment expenses (Form T777)",
      line: "Line 22900",
      form: "Form T777 and T2200",
      kind: "deduction",
      amountKey: "t777",
      explanation: "If your employer required you to pay your own expenses under your contract, you may deduct eligible employment expenses, including some travel and supplies.",
      eligibility: "You have a completed T2200 and the expense was required by your employment, not reimbursed, and allowed in T4044. Commission employees use the T777 commission section.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4044/employment-expenses.html",
      show: function (p) { return isEmployee(p) && prof(p) !== "retired" && prof(p) !== "student"; }
    },
    {
      id: "homeOffice",
      title: "Home office expenses (detailed method)",
      line: "Line 22900 (employees) or T2125 (self-employed)",
      form: "Form T777 / T2200, or T2125",
      kind: "deduction",
      amountKey: "homeOffice",
      explanation: "You may deduct a reasonable share of eligible home expenses for a workspace you use for work, based on the workspace's share of your home and your work-use percentage. The temporary flat-rate method is not available for 2025.",
      eligibility: "Employees need a T2200 and must meet the T4044 workspace-in-the-home tests. Self-employed people claim the workspace on Form T2125.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-22900-other-employment-expenses/work-space-home-expenses.html",
      show: function (p) { return isEmployee(p) || isSE(p); }
    },
    {
      id: "vehicle",
      title: "Motor vehicle expenses",
      line: "Line 22900 (employees) or T2125 (self-employed)",
      form: "Form T777 / T2200, or T2125",
      kind: "deduction",
      amountKey: "vehicle",
      explanation: "You may deduct the work-use share of eligible vehicle costs (fuel, maintenance, insurance, licence, and capital cost allowance) if you were required to use your own vehicle for work.",
      eligibility: "Keep a mileage log. Employees need a T2200. Only the employment or business portion is deductible.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-22900-other-employment-expenses.html",
      show: function (p) {
        return isSE(p) || isTrades(p) || ["trucker", "gig", "real-estate", "healthcare", "contractor"].indexOf(prof(p)) >= 0;
      }
    },
    {
      id: "seExpenses",
      title: "Self-employment expenses (T2125)",
      line: "Form T2125 (nets to self-employment income)",
      form: "Form T2125",
      kind: "deduction",
      amountKey: "seExpenses",
      explanation: "Self-employed people can deduct reasonable business expenses, including supplies, a work-use share of phone and internet, advertising, vehicle costs, home office, and capital cost allowance.",
      eligibility: "The expense was incurred to earn business income and is reasonable. If you already entered net self-employment income, do not enter expenses again here.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125.html",
      show: function (p) { return isSE(p) || ["gig", "contractor", "real-estate"].indexOf(prof(p)) >= 0; }
    },
    {
      id: "northern",
      title: "Northern residents deductions",
      line: "Line 25500",
      form: "Form T2222",
      kind: "deduction",
      amountKey: "northern",
      explanation: "If you lived in a prescribed northern or intermediate zone for at least six consecutive months, you may claim a residency deduction and, in some cases, a travel deduction.",
      eligibility: "Your residence was in a prescribed zone. Complete Form T2222; enter the calculated deduction, not a guessed maximum.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-25500-northern-residents-deductions.html",
      show: function () { return true; }
    },
    {
      id: "tuition",
      title: "Federal tuition amount",
      line: "Schedule 11, then line 32300",
      form: "Schedule 11 / T2202",
      kind: "credit",
      amountKey: "tuition",
      explanation: "Eligible tuition fees create a non-refundable federal tax credit at the lowest federal rate (14.5% for 2025). Unused amounts can be carried forward or, within limits, transferred.",
      eligibility: "Fees were paid to an eligible institution and are shown on a T2202 or equivalent. Examination fees may also qualify.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-32300-tuition-education-textbook-amounts.html",
      show: function (p) { return !!(p && p.student) || prof(p) === "student" || isTrades(p); }
    },
    {
      id: "ctcLimit",
      title: "Canada training credit",
      line: "Line 45350",
      form: "Schedule 11",
      kind: "refundable",
      amountKey: "ctcLimit",
      capNote: "Enter your Canada training credit limit from your notice of assessment. The credit is the lesser of that limit and 50% of eligible tuition claimed on Schedule 11.",
      explanation: "A refundable credit for eligible tuition and examination fees. Your limit grows by $250 in qualifying years, up to $5,000 in a lifetime, if you were 26–65 and a resident throughout the year.",
      eligibility: "Your CTCL on your notice is more than zero, you were at least 26 and under 66 at the end of 2025, and you have eligible fees.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-45350-canada-training-credit.html",
      show: function (p) {
        var age = Number(p && p.age);
        return (!isFinite(age) || (age >= 26 && age < 66)) && (!!(p && p.student) || isTrades(p) || prof(p) === "student" || true);
      }
    },
    {
      id: "medical",
      title: "Medical expenses tax credit",
      line: "Lines 33099 and 33199",
      form: "Federal Worksheet",
      kind: "credit",
      amountKey: "medical",
      capNote: "You can claim eligible expenses above the lesser of $2,834 and 3% of your 2025 net income, for any 12-month period ending in 2025.",
      explanation: "A non-refundable credit for eligible medical and dental expenses that were not reimbursed.",
      eligibility: "The expense is on the CRA eligible list and was not already claimed. You can include amounts paid for you, your spouse, and children under 18.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4065/medical-expenses.html",
      show: function () { return true; }
    },
    {
      id: "donations",
      title: "Donations and gifts tax credit",
      line: "Line 34900 (Schedule 9)",
      form: "Schedule 9",
      kind: "credit",
      amountKey: "donations",
      capNote: "Generally limited to 75% of net income. Federal credit rates for 2025 are 14.5% on the first $200, 29% on the next portion, and 33% on donations that fall in the top federal bracket. Manitoba rates are 10.8% on the first $200 and 17.4% above that.",
      explanation: "Gifts to a qualified donee create a non-refundable tax credit. Keep official donation receipts.",
      eligibility: "The gift was made to a qualified donee and you have a receipt. Unused amounts can generally be carried forward up to five years.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-34900-donations-gifts/how-much-claim.html",
      show: function () { return true; }
    },
    {
      id: "volunteerFirefighter",
      title: "Volunteer firefighters' amount",
      line: "Line 31220",
      form: "T1 return",
      kind: "credit",
      amountKey: "volunteerFirefighter",
      cap: 6000,
      capNote: "The 2025 federal amount is $6,000 if you completed at least 200 eligible hours. You cannot claim both this and the search and rescue volunteers' amount, and you cannot also take the $1,000 emergency-services exemption from the same organization.",
      explanation: "A non-refundable credit on a $6,000 amount if you were an eligible volunteer firefighter (or you may claim the search and rescue amount on line 31240 instead).",
      eligibility: "At least 200 hours of eligible volunteer service in 2025. Enter $6,000 if you qualify, or leave blank.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-31220-volunteer-firefighters-amount-line-31240-search-rescue-volunteers-amount.html",
      show: function () { return true; }
    },
    {
      id: "educatorSupplies",
      title: "Eligible educator school supply tax credit",
      line: "Lines 46800 and 46900",
      form: "T1 return",
      kind: "refundable",
      amountKey: "educatorSupplies",
      cap: 1000,
      capNote: "Claim up to $1,000 of eligible supplies. The refundable credit is 25% of that amount (up to $250).",
      explanation: "Eligible teachers and early childhood educators can claim a refundable credit for supplies they paid for and used in their teaching duties.",
      eligibility: "You were employed in Canada as a teacher or ECE with a recognized certificate or diploma, and the supplies were not reimbursed. Your employer may need to confirm the expenses.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/lines-46800-46900-eligible-educator-school-supply-tax-credit.html",
      show: function (p) { return prof(p) === "teacher"; }
    },
    {
      id: "mbFitness",
      title: "Manitoba fitness amount",
      line: "MB428 line 58325",
      form: "Form MB428",
      kind: "credit",
      amountKey: "mbFitness",
      cap: 500,
      capNote: "Up to $500 of eligible fees per qualifying child or young adult, plus another $500 if that person is eligible for the DTC and at least $100 was paid. The credit is 10.8% of the eligible amount.",
      explanation: "Manitoba residents can claim a non-refundable credit for prescribed physical-activity program fees for a child under 18 or a young adult 18–24 (including yourself if you are under 25).",
      eligibility: "You lived in Manitoba at year-end and paid eligible unsupervised-not, ongoing, supervised program fees that were not reimbursed.",
      sourceUrl: "https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/manitoba/5007-pc.html",
      show: function (p) { return (p && p.province === "MB") && (Number(p.age) < 25 || (p.children && p.children.length)); }
    },
    {
      id: "mbCaregiver",
      title: "Manitoba Primary Caregiver Tax Credit",
      line: "Form MB479",
      form: "Form MB479",
      kind: "refundable",
      amountKey: "mbCaregiver",
      cap: 1400,
      capNote: "A flat $1,400 refundable credit per eligible care recipient, not income-tested.",
      explanation: "Manitoba residents who provide unpaid care for more than 90 days to a person assessed at care level 2 or higher may claim $1,400.",
      eligibility: "You and the care recipient live in Manitoba, the recipient lives in a private residence, and only one primary caregiver claims the credit. Enter $1,400 if you qualify.",
      sourceUrl: "https://www.gov.mb.ca/finance/tao/caregiver.html",
      show: function (p) { return p && p.province === "MB"; }
    },
    {
      id: "mbLabourSponsored",
      title: "Manitoba labour-sponsored funds tax credit",
      line: "MB428 line 60800",
      form: "Form MB428 / T2C (MAN.)",
      kind: "credit",
      amountKey: "mbLabourSponsored",
      cap: 1800,
      capNote: "The credit is 15% of an eligible investment, to a maximum credit of $1,800. Enter the credit from your T2C (MAN.) slip, or the investment amount and this app will apply 15% up to $1,800.",
      explanation: "A Manitoba credit for eligible investments in a registered labour-sponsored venture capital corporation made in the year or within 60 days after year-end.",
      eligibility: "You have a T2C (MAN.) slip for an eligible 2025 investment.",
      sourceUrl: "https://www.gov.mb.ca/finance/personal/pcredits.html",
      show: function (p) { return p && p.province === "MB"; }
    }
  ];

  BF.writeoffsFor = function (profile, alreadyReceiving) {
    var p = profile || {};
    var already = alreadyReceiving || {};
    return BF.WRITEOFFS.filter(function (w) {
      if (already[w.id]) return false;
      try { return !w.show || !!w.show(p); } catch (e) { return false; }
    });
  };
})(typeof window !== "undefined" ? window : globalThis);
