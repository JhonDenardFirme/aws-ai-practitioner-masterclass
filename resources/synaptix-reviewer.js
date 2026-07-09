/* ============================================================
   synaptix-reviewer v3.1 · frozen — edit by hand only
   Reviewer bundle JS · version guard + --inline footer wiring only
   Hand edits are law (00-system-spec.md §2). Version bumps: §8.
   v3.1: linked-mode hub footer is plain <a href> — no JS involved.
   The [data-cmd] handler below exists solely for --inline mode.
   ============================================================ */
(function () {
  'use strict';
  var VER = '3.1';

  /* ── Version guard ── */
  var docVer = document.documentElement.getAttribute('data-synaptix');
  if (docVer && docVer !== VER) {
    console.warn('[synaptix] artifact v' + docVer + ' \u2260 reviewer assets v' + VER +
      ' \u2014 check 00-system-spec.md \u00a76');
  }

  /* ── sendPrompt: chat bridge (functional in Claude artifact context only) ── */
  window.sendPrompt = window.sendPrompt || function (text) {
    if (window.parent && window.parent.postMessage) {
      window.parent.postMessage({ type: 'user_message', message: text }, '*');
    }
  };

  /* ── Footer wiring ──
     Site mode  : footer buttons are plain <a href> links — no JS involved.
     Chat/inline: footer buttons carry data-cmd="/quiz mc(10) hard" etc.   */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cmd]');
    if (btn) {
      e.preventDefault();
      window.sendPrompt(btn.getAttribute('data-cmd'));
    }
  });
})();
