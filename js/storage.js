window.BF = window.BF || {};

BF.emptyProfile = function () {
  return {
    displayName: "",
    province: "MB",
    age: "",
    marital: "single",
    yearsInCanadaAfter18: "",
    livedInCanadaMostOfLife: false,
    residency: "unsure",
    householdIncome: "",
    working: false,
    workingIncome: "",
    selfEmployed: false,
    workType: "",
    profession: "",
    incomeEmployment: "",
    incomeSelfEmployedGross: "",
    incomeSelfEmployedNet: "",
    incomeEiBenefits: "",
    incomePension: "",
    incomeInterest: "",
    incomeDividendsEligible: "",
    incomeDividendsOther: "",
    incomeRentalNet: "",
    incomeCapitalGains: "",
    incomeOther: "",
    writeoffAmounts: {},
    taxWithheld: "",
    rrspDeduction: "",
    rrspRoom: "",
    spouseIncome: "",
    children: [],
    housing: "rent",
    monthlyRent: "",
    pregnant: false,
    disability: "none",
    dentalInsurance: false,
    student: false,
    newcomer: false,
    indigenous: "prefer-not",
    gender: "prefer-not",
    ethnicity: ["prefer-not"],
    hasResp: false,
    receivesOas: false,
    receivesEia: false,
    spouseReceivesGis: false,
    businessOwner: false,
    tradesApprentice: false
  };
};

BF.defaultState = function () {
  return {
    version: BF.VERSION,
    profile: BF.emptyProfile(),
    intakeStep: 1,
    intakeStarted: false,
    idMeta: [],
    selectedIds: [],
    applications: [],
    referralCode: BF.makeReferralCode(),
    referralCodeEntered: "",
    referralLedger: [],
    settings: {
      feePercent: BF.DEFAULT_FEE_PERCENT,
      referralPercent: BF.DEFAULT_REFERRAL_PERCENT,
      accountantName: "",
      dtcAssistanceFee: 0
    },
    viewed: "home",
    alreadyReceiving: {},
    alreadyConfirmed: false,
    onboardingStarted: false,
    leadClosed: false
  };
};

BF.makeReferralCode = function () {
  var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var s = "BF-";
  for (var i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
};

BF.loadState = function () {
  try {
    var raw = localStorage.getItem(BF.STORAGE_KEY);
    if (!raw) return BF.defaultState();
    var data = JSON.parse(raw);
    var base = BF.defaultState();
    var out = Object.assign(base, data);
    out.profile = Object.assign(BF.emptyProfile(), data.profile || {});
    if (!Array.isArray(out.profile.children)) out.profile.children = [];
    if (!out.profile.writeoffAmounts || typeof out.profile.writeoffAmounts !== "object") out.profile.writeoffAmounts = {};
    out.settings = Object.assign(base.settings, data.settings || {});
    if (!out.referralCode) out.referralCode = BF.makeReferralCode();
    if (!Array.isArray(out.applications)) out.applications = [];
    if (!Array.isArray(out.referralLedger)) out.referralLedger = [];
    if (!Array.isArray(out.idMeta)) out.idMeta = [];
    if (!Array.isArray(out.selectedIds)) out.selectedIds = [];
    if (!out.alreadyReceiving || typeof out.alreadyReceiving !== "object") out.alreadyReceiving = {};
    if (typeof out.alreadyConfirmed !== "boolean") out.alreadyConfirmed = false;
    if (typeof out.onboardingStarted !== "boolean") out.onboardingStarted = false;
    if (typeof out.leadClosed !== "boolean") out.leadClosed = false;
    if (!Array.isArray(out.profile.ethnicity)) {
      var e = out.profile.ethnicity;
      out.profile.ethnicity = e && e !== "prefer-not" && e !== "not-listed" ? [e] : ["prefer-not"];
    }
    return out;
  } catch (err) {
    return BF.defaultState();
  }
};

BF.saveState = function (state) {
  var copy = JSON.parse(JSON.stringify(state));
  localStorage.setItem(BF.STORAGE_KEY, JSON.stringify(copy));
};

BF.idb = {
  _db: null,
  open: function () {
    var self = this;
    if (self._db) return Promise.resolve(self._db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open("benefit-finder-docs", 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("ids")) db.createObjectStore("ids");
      };
      req.onsuccess = function () {
        self._db = req.result;
        resolve(self._db);
      };
      req.onerror = function () { reject(req.error); };
    });
  },
  put: function (key, value) {
    return this.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("ids", "readwrite");
        tx.objectStore("ids").put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  },
  get: function (key) {
    return this.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("ids", "readonly");
        var req = tx.objectStore("ids").get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  },
  del: function (key) {
    return this.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("ids", "readwrite");
        tx.objectStore("ids").delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  },
  clear: function () {
    return this.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("ids", "readwrite");
        tx.objectStore("ids").clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
};
