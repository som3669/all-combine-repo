/**
 * Sends visitors to the CPAGrip-hosted content locker with a per-visitor
 * tracking_id, so the postback Worker can attribute each conversion back to
 * this page.
 *
 * The page never completes an offer and never fabricates a conversion. It opens
 * a link and waits, which is the only honest thing it can do.
 */

(function () {
  'use strict';

  var CFG = window.RV_CONFIG || {};
  var STORE_KEY = 'rv_visitor';
  var OPENED_KEY = 'rv_opened';

  var unlockEl = document.getElementById('unlock');
  var reopenEl = document.getElementById('reopen');
  var resetEl = document.getElementById('reset');
  var statusEl = document.getElementById('status');
  var refEl = document.getElementById('ref');
  var rewardEl = document.getElementById('reward-name');

  /** Stable per-browser id. Reused across visits so a late postback still matches. */
  function visitorId() {
    var id = localStorage.getItem(STORE_KEY);
    if (!id) {
      id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(STORE_KEY, id);
    }
    return id;
  }

  /** CPAGrip passes tracking_id straight through to the postback URL. */
  function lockerLink(id) {
    var base = CFG.lockerUrl;
    if (!base) return null;
    try {
      var u = new URL(base);
      u.searchParams.set('tracking_id', id);
      return u.toString();
    } catch (e) {
      return base + (base.indexOf('?') === -1 ? '?' : '&') + 'tracking_id=' + encodeURIComponent(id);
    }
  }

  function showStatus() {
    statusEl.hidden = false;
  }

  var id = visitorId();
  var link = lockerLink(id);

  if (rewardEl && CFG.rewardName) rewardEl.textContent = CFG.rewardName;
  if (refEl) refEl.textContent = id;

  if (!link) {
    unlockEl.textContent = 'Offers unavailable';
    unlockEl.setAttribute('aria-disabled', 'true');
    unlockEl.addEventListener('click', function (e) {
      e.preventDefault();
    });
    return;
  }

  unlockEl.href = link;
  unlockEl.textContent = 'Unlock ' + (CFG.rewardName || 'reward');
  reopenEl.href = link;

  unlockEl.addEventListener('click', function () {
    localStorage.setItem(OPENED_KEY, String(Date.now()));
    showStatus();
  });

  resetEl.addEventListener('click', function () {
    localStorage.removeItem(OPENED_KEY);
    statusEl.hidden = true;
  });

  // Someone who already opened the wall comes back to the waiting state, not step one.
  if (localStorage.getItem(OPENED_KEY)) showStatus();
})();
