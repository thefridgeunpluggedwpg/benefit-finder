/* Benefit Finder — app name lives here so it can be renamed in one place. */
window.BF = window.BF || {};
BF.APP_NAME = "Benefit Finder";
BF.VERSION = "1.6.0";
BF.CACHE_NAME = "benefit-finder-v1.6.0";
BF.LEGAL_LINE = "Not a CPA or professional accountant. Not tax advice. Not a filed return. Actual amounts depend on your slips and CRA’s assessment.";
BF.STORAGE_KEY = "benefit-finder-v1";
BF.DEFAULT_FEE_PERCENT = 3;
BF.MIN_FEE_PERCENT = 2;
BF.MAX_FEE_PERCENT = 4;
BF.DEFAULT_REFERRAL_PERCENT = 1;
BF.DTC_FEE_CAP_CAD = 100;
BF.PROVINCE_FOCUS = "MB";

BF.PROVINCE_NAMES = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick",
  NL: "Newfoundland and Labrador", NT: "Northwest Territories", NS: "Nova Scotia",
  NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec",
  SK: "Saskatchewan", YT: "Yukon"
};
BF.provinceName = function (code) {
  return BF.PROVINCE_NAMES[code] || code || "your province";
};
