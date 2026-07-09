/* ============================================================
   synaptix-eval v3.1 · frozen — edit by hand only
   Evaluation bundle JS · serves: quiz (9 types) · recall · scenario
   Hand edits are law (00-system-spec.md §2). Version bumps: §8.
   Band thresholds are FILE-P locked doctrine — never soften.
   v3.1: hub footer is plain <a href> in linked mode — no JS change
   needed here; [data-cmd] delegation remains for --inline only.
   ============================================================ */
(function () {
  'use strict';
  var VER = '3.1';
  var root = (typeof window !== 'undefined') ? window : globalThis;

  /* ── Helpers ── */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /* ── Band doctrine (LOCKED: 90+ / 75–89 / <75 — no difficulty exceptions) ── */
  function band(pct) {
    if (pct >= 90) return { key: 'triumph',      label: 'Imperial Triumph',       color: 'var(--green)'  };
    if (pct >= 75) return { key: 'expectation',  label: 'Failure of Expectation', color: 'var(--amber)'  };
    return           { key: 'catastrophic', label: 'Catastrophic Failure',   color: 'var(--salmon)' };
  }

  /* ── Graders — pure functions: (keyEntry, userAnswer) → {score:0..1, user:string} ── */
  var G = {
    mc: function (key, ans) {
      return { score: ans === key ? 1 : 0, user: ans || '\u2014' };
    },
    tof: function (key, ans) {
      var has = (typeof ans === 'boolean');
      return { score: (has && ans === key) ? 1 : 0, user: has ? (ans ? 'TRUE' : 'FALSE') : '\u2014' };
    },
    connect: function (key, ans) {
      return { score: ans === key ? 1 : 0, user: ans || '\u2014' };
    },
    fill: function (key, ans) {
      var u = norm(ans);
      var ok = u !== '' && (key || []).some(function (a) { return norm(a) === u; });
      return { score: ok ? 1 : 0, user: (ans && String(ans).trim()) || '\u2014' };
    },
    enum: function (key, ans) {
      var items = (key && key.items) || [];
      var n = items.length;
      if (!n) return { score: 0, user: '\u2014' };
      var accepted = items.map(function (it) {
        return (Array.isArray(it) ? it : [it]).map(norm);
      });
      var answers = (ans || []).map(norm);
      var hit = 0;
      if (key.orderMatters) {
        for (var i = 0; i < n; i++) {
          if (answers[i] && accepted[i].indexOf(answers[i]) > -1) hit++;
        }
      } else {
        var used = [];
        answers.forEach(function (a) {
          if (!a) return;
          for (var j = 0; j < n; j++) {
            if (used.indexOf(j) > -1) continue;
            if (accepted[j].indexOf(a) > -1) { used.push(j); hit++; return; }
          }
        });
      }
      var shown = (ans || []).filter(function (x) { return x && String(x).trim(); }).join(', ');
      return { score: hit / n, user: shown || '\u2014' };
    },
    modtf: function (key, ans) {
      if (!ans || typeof ans.val !== 'boolean') return { score: 0, user: '\u2014' };
      if (ans.val !== key.isTrue) return { score: 0, user: ans.val ? 'TRUE' : 'FALSE' };
      if (key.isTrue) return { score: 1, user: 'TRUE' };
      var fix = norm(ans.fix);
      var ok = fix !== '' && (key.corrections || []).some(function (c) { return norm(c) === fix; });
      return { score: ok ? 1 : 0.5, user: 'FALSE \u2014 ' + ((ans.fix && String(ans.fix).trim()) || 'no correction') };
    },
    timeline: function (key, ans) {
      var n = (key || []).length;
      if (!n) return { score: 0, user: '\u2014' };
      var hit = 0;
      for (var i = 0; i < n; i++) { if (ans && ans[i] === key[i]) hit++; }
      var shown = (ans || []).filter(Boolean).join(' \u2192 ');
      return { score: hit / n, user: shown || '\u2014' };
    },
    essay: function (key, ans) {
      var mp = (key && key.maxPoints) || 1;
      var s = (ans && typeof ans.self === 'number') ? ans.self : null;
      if (s == null) return { score: 0, user: 'not self-scored' };
      return { score: Math.max(0, Math.min(1, s / mp)), user: 'self: ' + s + '/' + mp };
    },
    concept: function (key, ans) { return G.essay(key, ans); }
  };

  var TYPES = ['mc', 'tof', 'connect', 'fill', 'enum', 'modtf', 'timeline', 'essay', 'concept'];
  var LABEL = {
    mc: 'Multiple Choice', tof: 'True or False', connect: 'Connect',
    fill: 'Fill-In', enum: 'Enumeration', modtf: 'Modified T/F',
    timeline: 'Timeline', essay: 'Essay', concept: 'Concept'
  };

  /* ── Expose pure core (testing + inspection) ── */
  root.SynaptixEval = { version: VER, graders: G, band: band, norm: norm, types: TYPES, labels: LABEL };

  /* ── sendPrompt: chat bridge (Claude artifact context only) ── */
  root.sendPrompt = root.sendPrompt || function (text) {
    if (root.parent && root.parent.postMessage) {
      root.parent.postMessage({ type: 'user_message', message: text }, '*');
    }
  };

  /* ════════════════ DOM LAYER (skipped outside browsers) ════════════════ */
  if (typeof document === 'undefined' || !document.addEventListener) return;

  var S = { data: null, idType: {}, ids: [], answers: {}, submitted: false };
  var DECK = { cards: [], results: [], idx: 0 };

  function $(id) { return document.getElementById(id); }

  function errBanner(msg) {
    var el = document.createElement('div');
    el.className = 'sx-error';
    el.textContent = 'SYNAPTIX payload check: ' + msg;
    var host = document.querySelector('.wrap') || document.body;
    host.insertBefore(el, host.firstChild);
  }

  /* ── Version guard ── */
  function guardVersion() {
    var docVer = document.documentElement.getAttribute('data-synaptix');
    if (docVer && docVer !== VER) {
      console.warn('[synaptix] artifact v' + docVer + ' \u2260 eval assets v' + VER +
        ' \u2014 check 00-system-spec.md \u00a76');
    }
  }

  /* ── Quiz: init + self-check ── */
  function initQuiz(d) {
    S.data = d;
    TYPES.forEach(function (t) {
      var bucket = (d.key && d.key[t]) || {};
      Object.keys(bucket).forEach(function (id) {
        S.ids.push(id); S.idType[id] = t;
      });
    });
    var missing = S.ids.filter(function (id) { return !$(id); });
    var extra = [];
    document.querySelectorAll('.qcard[id], .connect-select[id]').forEach(function (el) {
      var id = el.id;
      if (id && id.indexOf('qcard-') !== 0 && S.idType[id] === undefined) extra.push(id);
    });
    if (missing.length) errBanner('key entries with no matching element \u2014 ' + missing.join(', '));
    if (extra.length)   errBanner('elements with no key entry \u2014 ' + extra.join(', '));
    progress();
  }

  function hasAnswer(id) {
    var t = S.idType[id], a = S.answers[id];
    if (a === undefined) return false;
    if (t === 'fill') return norm(a) !== '';
    if (t === 'enum' || t === 'timeline') return (a || []).some(function (x) { return x && norm(x) !== ''; });
    if (t === 'modtf') return typeof a.val === 'boolean';
    if (t === 'essay' || t === 'concept') return typeof a.self === 'number';
    return true;
  }

  function progress() {
    if (!S.data) return;
    var total = S.ids.length;
    var done = S.ids.filter(hasAnswer).length;
    var pct = total ? Math.round(done / total * 100) : 0;
    var t = $('prog-txt'), p = $('prog-pct'), b = $('prog-bar');
    if (t) t.textContent = done + ' / ' + total + ' answered';
    if (p) p.textContent = pct + '%';
    if (b) b.style.width = pct + '%';
  }

  /* ── Interaction wiring (delegated; all inert after submit) ── */
  document.addEventListener('click', function (e) {
    var cmd = e.target.closest('[data-cmd]');
    if (cmd) { e.preventDefault(); root.sendPrompt(cmd.getAttribute('data-cmd')); return; }

    var fc = e.target.closest('[data-fc]');
    if (fc) { deckAction(fc.getAttribute('data-fc')); return; }

    var rev = e.target.closest('[data-reveal]');
    if (rev) {
      var panel = $(rev.getAttribute('data-reveal'));
      if (panel) panel.classList.add('visible');
      rev.disabled = true;
      return;
    }

    if (S.submitted) return;

    var opt = e.target.closest('.opt[data-q]');
    if (opt) {
      var q = opt.getAttribute('data-q');
      opt.parentNode.querySelectorAll('.opt').forEach(function (o) { o.classList.remove('selected'); });
      opt.classList.add('selected');
      S.answers[q] = opt.getAttribute('data-val');
      progress(); return;
    }

    var tof = e.target.closest('.tof-btn[data-q]');
    if (tof) {
      var q2 = tof.getAttribute('data-q');
      var val = tof.getAttribute('data-val') === 'true';
      tof.parentNode.querySelectorAll('.tof-btn').forEach(function (b) { b.classList.remove('selected'); });
      tof.classList.add('selected');
      if (S.idType[q2] === 'modtf') {
        S.answers[q2] = { val: val, fix: (S.answers[q2] && S.answers[q2].fix) || '' };
        var fw = $(q2 + '-fixwrap');
        if (fw) fw.classList.toggle('show', val === false);
      } else {
        S.answers[q2] = val;
      }
      progress(); return;
    }

    var ss = e.target.closest('.ss-btn[data-q]');
    if (ss) {
      var q3 = ss.getAttribute('data-q');
      ss.parentNode.querySelectorAll('.ss-btn').forEach(function (b) { b.classList.remove('selected'); });
      ss.classList.add('selected');
      S.answers[q3] = { self: Number(ss.getAttribute('data-score')) };
      progress(); return;
    }

    if (e.target.id === 'submit-btn') submitQuiz();
  });

  document.addEventListener('input', function (e) {
    if (S.submitted) return;
    var el = e.target;
    var q = el.getAttribute && el.getAttribute('data-q');
    if (!q) return;
    if (el.classList.contains('fill-input')) {
      if (el.getAttribute('data-role') === 'fix') {
        S.answers[q] = S.answers[q] || {};
        S.answers[q].fix = el.value;
      } else if (S.idType[q] === 'enum') {
        var i = Number(el.getAttribute('data-i') || 0);
        S.answers[q] = S.answers[q] || [];
        S.answers[q][i] = el.value;
      } else {
        S.answers[q] = el.value;
      }
      progress();
    }
  });

  document.addEventListener('change', function (e) {
    if (S.submitted) return;
    var el = e.target;
    var q = el.getAttribute && el.getAttribute('data-q');
    if (!q) return;
    if (el.classList.contains('connect-select')) {
      S.answers[q] = el.value;
    } else if (el.classList.contains('tl-select')) {
      var i = Number(el.getAttribute('data-i') || 0);
      S.answers[q] = S.answers[q] || [];
      S.answers[q][i] = el.value;
    }
    progress();
  });

  /* ── Submit + grade + results ── */
  function submitQuiz() {
    if (S.submitted || !S.data) return;
    S.submitted = true;

    var results = {}, perType = {}, sum = 0;
    S.ids.forEach(function (id) {
      var t = S.idType[id];
      var r = G[t](S.data.key[t][id], S.answers[id]);
      results[id] = r; sum += r.score;
      perType[t] = perType[t] || { sum: 0, n: 0 };
      perType[t].sum += r.score; perType[t].n++;
    });
    var total = S.ids.length;
    var pct = total ? Math.round(sum / total * 100) : 0;
    var bd = band(pct);

    markDom(results);
    lockInputs();
    buildResults(results, perType, sum, total, pct, bd);
  }

  function markDom(results) {
    S.ids.forEach(function (id) {
      var t = S.idType[id], r = results[id], card = $(id);
      var full = r.score >= 0.9999;
      if (card && card.classList.contains('qcard')) {
        card.classList.add(full ? 'answered-correct' : 'answered-wrong');
      }
      if (t === 'mc' && card) {
        var key = S.data.key.mc[id];
        card.querySelectorAll('.opt').forEach(function (o) {
          var v = o.getAttribute('data-val');
          if (v === key) o.classList.add('correct');
          else if (o.classList.contains('selected')) o.classList.add('wrong');
        });
      }
      if ((t === 'tof' || t === 'modtf') && card) {
        var isTrue = (t === 'tof') ? S.data.key.tof[id] : S.data.key.modtf[id].isTrue;
        card.querySelectorAll('.tof-btn').forEach(function (b) {
          var v = b.getAttribute('data-val') === 'true';
          if (v === isTrue) b.classList.add('correct');
          else if (b.classList.contains('selected')) b.classList.add('wrong');
        });
      }
      if (t === 'connect') {
        var sel = $(id);
        if (sel && sel.classList.contains('connect-select')) {
          sel.classList.add(full ? 'correct' : 'wrong');
        }
      }
      if (t === 'fill' && card) {
        var inp = card.querySelector('.fill-input[data-q="' + id + '"]:not([data-role])');
        if (inp) inp.classList.add(full ? 'correct' : 'wrong');
      }
      if (t === 'enum' && card) {
        var accepted = (S.data.key.enum[id].items || []).map(function (it) {
          return (Array.isArray(it) ? it : [it]).map(norm);
        });
        card.querySelectorAll('.enum-row .fill-input').forEach(function (inp) {
          var v = norm(inp.value);
          var ok = v !== '' && accepted.some(function (arr) { return arr.indexOf(v) > -1; });
          inp.classList.add(ok ? 'correct' : 'wrong');
        });
      }
      if (t === 'timeline' && card) {
        var keyArr = S.data.key.timeline[id];
        card.querySelectorAll('.tl-select').forEach(function (sel2) {
          var i = Number(sel2.getAttribute('data-i') || 0);
          sel2.classList.add(sel2.value === keyArr[i] ? 'correct' : 'wrong');
        });
      }
    });
  }

  function lockInputs() {
    document.querySelectorAll('.opt,.tof-btn,.ss-btn').forEach(function (b) { b.disabled = true; });
    document.querySelectorAll('.fill-input,.essay-input,.connect-select,.tl-select').forEach(function (el) { el.disabled = true; });
    var sb = $('submit-btn');
    if (sb) {
      sb.textContent = 'Submitted \u2713';
      sb.style.opacity = '0.5';
      sb.style.cursor = 'not-allowed';
      sb.disabled = true;
    }
  }

  function pctColor(p) {
    return p >= 85 ? 'var(--green)' : (p >= 70 ? 'var(--amber)' : 'var(--salmon)');
  }

  function buildResults(results, perType, sum, total, pct, bd) {
    var meta = S.data.meta || {};
    var banner = $('score-banner');
    if (banner) banner.style.borderTopColor = bd.color;
    var bt = $('score-band-txt'), pt = $('score-pct-txt'), rt = $('score-raw-txt');
    if (bt) { bt.textContent = bd.label; bt.style.color = bd.color; }
    if (pt) { pt.textContent = pct + '%'; pt.style.color = bd.color; }
    if (rt) rt.textContent = (Math.round(sum * 10) / 10) + ' / ' + total + ' points';

    var grid = $('section-grid');
    if (grid) {
      grid.innerHTML = '';
      TYPES.forEach(function (t) {
        if (!perType[t]) return;
        var p = Math.round(perType[t].sum / perType[t].n * 100);
        var cardEl = document.createElement('div');
        cardEl.className = 'sg-card';
        cardEl.innerHTML =
          '<div class="sg-lbl"></div><div class="sg-pct"></div><div class="sg-raw"></div>';
        cardEl.querySelector('.sg-lbl').textContent = LABEL[t];
        var pe = cardEl.querySelector('.sg-pct');
        pe.textContent = p + '%'; pe.style.color = pctColor(p);
        cardEl.querySelector('.sg-raw').textContent =
          (Math.round(perType[t].sum * 10) / 10) + '/' + perType[t].n;
        grid.appendChild(cardEl);
      });
    }

    var panel = $('imperial-panel'), body = $('imperial-body');
    if (panel && body) {
      if (meta.plain) {
        panel.style.display = 'none';
      } else {
        var verdicts = meta.verdicts || {};
        var strong = [], weak = [];
        TYPES.forEach(function (t) {
          if (!perType[t]) return;
          var p = Math.round(perType[t].sum / perType[t].n * 100);
          if (p >= 85) strong.push(LABEL[t] + ' \u2014 ' + p + '%');
          else if (p < 70) weak.push(LABEL[t] + ' \u2014 ' + p + '%');
        });
        var html = '<div class="imperial-verdict"></div>' +
          '<div class="imperial-intel"><div class="intel-label">Allied Intelligence Report</div>' +
          '<ul class="intel-list" id="intel-list"></ul></div>';
        body.innerHTML = html;
        body.querySelector('.imperial-verdict').textContent =
          verdicts[bd.key] || (bd.label + ' \u2014 the chronicles record this campaign.');
        var list = body.querySelector('#intel-list');
        function li(text, cls) {
          var el = document.createElement('li');
          if (cls) { var sp = document.createElement('span'); sp.className = cls; sp.textContent = text; el.appendChild(sp); }
          else el.textContent = text;
          list.appendChild(el);
        }
        strong.forEach(function (s) { li('Secured territory: ' + s, 'intel-strong'); });
        weak.forEach(function (w) { li('Contested territory: ' + w, 'intel-weak'); });
        if (weak.length) li('Recommended operation: /recall mixed(10) hard \u2014 focus: ' +
          weak.map(function (w) { return w.split(' \u2014 ')[0]; }).join(', '));
        else li('All sections held. No remedial operations required.');
      }
    }

    S.ids.forEach(function (id) {
      var item = document.querySelector('.key-item[data-q="' + id + '"]');
      if (!item) return;
      var full = results[id].score >= 0.9999;
      item.classList.add(full ? 'ki-correct' : 'ki-wrong');
      if (!full) {
        var you = document.createElement('span');
        you.className = 'key-you';
        you.textContent = 'You: ' + results[id].user;
        item.appendChild(you);
      }
    });

    var rs = $('results-section');
    if (rs) {
      rs.classList.add('show');
      rs.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ── Deck (recall) — per-card results tracking (V2 defect fixed) ── */
  function initDeck(d) {
    DECK.cards = (d.cards || []).slice();
    if (d.meta && d.meta.shuffle) {
      for (var i = DECK.cards.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = DECK.cards[i]; DECK.cards[i] = DECK.cards[j]; DECK.cards[j] = tmp;
      }
    }
    DECK.results = []; DECK.idx = 0;
    if (!DECK.cards.length) { errBanner('deck payload contains zero cards'); return; }
    renderCard();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderCard() {
    var w = $('fc-wrap');
    if (!w) return;
    var c = DECK.cards[DECK.idx];
    w.innerHTML =
      '<div class="fc-progress">Card ' + (DECK.idx + 1) + ' of ' + DECK.cards.length + '</div>' +
      '<div class="fc-scene"><div class="fc-card" id="fc-card" data-fc="flip">' +
      '<div class="fc-face"><p>' + esc(c.front) + '</p>' +
      (c.hint ? '<div class="fc-hint">' + esc(c.hint) + '</div>' : '') + '</div>' +
      '<div class="fc-face fc-back-face"><p>' + esc(c.back) + '</p>' +
      '<div class="fc-ref">' + esc(c.section || '') + (c.sectionTitle ? ' \u00b7 ' + esc(c.sectionTitle) : '') + '</div>' +
      (c.marker ? '<div class="fc-marker">' + esc(c.marker) + '</div>' : '') + '</div></div></div>' +
      '<button class="fc-flip-btn" id="fc-flip-btn" data-fc="flip">Flip Card</button>' +
      '<div class="fc-actions" id="fc-actions">' +
      '<button class="fc-btn fc-btn-got" data-fc="got">Got it</button>' +
      '<button class="fc-btn fc-btn-missed" data-fc="missed">Missed it</button></div>' +
      (DECK.idx > 0 ? '<div class="fc-nav"><button class="fc-nav-btn" data-fc="prev">\u2190 Previous card</button></div>' : '');
  }

  function deckAction(action) {
    if (action === 'flip') {
      var card = $('fc-card'), fb = $('fc-flip-btn'), fa = $('fc-actions');
      if (card) card.classList.add('flipped');
      if (fb) fb.style.display = 'none';
      if (fa) fa.classList.add('show');
      return;
    }
    if (action === 'got' || action === 'missed') {
      DECK.results[DECK.idx] = (action === 'got');
      DECK.idx++;
      if (DECK.idx >= DECK.cards.length) deckSummary(); else renderCard();
      return;
    }
    if (action === 'prev') {
      DECK.idx = Math.max(0, DECK.idx - 1);
      renderCard();
      return;
    }
    if (action === 'restart') {
      DECK.results = []; DECK.idx = 0; renderCard();
    }
  }

  function deckSummary() {
    var w = $('fc-wrap');
    if (!w) return;
    var total = DECK.cards.length;
    var got = DECK.results.filter(function (r) { return r === true; }).length;
    var missed = total - got;
    var pct = Math.round(got / total * 100);
    var reviewSecs = [];
    DECK.cards.forEach(function (c, i) {
      if (DECK.results[i] !== true && c.section && reviewSecs.indexOf(c.section) === -1) {
        reviewSecs.push(c.section);
      }
    });
    w.innerHTML =
      '<div class="fc-summary">' +
      '<div class="fc-sum-title">Session complete \u2014 ' + total + ' cards</div>' +
      '<div class="fc-sum-row">Got it: <strong>' + got + ' (' + pct + '%)</strong></div>' +
      '<div class="fc-sum-row">Missed it: <strong>' + missed + ' (' + (100 - pct) + '%)</strong></div>' +
      '<div class="fc-sum-row">Review: ' +
      (reviewSecs.length ? esc(reviewSecs.join(', ')) : 'none \u2014 clean run') + '</div>' +
      '<div class="fc-nav"><button class="fc-nav-btn" data-fc="restart">Study again</button></div>' +
      '</div>';
  }

  /* ── Boot ── */
  function boot() {
    guardVersion();
    var d = root.SYNAPTIX_DATA;
    if (!d) return; /* scenario + footers are payload-free; delegation above covers them */
    if (d.kind === 'quiz') initQuiz(d);
    else if (d.kind === 'deck') initDeck(d);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
