(function () {
  "use strict";

  var state = BF.loadState();
  var deferredPrompt = null;
  var installDismissed = false;
  var openPacketId = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtMoney(n) {
    if (n == null || !isFinite(n)) return "Amount varies";
    var opts = { style: "currency", currency: "CAD" };
    if (Math.round(n * 100) % 100 === 0) opts.maximumFractionDigits = 0;
    return new Intl.NumberFormat("en-CA", opts).format(n);
  }

  function todayISO() {
    var d = new Date();
    var z = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - z).toISOString().slice(0, 10);
  }

  function formatDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[Number(p[1]) - 1] + " " + Number(p[2]) + ", " + p[0];
  }

  function save() { BF.saveState(state); }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function profileForMatch() {
    var p = JSON.parse(JSON.stringify(state.profile));
    p.age = num(p.age);
    p.householdIncome = num(p.householdIncome);
    p.workingIncome = num(p.workingIncome);
    p.yearsInCanadaAfter18 = num(p.yearsInCanadaAfter18);
    p.children = (p.children || []).map(function (c) {
      return { age: num(c.age), hasDtc: !!c.hasDtc };
    });
    return p;
  }

  function matches() { return BF.matchAll(profileForMatch()); }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isIOS() {
    var ua = window.navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function setView(name) {
    state.viewed = name;
    if (name === "intake") state.intakeStarted = true;
    save();
    render();
    $("#view").focus();
    window.scrollTo(0, 0);
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  function setupInstall() {
    var btn = $("#btnInstall");
    var banner = $("#installBanner");
    if (isStandalone()) {
      btn.hidden = true;
      banner.hidden = true;
      banner.classList.remove("show");
      return;
    }
    btn.hidden = false;
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      btn.hidden = false;
      if (!installDismissed) showInstallBanner("android");
    });
    window.addEventListener("appinstalled", function () {
      deferredPrompt = null;
      btn.hidden = true;
      hideInstallBanner();
    });
  }

  function showInstallBanner(kind) {
    var banner = $("#installBanner");
    var copy = $("#installCopy");
    var now = $("#btnInstallNow");
    var steps = $("#iosSteps");
    banner.hidden = false;
    banner.classList.add("show");
    if (kind === "ios") {
      copy.textContent = "Install Benefit Finder on your iPhone or iPad from Safari.";
      now.hidden = true;
      steps.hidden = false;
    } else {
      copy.textContent = "Install Benefit Finder on this phone for a full-screen app, with your data kept on the device.";
      now.hidden = false;
      steps.hidden = true;
    }
  }

  function hideInstallBanner() {
    var banner = $("#installBanner");
    banner.hidden = true;
    banner.classList.remove("show");
  }

  async function promptInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) {}
      deferredPrompt = null;
      return;
    }
    if (isIOS()) showInstallBanner("ios");
    else showInstallBanner("android");
  }

  function statusLabel(s) {
    return { submitted: "Submitted", "in-review": "In review", approved: "Approved", denied: "Denied" }[s] || s;
  }

  function routeLabel(r) {
    return r === "accountant" ? "Routes to accountant" : "Submit directly";
  }

  function renderTabs() {
    var hasMatches = !!(state.lastMatchCount > 0 || (state.selectedIds && state.selectedIds.length));
    var hasApps = state.applications.length > 0;
    $("#tabResults").disabled = !hasMatches && state.viewed !== "results";
    $("#tabTracker").disabled = !hasApps && state.viewed !== "tracker";
    $$(".tabbar button").forEach(function (b) {
      var target = b.getAttribute("data-view");
      var current = state.viewed;
      if (current === "owner" || current === "referral" || current === "packet") {
        if (target === "more") b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      } else if (target === current) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }

  function render() {
    var root = $("#view");
    var v = state.viewed || "home";
    if (v === "home") root.innerHTML = viewHome();
    else if (v === "intake") root.innerHTML = viewIntake();
    else if (v === "results") root.innerHTML = viewResults();
    else if (v === "tracker") root.innerHTML = viewTracker();
    else if (v === "referral") root.innerHTML = viewReferral();
    else if (v === "owner") root.innerHTML = viewOwner();
    else if (v === "packet") root.innerHTML = viewPacket();
    else if (v === "more") root.innerHTML = viewMore();
    else root.innerHTML = viewHome();
    bindView();
    renderTabs();
  }

  function viewHome() {
    return (
      '<section class="panel">' +
        '<p class="fine">Prototype — demo build. This app does not send applications to the government.</p>' +
        '<h1>See which benefits may apply, then approve a packet for each one.</h1>' +
        '<p class="lede">Benefit Finder looks at your situation and matches it to official federal and Manitoba programs. You get an approximate dollar total first. Nothing leaves this phone unless you copy it out yourself.</p>' +
        '<div class="notice">' +
          '<p>ID images, income, ethnicity, and other answers stay on this device (in your browser storage). They are not uploaded or transmitted by this prototype.</p>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn" type="button" id="btnStart">' + (state.intakeStarted ? "Continue the form" : "Start the form") + '</button>' +
          (state.applications.length ? '<button class="btn secondary" type="button" data-go="tracker">Open the tracker</button>' : "") +
        '</div>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>How it works</h2>' +
        '<p>You fill one form, including a government ID upload early on, because most programs ask for ID later.</p>' +
        '<p>Matching uses published rules only. If an official amount cannot be verified, the program shows “amount varies” instead of a number.</p>' +
        '<p>When you approve a program, this app builds a packet: a prefilled summary, the official application link, and a document checklist. Tax-related programs go to the owner’s accountant specialist queue. Other programs are marked “submit directly.” The owner updates status by hand: Submitted, In review, Approved, or Denied.</p>' +
        '<p class="fine">Gender and ethnicity are optional, include “prefer not to say,” and are only used when a program actually targets that group. In this catalog, only the Indigenous identity question is used, and only for Non-Insured Health Benefits.</p>' +
      '</section>'
    );
  }

  function viewMore() {
    return (
      '<section class="panel">' +
        '<h1>More</h1>' +
        '<div class="actions">' +
          '<button class="btn full" type="button" data-go="referral">Referral dashboard</button>' +
          '<button class="btn secondary full" type="button" id="btnOwner">Owner desk</button>' +
        '</div>' +
        '<p class="muted" style="margin-top:1rem">The owner desk is not locked in this prototype. Anyone with the phone can open it. A production build needs real sign-in.</p>' +
        '<p class="fine">Version ' + esc(BF.VERSION) + '</p>' +
      '</section>'
    );
  }

  function stepTitle(n) {
    return ["", "About you", "Government ID", "Household and income", "Your situation", "Review"][n] || "";
  }

  function viewIntake() {
    var s = state.intakeStep || 1;
    if (s < 1) s = 1;
    if (s > 5) s = 5;
    var dots = [1, 2, 3, 4, 5].map(function (i) { return '<span class="' + (i <= s ? "on" : "") + '"></span>'; }).join("");
    var body = [null, stepAbout, stepId, stepHousehold, stepSituation, stepReview][s]();
    return (
      '<section class="panel">' +
        '<div class="stepper" aria-hidden="true">' + dots + '</div>' +
        '<p class="step-label">Step ' + s + ' of 5 · ' + esc(stepTitle(s)) + '</p>' +
        '<form id="intakeForm" autocomplete="off">' + body +
          '<div class="actions">' +
            (s > 1 ? '<button class="btn secondary" type="button" id="btnBack">Back</button>' : "") +
            (s < 5 ? '<button class="btn" type="submit" id="btnNext">Continue</button>' : '<button class="btn" type="submit" id="btnFind">Find my benefits</button>') +
          '</div>' +
        '</form>' +
      '</section>'
    );
  }

  function val(k) { return state.profile[k] == null ? "" : state.profile[k]; }

  function stepAbout() {
    return (
      '<h1>About you</h1>' +
      '<label class="field"><span>What should we call you? (optional)</span>' +
        '<input type="text" name="displayName" value="' + esc(val("displayName")) + '" maxlength="80">' +
      '</label>' +
      '<div class="grid-2">' +
        '<label class="field"><span>Province or territory</span>' +
          '<select name="province">' + provinceOptions(val("province") || "MB") + '</select>' +
          '<span class="hint">Provincial programs in this build cover Manitoba only. Federal programs still match in other provinces.</span>' +
        '</label>' +
        '<label class="field"><span>Age</span>' +
          '<input type="number" name="age" min="0" max="120" inputmode="numeric" required value="' + esc(val("age")) + '">' +
        '</label>' +
      '</div>' +
      '<label class="field"><span>Marital status</span>' +
        '<select name="marital">' + opts({
          single: "Single", married: "Married", "common-law": "Common-law",
          separated: "Separated", divorced: "Divorced", widowed: "Widowed"
        }, val("marital") || "single") + '</select>' +
      '</label>' +
      '<label class="field"><span>Years lived in Canada after age 18</span>' +
        '<input type="number" name="yearsInCanadaAfter18" min="0" max="100" inputmode="numeric" value="' + esc(val("yearsInCanadaAfter18")) + '">' +
      '</label>' +
      '<label class="choice"><input type="checkbox" name="livedInCanadaMostOfLife"' + (val("livedInCanadaMostOfLife") ? " checked" : "") + '>' +
        '<span>I have lived in Canada since age 18 (counts as 40 years for OAS rules)</span></label>' +
      '<label class="field"><span>Legal status in Canada (optional)</span>' +
        '<select name="residency">' + opts({
          unsure: "Prefer not to say or not sure",
          citizen: "Canadian citizen",
          pr: "Permanent resident",
          "indian-act": "Registered or entitled to be registered under the Indian Act",
          protected: "Protected person",
          temporary: "Temporary resident"
        }, val("residency") || "unsure") + '</select>' +
      '</label>'
    );
  }

  function stepId() {
    var files = (state.idMeta || []).map(function (f) {
      return '<figure data-id="' + esc(f.id) + '"><img alt="" data-thumb="' + esc(f.id) + '"><figcaption>' + esc(f.name) + '</figcaption></figure>';
    }).join("");
    return (
      '<h1>Government ID</h1>' +
      '<p>Most benefit applications ask for government ID. Upload it now so each packet can include it on the checklist as already on file on this device.</p>' +
      '<div class="notice warning">' +
        '<p>ID images stay on this device only. This prototype never transmits them. In a production app they would need encrypted, consented storage.</p>' +
      '</div>' +
      '<label class="field"><span>Upload a photo or scan of a government ID</span>' +
        '<input type="file" id="idFile" accept="image/*,application/pdf" multiple>' +
      '</label>' +
      '<div class="preview-list" id="idPreviews">' + files + '</div>' +
      (state.idMeta.length ? '<p class="fine" id="idStatus">' + state.idMeta.length + ' file' + (state.idMeta.length === 1 ? "" : "s") + ' stored on this device.</p>' :
        '<p class="fine" id="idStatus">No ID uploaded yet. You can continue and add it later; packets will list ID as still needed.</p>')
    );
  }

  function stepHousehold() {
    var kids = (state.profile.children || []).map(function (c, i) {
      return '<div class="grid-2" data-child="' + i + '">' +
        '<label class="field"><span>Child ' + (i + 1) + ' age</span>' +
          '<input type="number" min="0" max="25" inputmode="numeric" name="childAge' + i + '" value="' + esc(c.age) + '"></label>' +
        '<label class="field"><span>&nbsp;</span><label class="choice"><input type="checkbox" name="childDtc' + i + '"' + (c.hasDtc ? " checked" : "") + '><span>Eligible for the Disability Tax Credit</span></label></label>' +
        '</div>';
    }).join("");
    return (
      '<h1>Household and income</h1>' +
      '<label class="field"><span>Adjusted family net income (about what you would report on line 23600, plus a spouse’s if you have one)</span>' +
        '<input type="number" name="householdIncome" min="0" step="1" inputmode="decimal" required value="' + esc(val("householdIncome")) + '">' +
        '<span class="hint">Use last year’s income when you can. Estimates are labelled with the official benefit year they belong to.</span>' +
      '</label>' +
      '<label class="choice"><input type="checkbox" name="working"' + (val("working") ? " checked" : "") + '><span>I had employment, self-employment, or taxable scholarship income</span></label>' +
      '<label class="field"><span>Working income (if different from household income)</span>' +
        '<input type="number" name="workingIncome" min="0" step="1" inputmode="decimal" value="' + esc(val("workingIncome")) + '">' +
      '</label>' +
      '<div class="grid-2">' +
        '<label class="field"><span>Housing</span>' +
          '<select name="housing">' + opts({ rent: "I rent my home", own: "I own my principal residence", other: "Other or neither" }, val("housing") || "rent") + '</select>' +
        '</label>' +
        '<label class="field"><span>Monthly rent (optional)</span>' +
          '<input type="number" name="monthlyRent" min="0" step="1" inputmode="decimal" value="' + esc(val("monthlyRent")) + '">' +
        '</label>' +
      '</div>' +
      '<p>Children in your care</p>' +
      '<div id="kids">' + (kids || '<p class="muted">No children added.</p>') + '</div>' +
      '<div class="actions"><button class="btn ghost" type="button" id="btnAddChild">Add a child</button></div>' +
      '<label class="choice"><input type="checkbox" name="pregnant"' + (val("pregnant") ? " checked" : "") + '><span>I am pregnant</span></label>' +
      '<label class="choice"><input type="checkbox" name="hasResp"' + (val("hasResp") ? " checked" : "") + '><span>I already have an RESP for a child</span></label>' +
      '<label class="choice"><input type="checkbox" name="receivesOas"' + (val("receivesOas") ? " checked" : "") + '><span>I already receive Old Age Security</span></label>' +
      '<label class="choice"><input type="checkbox" name="spouseReceivesGis"' + (val("spouseReceivesGis") ? " checked" : "") + '><span>My spouse or common-law partner receives the Guaranteed Income Supplement</span></label>' +
      '<label class="choice"><input type="checkbox" name="receivesEia"' + (val("receivesEia") ? " checked" : "") + '><span>I receive Manitoba Employment and Income Assistance</span></label>'
    );
  }

  function stepSituation() {
    return (
      '<h1>Your situation</h1>' +
      '<label class="field"><span>Disability Tax Credit</span>' +
        '<select name="disability">' + opts({
          none: "No disability to consider for this form",
          "yes-no-dtc": "I have a disability and do not have an approved Disability Tax Credit yet",
          "has-dtc": "I already have an approved Disability Tax Credit"
        }, val("disability") || "none") + '</select>' +
      '</label>' +
      '<label class="choice"><input type="checkbox" name="dentalInsurance"' + (val("dentalInsurance") ? " checked" : "") + '><span>I have access to private dental insurance or coverage</span></label>' +
      '<label class="choice"><input type="checkbox" name="student"' + (val("student") ? " checked" : "") + '><span>I am a post-secondary student (or about to be)</span></label>' +
      '<label class="choice"><input type="checkbox" name="newcomer"' + (val("newcomer") ? " checked" : "") + '><span>I am a newcomer (in Canada less than five years)</span></label>' +
      '<label class="field"><span>Indigenous identity (optional)</span>' +
        '<select name="indigenous">' + opts({
          "prefer-not": "Prefer not to say",
          no: "No",
          "first-nations": "First Nations",
          inuit: "Inuit",
          metis: "Métis",
          yes: "Yes, I identify as Indigenous (no further detail)"
        }, val("indigenous") || "prefer-not") + '</select>' +
        '<span class="hint">Used only for the Non-Insured Health Benefits program, which applies to eligible First Nations and Inuit people.</span>' +
      '</label>' +
      '<label class="field"><span>Gender (optional)</span>' +
        '<select name="gender">' + opts({
          "prefer-not": "Prefer not to say",
          woman: "Woman",
          man: "Man",
          nonbinary: "Non-binary",
          other: "Another gender"
        }, val("gender") || "prefer-not") + '</select>' +
        '<span class="hint">None of the programs in this catalog use gender for eligibility, so this answer is stored and not applied to matching.</span>' +
      '</label>' +
      '<label class="field"><span>Ethnicity (optional)</span>' +
        '<select name="ethnicity">' + opts({
          "prefer-not": "Prefer not to say",
          "not-listed": "I will not provide this",
          other: "Other or I would rather describe this later"
        }, val("ethnicity") || "prefer-not") + '</select>' +
        '<span class="hint">Not used for matching in this catalog. Kept optional for a later version if a verified program actually requires it.</span>' +
      '</label>'
    );
  }

  function stepReview() {
    var p = state.profile;
    var kids = (p.children || []).length;
    return (
      '<h1>Review and referral</h1>' +
      '<p>' + esc(p.displayName || "No name given") + ' · age ' + esc(p.age || "—") + ' · ' + esc(p.province || "—") + '</p>' +
      '<p class="muted">Household income ' + (p.householdIncome === "" ? "not entered" : fmtMoney(num(p.householdIncome))) +
        '. ' + kids + ' child' + (kids === 1 ? "" : "ren") + '. Housing: ' + esc(p.housing) + '.</p>' +
      '<p class="muted">ID on this device: ' + (state.idMeta.length ? state.idMeta.length + " file(s)" : "none yet") + '.</p>' +
      '<label class="field"><span>If someone referred you, enter their referral code (optional)</span>' +
        '<input type="text" name="referralCodeEntered" id="referralCodeEntered" value="' + esc(state.referralCodeEntered || "") + '" maxlength="20" autocapitalize="characters">' +
      '</label>' +
      '<div class="notice stamp">' +
        '<p>The totals you will see are approximate and labelled with the official benefit year. This app does not submit anything to the CRA, Service Canada, or Manitoba.</p>' +
      '</div>'
    );
  }

  function provinceOptions(cur) {
    var list = [
      ["MB", "Manitoba"], ["AB", "Alberta"], ["BC", "British Columbia"], ["SK", "Saskatchewan"],
      ["ON", "Ontario"], ["QC", "Quebec"], ["NB", "New Brunswick"], ["NS", "Nova Scotia"],
      ["PE", "Prince Edward Island"], ["NL", "Newfoundland and Labrador"],
      ["YT", "Yukon"], ["NT", "Northwest Territories"], ["NU", "Nunavut"]
    ];
    return list.map(function (x) {
      return '<option value="' + x[0] + '"' + (x[0] === cur ? " selected" : "") + '>' + x[1] + '</option>';
    }).join("");
  }

  function opts(map, cur) {
    return Object.keys(map).map(function (k) {
      return '<option value="' + k + '"' + (k === cur ? " selected" : "") + '>' + esc(map[k]) + '</option>';
    }).join("");
  }

  function viewResults() {
    var all = matches();
    var t = BF.totals(all);
    state.lastMatchCount = t.matched.length;
    var feeItems = t.matched.map(function (m) {
      return {
        amountCad: m.estimate.amountCad,
        dtcContingent: !!m.program.dtcContingent,
        feeCapped: !!m.program.feeCapped
      };
    });
    var fees = BF.computeFees(feeItems, state.settings);
    if (!state.selectedIds || !state.selectedIds.length) {
      state.selectedIds = t.matched.map(function (m) { return m.program.id; });
    }
    var rows = t.matched.map(function (m) {
      var est = m.estimate;
      var amt = est.amountCad == null ? "Amount varies" : fmtMoney(est.amountCad);
      var kind = est.kind === "maximum" ? "Approximate maximum" : (est.kind === "varies" ? "Amount varies" : "Approximate estimate");
      var checked = state.selectedIds.indexOf(m.program.id) >= 0 ? " checked" : "";
      return '<article class="prog-row">' +
        '<input type="checkbox" data-select="' + esc(m.program.id) + '"' + checked + ' aria-label="Include ' + esc(m.program.name) + '">' +
        '<div><div class="name">' + esc(m.program.name) + '</div>' +
          '<div><span class="tag ' + esc(m.program.route) + '">' + esc(routeLabel(m.program.route)) + '</span>' +
          '<span class="tag">' + esc(m.program.jurisdiction === "manitoba" ? "Manitoba" : "Federal") + '</span></div>' +
          '<p class="fine">' + esc(kind) + ' · ' + esc(m.program.benefitYear) + '</p>' +
          (est.note ? '<p class="fine">' + esc(est.note) + '</p>' : "") +
          '<p class="fine"><a href="' + esc(m.program.officialUrl) + '" target="_blank" rel="noopener">Official program page</a></p>' +
        '</div>' +
        '<div class="amt">' + esc(amt) + '</div>' +
      '</article>';
    }).join("");
    if (!t.matched.length) {
      rows = '<p>No programs in this catalog matched the answers you entered. You can go back and change the form.</p>';
    }
    return (
      '<section class="panel" id="resultsPanel">' +
        '<p class="fine">Prototype — demo build. Estimates are approximate.</p>' +
        '<div class="total-block">' +
          '<div class="amount" id="estimateTotal">' + fmtMoney(t.cash) + '</div>' +
          '<p class="caption" id="estimateCaption">Approximate estimated total of programs with a calculated or official-maximum amount, for the benefit years shown on each program.' +
            (t.hasVaries ? ' Some matches have no dollar figure and are listed as “amount varies.” They are not included in this total.' : "") +
          '</p>' +
        '</div>' +
        '<div class="notice">' +
          '<p id="feeSummary">If these calculated amounts were approved, the owner fee would be ' +
            esc(String(fees.feePercent)) + '% of ' + fmtMoney(fees.baseFound) +
            ' (programs not covered by the Disability Tax Credit promoter cap), which is <strong>' + fmtMoney(fees.percentFee) + '</strong>. ' +
            'Disability Tax Credit requests, and tax items that depend on the DTC, are left out of that percentage. Any fee for helping with a DTC request is capped at ' +
            fmtMoney(fees.dtcCapCad) + ' under the Disability Tax Credit Promoters Restrictions Regulations. Those regulations are currently suspended by a court injunction, but this app still applies the cap. I did not find a similar statutory fee cap for the other programs in this catalog.</p>' +
        '</div>' +
        (t.matched.length ? '<h2>Programs that may apply</h2><p class="muted">Uncheck any program you do not want in a packet, then approve. Approval builds a packet on this device — it does not file with government.</p>' + rows : rows) +
        '<div class="actions">' +
          '<button class="btn" type="button" id="btnApprove"' + (t.matched.length ? "" : " disabled") + '>Approve selected packets</button>' +
          '<button class="btn secondary" type="button" data-go="intake">Edit answers</button>' +
        '</div>' +
      '</section>'
    );
  }

  function trackMarkup(st) {
    var order = ["submitted", "in-review", "approved"];
    if (st === "denied") {
      return '<div class="track" aria-label="Status"><i class="done">Submitted</i><i>In review</i><i class="fail">Denied</i></div>';
    }
    return '<div class="track" aria-label="Status">' + order.map(function (x) {
      var cls = x === st ? "now" : (order.indexOf(x) < order.indexOf(st) ? "done" : "");
      return '<i class="' + cls + '">' + statusLabel(x) + '</i>';
    }).join("") + '</div>';
  }

  function viewTracker() {
    if (!state.applications.length) {
      return '<section class="panel"><h1>Progress tracker</h1><p>No packets yet. Approve matches first.</p></section>';
    }
    var cards = state.applications.map(function (a) {
      var dates = (a.history || []).map(function (h) {
        return esc(statusLabel(h.status)) + " · " + esc(formatDate(h.date));
      }).join(" · ");
      return '<article class="panel" data-app="' + esc(a.id) + '">' +
        '<h2>' + esc(a.name) + '</h2>' +
        '<p><span class="tag status-' + esc(a.status) + '" data-status="' + esc(a.status) + '">' + esc(statusLabel(a.status)) + '</span>' +
        '<span class="tag ' + esc(a.route) + '">' + esc(routeLabel(a.route)) + '</span></p>' +
        trackMarkup(a.status) +
        '<p class="fine">' + dates + '</p>' +
        (a.amountLabel ? '<p class="fine">Listed amount: ' + esc(a.amountLabel) + '</p>' : "") +
        '<div class="actions"><button class="btn secondary" type="button" data-open-packet="' + esc(a.id) + '">Open packet</button></div>' +
      '</article>';
    }).join("");
    return '<h1>Progress tracker</h1>' + cards;
  }

  function viewPacket() {
    var a = state.applications.find(function (x) { return x.id === openPacketId; });
    if (!a) return '<section class="panel"><p>Packet not found.</p><button class="btn" data-go="tracker">Back to tracker</button></section>';
    var prog = BF.programById(a.programId) || {};
    var checks = (a.checklist || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join("");
    var fields = (a.summary || []).map(function (row) {
      return '<p><strong>' + esc(row.label) + ':</strong> ' + esc(row.value) + '</p>';
    }).join("");
    return (
      '<section class="panel">' +
        '<p class="fine">Application packet — not submitted to government.</p>' +
        '<h1>' + esc(a.name) + '</h1>' +
        '<p><span class="tag status-' + esc(a.status) + '">' + esc(statusLabel(a.status)) + '</span>' +
        '<span class="tag ' + esc(a.route) + '">' + esc(routeLabel(a.route)) + '</span></p>' +
        '<p>' + esc(prog.summary || "") + '</p>' +
        '<p>Benefit year: ' + esc(prog.benefitYear || "") + '</p>' +
        '<p>Listed amount: ' + esc(a.amountLabel) + '</p>' +
        '<h2>Prefilled summary</h2>' + fields +
        '<h2>Documents checklist</h2><ul>' + checks +
          (state.idMeta.length ? '<li>Government ID already stored on this device (' + state.idMeta.length + ' file(s) — not attached or transmitted)</li>' : '<li>Government ID still needed</li>') +
        '</ul>' +
        '<p><a href="' + esc(prog.officialUrl) + '" target="_blank" rel="noopener">Official application or program page</a></p>' +
        '<div class="actions"><button class="btn secondary" type="button" data-go="tracker">Back to tracker</button></div>' +
      '</section>'
    );
  }

  function viewReferral() {
    var mine = state.referralLedger.filter(function (r) { return r.code === state.referralCode; });
    var earned = mine.reduce(function (s, r) { return s + (r.credit || 0); }, 0);
    var rows = mine.length ? mine.map(function (r) {
      return '<tr><td>' + esc(formatDate(r.date)) + '</td><td>' + esc(r.fromName || "Referred client") + '</td><td>' + fmtMoney(r.found) + '</td><td>' + fmtMoney(r.credit) + '</td></tr>';
    }).join("") : '<tr><td colspan="4">No referral credits yet.</td></tr>';
    return (
      '<section class="panel">' +
        '<h1>Referral dashboard</h1>' +
        '<p>Your referral code is <strong id="myReferralCode">' + esc(state.referralCode) + '</strong>. When a person you refer has a find approved, you earn a bonus finder’s fee on their approved amount (default 1%, set by the owner). Disability Tax Credit items are left out of that percentage, the same way as the owner fee.</p>' +
        '<p>Credits earned: <strong id="referralEarned">' + fmtMoney(earned) + '</strong></p>' +
        '<div class="table-wrap"><table><thead><tr><th>Date</th><th>From</th><th>Approved finds</th><th>Credit</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (state.referralCodeEntered ? '<p class="fine">You entered referrer code ' + esc(state.referralCodeEntered) + '. If your finds are approved, that code receives the credit.</p>' : "") +
        '<div class="actions"><button class="btn secondary" type="button" data-go="more">Back</button></div>' +
      '</section>'
    );
  }

  function approvedFeeItems() {
    return state.applications.filter(function (a) { return a.status === "approved"; }).map(function (a) {
      return { amountCad: a.feeBase, dtcContingent: a.dtcContingent, feeCapped: a.feeCapped };
    });
  }

  function viewOwner() {
    var fees = BF.computeFees(approvedFeeItems(), state.settings);
    var refOwed = state.referralLedger.reduce(function (s, r) { return s + (r.credit || 0); }, 0);
    var acc = state.applications.filter(function (a) { return a.route === "accountant"; });
    var direct = state.applications.filter(function (a) { return a.route === "direct"; });
    function appRows(list) {
      if (!list.length) return '<tr><td colspan="5">None</td></tr>';
      return list.map(function (a) {
        return '<tr>' +
          '<td>' + esc(a.name) + '</td>' +
          '<td><span class="tag status-' + esc(a.status) + '">' + esc(statusLabel(a.status)) + '</span></td>' +
          '<td>' + esc(a.amountLabel) + '</td>' +
          '<td>' + esc(formatDate((a.history[a.history.length - 1] || {}).date)) + '</td>' +
          '<td>' +
            '<button class="btn ghost" type="button" data-advance="' + esc(a.id) + '">Advance status</button>' +
          '</td></tr>';
      }).join("");
    }
    var clientName = state.profile.displayName || "Current client on this device";
    return (
      '<section class="panel">' +
        '<h1>Owner desk</h1>' +
        '<p class="muted">Prototype only. Settings and queues stay on this device. Do not put anyone’s email or phone number here if this device is shared.</p>' +
        '<div class="grid-2">' +
          '<label class="field"><span>Owner fee on approved finds (2% to 4%)</span>' +
            '<input type="number" id="feePercent" min="2" max="4" step="0.1" value="' + esc(state.settings.feePercent) + '">' +
          '</label>' +
          '<label class="field"><span>Referral bonus (percent of approved finds)</span>' +
            '<input type="number" id="referralPercent" min="0" max="10" step="0.1" value="' + esc(state.settings.referralPercent) + '">' +
          '</label>' +
        '</div>' +
        '<label class="field"><span>Accountant specialist name (optional)</span>' +
          '<input type="text" id="accountantName" maxlength="80" value="' + esc(state.settings.accountantName || "") + '" placeholder="Name only">' +
        '</label>' +
        '<div class="actions"><button class="btn" type="button" id="btnSaveSettings">Save settings</button></div>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>Fees and credits owed</h2>' +
        '<p id="ownerFees">Approved finds in the percentage base: ' + fmtMoney(fees.baseFound) +
          '. Owner fee at ' + esc(String(fees.feePercent)) + '%: <strong>' + fmtMoney(fees.percentFee) + '</strong>.</p>' +
        '<p id="ownerReferral">Referral credits owed: <strong>' + fmtMoney(refOwed) + '</strong>' +
          (state.referralLedger.length ? ' (' + state.referralLedger.map(function (r) {
            return esc(r.code) + ' ' + fmtMoney(r.credit);
          }).join(', ') + ')' : '') + '.</p>' +
        '<p class="fine">DTC-related items are excluded from the percentage fee. Any DTC assistance fee is capped at $100.</p>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>Clients</h2>' +
        '<p>' + esc(clientName) + ' · ' + state.applications.length + ' packet(s) · income ' +
          (state.profile.householdIncome === "" ? "—" : fmtMoney(num(state.profile.householdIncome))) + '</p>' +
      '</section>' +
      '<section class="panel">' +
        '<h2 id="accountantQueue">Accountant queue</h2>' +
        '<p class="fine">Tax-related programs (filed through a tax return or the CRA), including GST/HST successor benefits, CCB, CWB, the DTC, and Manitoba tax credits.</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Program</th><th>Status</th><th>Amount</th><th>Updated</th><th></th></tr></thead><tbody>' +
          appRows(acc) + '</tbody></table></div>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>Submit directly</h2>' +
        '<div class="table-wrap"><table><thead><tr><th>Program</th><th>Status</th><th>Amount</th><th>Updated</th><th></th></tr></thead><tbody>' +
          appRows(direct) + '</tbody></table></div>' +
      '</section>'
    );
  }

  function readForm(form) {
    var p = state.profile;
    $$("input, select, textarea", form).forEach(function (el) {
      var n = el.name;
      if (!n) return;
      if (el.type === "checkbox") {
        if (n.indexOf("childDtc") === 0) return;
        p[n] = el.checked;
      } else if (n.indexOf("childAge") === 0 || n.indexOf("childDtc") === 0) {
        return;
      } else if (n === "referralCodeEntered") {
        state.referralCodeEntered = el.value.trim().toUpperCase();
      } else {
        p[n] = el.value;
      }
    });
    var kids = [];
    $$("[data-child]", form).forEach(function (row) {
      var i = row.getAttribute("data-child");
      var ageEl = form.querySelector('[name="childAge' + i + '"]');
      var dtcEl = form.querySelector('[name="childDtc' + i + '"]');
      kids.push({ age: ageEl ? ageEl.value : "", hasDtc: !!(dtcEl && dtcEl.checked) });
    });
    if (form.querySelector("#kids")) p.children = kids;
  }

  function bindView() {
    $$("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.getAttribute("data-go")); });
    });
    var start = $("#btnStart");
    if (start) start.addEventListener("click", function () { state.intakeStep = state.intakeStep || 1; setView("intake"); });
    var owner = $("#btnOwner");
    if (owner) owner.addEventListener("click", function () {
      if (window.confirm("Open the owner desk? In this prototype it is not locked, and it stays on this device.")) setView("owner");
    });
    var form = $("#intakeForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        readForm(form);
        if (state.viewed === "intake" && state.intakeStep === 5) {
          save();
          state.selectedIds = [];
          setView("results");
          return;
        }
        state.intakeStep = Math.min(5, (state.intakeStep || 1) + 1);
        save();
        render();
      });
    }
    var back = $("#btnBack");
    if (back) back.addEventListener("click", function () {
      if (form) readForm(form);
      state.intakeStep = Math.max(1, (state.intakeStep || 1) - 1);
      save();
      render();
    });
    var add = $("#btnAddChild");
    if (add) add.addEventListener("click", function () {
      if (form) readForm(form);
      state.profile.children = state.profile.children || [];
      state.profile.children.push({ age: "", hasDtc: false });
      save();
      render();
    });
    var idFile = $("#idFile");
    if (idFile) idFile.addEventListener("change", onIdFiles);
    loadThumbs();
    $$("[data-select]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-select");
        if (cb.checked) {
          if (state.selectedIds.indexOf(id) < 0) state.selectedIds.push(id);
        } else {
          state.selectedIds = state.selectedIds.filter(function (x) { return x !== id; });
        }
        save();
      });
    });
    var approve = $("#btnApprove");
    if (approve) approve.addEventListener("click", approveSelected);
    $$("[data-open-packet]").forEach(function (b) {
      b.addEventListener("click", function () {
        openPacketId = b.getAttribute("data-open-packet");
        setView("packet");
      });
    });
    var saveSet = $("#btnSaveSettings");
    if (saveSet) saveSet.addEventListener("click", function () {
      state.settings.feePercent = BF.clampFeePercent($("#feePercent").value);
      state.settings.referralPercent = Math.max(0, Number($("#referralPercent").value) || 0);
      state.settings.accountantName = ($("#accountantName").value || "").trim();
      save();
      render();
    });
    $$("[data-advance]").forEach(function (b) {
      b.addEventListener("click", function () { advanceStatus(b.getAttribute("data-advance")); });
    });
  }

  function onIdFiles(ev) {
    var files = ev.target.files || [];
    var jobs = [];
    for (var i = 0; i < files.length; i++) {
      jobs.push(storeIdFile(files[i]));
    }
    Promise.all(jobs).then(function () {
      save();
      render();
    });
  }

  function storeIdFile(file) {
    var id = "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    return BF.idb.put(id, file).then(function () {
      state.idMeta.push({ id: id, name: file.name || "ID document", type: file.type || "", size: file.size || 0, addedAt: new Date().toISOString() });
    });
  }

  function loadThumbs() {
    $$("img[data-thumb]").forEach(function (img) {
      var id = img.getAttribute("data-thumb");
      BF.idb.get(id).then(function (blob) {
        if (!blob) return;
        if (blob.type && blob.type.indexOf("image/") !== 0) return;
        img.src = URL.createObjectURL(blob);
      });
    });
  }

  function amountLabel(est) {
    if (!est || est.kind === "varies" || est.amountCad == null) return "Amount varies";
    var prefix = est.kind === "maximum" ? "Up to " : "About ";
    return prefix + fmtMoney(est.amountCad);
  }

  function approveSelected() {
    var all = matches();
    var chosen = all.filter(function (m) {
      return m.estimate.match && state.selectedIds.indexOf(m.program.id) >= 0;
    });
    if (!chosen.length) {
      window.alert("Select at least one program to approve.");
      return;
    }
    var p = state.profile;
    var existing = {};
    state.applications.forEach(function (a) { existing[a.programId] = true; });
    chosen.forEach(function (m) {
      if (existing[m.program.id]) return;
      var est = m.estimate;
      var feeBase = BF.feeBaseAmount(est.amountCad, m.program);
      var app = {
        id: "app-" + Date.now() + "-" + m.program.id,
        programId: m.program.id,
        name: m.program.name,
        route: m.program.route,
        status: "submitted",
        history: [{ status: "submitted", date: todayISO() }],
        amountCad: est.amountCad,
        amountLabel: amountLabel(est) + " · " + m.program.benefitYear,
        feeBase: feeBase,
        dtcContingent: !!m.program.dtcContingent,
        feeCapped: !!m.program.feeCapped,
        checklist: (m.program.checklist || []).slice(),
        officialUrl: m.program.officialUrl,
        summary: [
          { label: "Name on this form", value: p.displayName || "Not provided" },
          { label: "Age", value: String(p.age || "—") },
          { label: "Province", value: p.province || "—" },
          { label: "Marital status", value: p.marital || "—" },
          { label: "Household income entered", value: p.householdIncome === "" ? "Not provided" : fmtMoney(num(p.householdIncome)) },
          { label: "Housing", value: p.housing || "—" },
          { label: "Children in care", value: String((p.children || []).length) }
        ]
      };
      state.applications.push(app);
    });
    save();
    setView("tracker");
  }

  function advanceStatus(id) {
    var a = state.applications.find(function (x) { return x.id === id; });
    if (!a) return;
    var next = { submitted: "in-review", "in-review": "approved", approved: "approved", denied: "denied" }[a.status];
    if (a.status === "approved" || a.status === "denied") {
      var deny = window.confirm("This packet is already " + statusLabel(a.status) + ". Press OK to mark it Denied, or Cancel to leave it.");
      if (!deny) return;
      next = "denied";
      if (a.status === "approved") retractReferral(a);
    }
    var prev = a.status;
    a.status = next;
    a.history.push({ status: next, date: todayISO() });
    if (next === "approved" && prev !== "approved") addReferralCredit(a);
    save();
    render();
  }

  function addReferralCredit(app) {
    var code = (state.referralCodeEntered || "").trim().toUpperCase();
    if (!code) return;
    if (app.feeBase <= 0) return;
    var rate = Math.max(0, Number(state.settings.referralPercent) || 0) / 100;
    var credit = Math.round(app.feeBase * rate * 100) / 100;
    if (credit <= 0) return;
    state.referralLedger.push({
      code: code,
      fromName: state.profile.displayName || "Current client on this device",
      found: app.feeBase,
      credit: credit,
      date: todayISO(),
      applicationId: app.id
    });
  }

  function retractReferral(app) {
    state.referralLedger = state.referralLedger.filter(function (r) { return r.applicationId !== app.id; });
  }

  function bindChrome() {
    $("#btnHome").addEventListener("click", function () { setView("home"); });
    $("#btnInstall").addEventListener("click", function () { promptInstall(); });
    $("#btnInstallNow").addEventListener("click", function () { promptInstall(); });
    $("#btnInstallDismiss").addEventListener("click", function () {
      installDismissed = true;
      hideInstallBanner();
    });
    $$(".tabbar button").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.disabled) return;
        setView(b.getAttribute("data-view"));
      });
    });
    document.getElementById("appName").textContent = BF.APP_NAME;
    document.title = BF.APP_NAME;
  }

  bindChrome();
  setupInstall();
  registerSW();
  render();
})();
