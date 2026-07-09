/*!
 * Synaptix Index JS
 * Version: 3.1.0 · frozen — edit by hand only
 * Scope: Index & Collection Pages (index.html, 00_*.html)
 *
 * Handles collection filtering, search, sorting, and navigation
 * for Synaptix course index and category collection pages.
 *
 * DO NOT import in educational artifacts (reviewer, compact, tree, quiz,
 * recall, scenario). Those use synaptix-reviewer.js / synaptix-eval.js —
 * there is deliberately no shared "synaptix-runtime.js"; see 00-system-spec.md §1.
 *
 * v3.1: adopted wholesale from the hand-built golden reference. No logic
 * changes from that reference — card markup (_renderCard) already matches
 * the Artifact Type Color Law reconciliation made in synaptix-index.css v3.1
 * (colorClass is read from the module descriptor's own `color` field, which
 * is cyclic per module — see 00-system-spec.md §7 — not the artifact-type
 * color law in §6; the two are independent, by design).
 */


/* ════════════════════════════════════════════
   SECTION 1 — MODULE REGISTRY
   ════════════════════════════════════════════

   In-memory registry of all known modules.
   Collection pages embed this as inline JSON data
   and call snxIndex.init(moduleData).
*/

var snxIndex = {

  modules: [],    /* module data from page */
  filtered: [],   /* currently visible modules */
  activeFilter: 'all',
  searchQuery: '',

  /**
   * Initialize the collection with module data.
   * @param {Array} modules — array of module descriptor objects
   *
   * Module descriptor shape (00-system-spec.md §7, spec-index-bundle.md PART A):
   * {
   *   id: '01',
   *   title: 'string',
   *   description: 'string',
   *   tag: 'Foundational' | 'Introduction' | 'Core Concept' | 'Specialization'
   *      | 'Technique' | 'Implementation' | 'Mastery',
   *   color: 'orange' | 'sky' | 'cyan' | 'purple' | 'green' | 'amber',  // cyclic by module id
   *   sections: 6,
   *   duration: '60 min',
   *   reviewer: '../modules/01_slug-reviewer.html',
   *   compact:  '../compact/01_slug-compact.html',
   *   tree:     '../trees/01_slug-tree.html',
   *   quiz:     '../quizzes/01_slug-quiz.html',
   *   recall:   '../recalls/01_slug-recall.html'
   * }
   */
  init: function(modules) {
    this.modules  = modules;
    this.filtered = modules.slice();
    this.render();
    this.updateStats();
    this._attachSearch();
  },

  /* ── Filtering ── */

  /**
   * Filter visible modules by tag.
   * @param {string} tag — 'all' or one of the closed Taxonomy values (§7)
   */
  filterBy: function(tag) {
    this.activeFilter = tag;
    this._applyFilters();
    this._updateFilterButtons(tag);
  },

  /* ── Search ── */

  /**
   * Search modules by title and description.
   * Called on input event by _attachSearch().
   */
  search: function(query) {
    this.searchQuery = query.toLowerCase().trim();
    this._applyFilters();
  },

  /* ── Sorting ── */

  /**
   * Sort the filtered module list.
   * @param {string} field — 'id' | 'title'
   */
  sortBy: function(field) {
    this.filtered.sort(function(a, b) {
      if (field === 'id') return parseInt(a.id) - parseInt(b.id);
      if (field === 'title') return a.title.localeCompare(b.title);
      return 0;
    });
    this.render();
  },

  /* ── Rendering ── */

  /**
   * Render current filtered module list into #snx-collection.
   * Falls back to empty state if no modules match.
   */
  render: function() {
    var container = document.getElementById('snx-collection');
    if (!container) return;

    if (this.filtered.length === 0) {
      container.innerHTML = this._emptyState();
      return;
    }

    var html = '';
    for (var i = 0; i < this.filtered.length; i++) {
      html += this._renderCard(this.filtered[i]);
    }
    container.innerHTML = html;
  },

  /**
   * Render a single module card for the collection.
   * @param {Object} m — module descriptor
   * @returns {string} HTML string
   */
  _renderCard: function(m) {
    var colorClass = 'b-' + m.color;
    return (
      '<div class="rm-row">' +
        '<div class="rm-spine">' +
          '<div class="rm-dot ' + colorClass + '">' + m.id + '</div>' +
          '<div class="rm-line"></div>' +
        '</div>' +
        '<div class="rm-card">' +
          '<div class="rm-card-hdr">' +
            '<div>' +
              '<div class="rm-num" style="color:var(--' + m.color + ')">Module ' + m.id + '</div>' +
              '<div class="rm-title">' + _snxEscape(m.title) + '</div>' +
              '<div class="rm-desc">' + _snxEscape(m.description) + '</div>' +
            '</div>' +
            '<div class="rm-meta"><span class="badge ' + colorClass + '">' + _snxEscape(m.tag) + '</span></div>' +
            '<div class="rm-ghost">' + m.id + '</div>' +
          '</div>' +
          '<div class="rm-card-footer">' +
            '<div class="rm-info">' +
              '<span>' + m.duration + '</span>' +
              '<span>' + m.sections + ' sections</span>' +
            '</div>' +
            '<div class="rm-btns">' +
              (m.reviewer ? '<a class="rm-btn rm-btn-rev"     href="' + m.reviewer + '">Reviewer</a>' : '') +
              (m.compact  ? '<a class="rm-btn rm-btn-compact" href="' + m.compact  + '">Compact</a>'  : '') +
              (m.tree     ? '<a class="rm-btn rm-btn-tree"    href="' + m.tree     + '">Tree</a>'     : '') +
              (m.quiz     ? '<a class="rm-btn rm-btn-quiz"    href="' + m.quiz     + '">Quiz</a>'     : '') +
              (m.recall   ? '<a class="rm-btn rm-btn-rec"     href="' + m.recall   + '">Recall</a>'   : '') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  },

  /**
   * Empty state HTML when no modules match filters/search.
   */
  _emptyState: function() {
    return (
      '<div class="col-empty">' +
        '<div class="col-empty-icon">○</div>' +
        '<div class="col-empty-title">No modules found</div>' +
        '<div class="col-empty-desc">Try clearing your search or changing the filter.</div>' +
      '</div>'
    );
  },

  /* ── Stats ── */

  /**
   * Update collection statistics display.
   * Looks for elements with data-stat attributes.
   */
  updateStats: function() {
    var total   = document.getElementById('snx-stat-total');
    var visible = document.getElementById('snx-stat-visible');

    if (total)   total.textContent   = this.modules.length;
    if (visible) visible.textContent = this.filtered.length;
  },

  /* ── Internal helpers ── */

  _applyFilters: function() {
    var self = this;
    this.filtered = this.modules.filter(function(m) {
      var tagMatch  = self.activeFilter === 'all' || m.tag === self.activeFilter;
      var termMatch = !self.searchQuery ||
        m.title.toLowerCase().indexOf(self.searchQuery) >= 0 ||
        m.description.toLowerCase().indexOf(self.searchQuery) >= 0;
      return tagMatch && termMatch;
    });
    this.render();
    this.updateStats();
  },

  _updateFilterButtons: function(activeTag) {
    var btns = document.querySelectorAll('.col-filter-btn');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var tag = btn.getAttribute('data-filter');
      if (tag === activeTag) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  },

  _attachSearch: function() {
    var self  = this;
    var input = document.getElementById('snx-search');
    if (!input) return;
    input.addEventListener('input', function() {
      self.search(input.value);
    });
  }

};


/* ════════════════════════════════════════════
   SECTION 2 — PROGRESS TRACKING
   ════════════════════════════════════════════

   Reads and writes module completion state to localStorage.
   Keys: 'snx_progress_{moduleId}_{artifactType}'
   Values: 'not-started' | 'in-progress' | 'complete'

   NOTE: localStorage is appropriate here because index/collection pages
   are the user's own deployed static site, not a Claude artifact — this
   does not conflict with any Claude-artifact sandbox restriction.
   It must NOT be used in educational artifacts (those stay stateless
   aside from the SYNAPTIX_DATA payload read at load).
*/

var snxProgress = {

  PREFIX: 'snx_progress_',

  /**
   * Mark an artifact as complete.
   * @param {string} moduleId — e.g. '01'
   * @param {string} type — 'reviewer' | 'compact' | 'tree' | 'quiz' | 'recall'
   */
  complete: function(moduleId, type) {
    try {
      localStorage.setItem(this.PREFIX + moduleId + '_' + type, 'complete');
    } catch(e) { /* localStorage may be unavailable */ }
  },

  /**
   * Get status for a module artifact.
   * @param {string} moduleId
   * @param {string} type
   * @returns {string} 'not-started' | 'in-progress' | 'complete'
   */
  get: function(moduleId, type) {
    try {
      return localStorage.getItem(this.PREFIX + moduleId + '_' + type) || 'not-started';
    } catch(e) {
      return 'not-started';
    }
  },

  /**
   * Get overall progress for a module (percentage of artifact types complete).
   * @param {string} moduleId
   * @returns {number} 0–100
   */
  moduleProgress: function(moduleId) {
    var types = ['reviewer', 'compact', 'tree', 'quiz', 'recall'];
    var complete = 0;
    for (var i = 0; i < types.length; i++) {
      if (this.get(moduleId, types[i]) === 'complete') complete++;
    }
    return Math.round(complete / types.length * 100);
  },

  /**
   * Clear all progress data.
   */
  reset: function() {
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf(this.PREFIX) === 0) {
          localStorage.removeItem(keys[i]);
        }
      }
    } catch(e) { /* localStorage may be unavailable */ }
  }

};


/* ════════════════════════════════════════════
   SECTION 3 — UTILITY FUNCTIONS
   ════════════════════════════════════════════ */

/**
 * Escape HTML special characters for safe innerHTML insertion.
 * Used internally by snxIndex._renderCard().
 * @param {string} str
 * @returns {string}
 */
function _snxEscape(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Debounce a function call.
 * Used for search input to avoid filtering on every keystroke.
 * @param {Function} fn
 * @param {number} delay — milliseconds
 * @returns {Function}
 */
function snxDebounce(fn, delay) {
  var timer;
  return function() {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}

/**
 * Format a duration value for display.
 * @param {number} minutes
 * @returns {string} e.g. "1h 15m" or "45 min"
 */
function snxFormatDuration(minutes) {
  if (minutes >= 60) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  }
  return minutes + ' min';
}
