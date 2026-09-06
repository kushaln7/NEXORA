/* ═══════════════════════════════════════════════════════
   NEXORA — Client-Side Content Hydration
   Fetches live content from DB and updates the page DOM.
   Runs deferred — never blocks render.
═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Tiny DOM helpers ─────────────────────────────── */
  function qs(sel, ctx)    { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx)   { return (ctx || document).querySelectorAll(sel); }
  function setText(sel, v, ctx) {
    var el = qs(sel, ctx);
    if (el && v !== undefined && v !== null && v !== '') el.textContent = v;
  }
  function setHTML(sel, v, ctx) {
    var el = qs(sel, ctx);
    if (el && v !== undefined && v !== null && v !== '') el.innerHTML = v;
  }
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Detect current page ──────────────────────────── */
  var path = location.pathname.replace(/\/$/, '').split('/').pop() || 'index.html';
  var PAGE = path === '' || path === 'index.html' ? 'home'
           : path === 'blog.html'           ? 'blog'
           : path === 'rnd.html'            ? 'rnd'
           : path === 'projex.html'         ? 'projex'
           : path === 'techvyuha.html'      ? 'projex'
           : path === 'nexora-digital.html' ? 'nexora'
           : path === 'aetherai.html'       ? 'aetherai'
           : path === 'automatax.html'      ? 'automatax'
           : path === 'veltrix.html'        ? 'veltrix'
           : null;

  if (!PAGE) return; // 404, admin, etc — skip

  /* ── Fetch content from DB ────────────────────────── */
  fetch('/api/content-public', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (content) {
      applySettings(content.settings);
      if (PAGE === 'home')       applyHome(content.home, content.rnd);
      if (PAGE === 'blog')       applyBlog(content.blog);
      if (PAGE === 'rnd')        applyRnd(content.rnd);
      if (['projex','techvyuha','nexora','aetherai','automatax','veltrix'].indexOf(PAGE) !== -1) {
        applySuite(content[PAGE]);
      }
    })
    .catch(function (err) {
      console.warn('[Nexora hydrate] Failed to load content from API. Static HTML preserved.', err);
    });

  /* ── Settings (footer + social) — all pages ─────── */
  function applySettings(s) {
    if (!s) return;
    var f = s.footer || {};
    if (f.description) setText('.footer-desc', f.description);
    if (f.email) {
      qsa('a[href^="mailto:"]').forEach(function (a) {
        a.href = 'mailto:' + f.email;
        a.textContent = f.email;
      });
    }
    var social = s.social || {};
    var socialMap = { linkedin: 'LinkedIn', twitter: 'X (Twitter)', instagram: 'Instagram', reddit: 'Reddit' };
    Object.keys(socialMap).forEach(function (key) {
      if (social[key]) {
        var el = qs('a[aria-label="' + socialMap[key] + '"]');
        if (el) el.href = social[key];
      }
    });
  }

  /* ── Home page ───────────────────────────────────── */
  function applyHome(d, rndData) {
    if (!d) return;

    // Hero
    var h = d.hero || {};
    setText('.hero-label', h.label);
    setText('#hl1', h.headline1);
    setText('#hl2', h.headline2);
    setHTML('#hero-sub', h.subtitle);

    // Suite
    var suite = d.suite || {};
    setText('#suite .section-title-center', suite.sectionTitle);
    setHTML('#suite .section-subtitle-center', suite.sectionSubtitle);
    if (suite.cards) {
      qsa('.suite-card').forEach(function (card, i) {
        var c = suite.cards[i];
        if (!c) return;
        if (c.name === 'TechVyuha' || i === 0) c.name = 'Projex';
        if (c.name === 'Projex' || i === 0) c.link = 'https://projex.nexora.nexora.in';
        if (c.name === 'AutomataX' || c.name === 'Veltrix' || i === 3) c.name = 'Nexora Labs';

        if (c.name) setText('.suite-card-name', c.name, card);
        if (c.tagline) setText('.suite-card-tagline', c.tagline, card);
        if (c.description !== undefined && c.description !== '') setText('.suite-card-desc', c.description, card);
        if (c.link) card.href = c.link;
      });
    }

    // About
    var about = d.about || {};
    setHTML('#research .section-title-center', about.sectionTitle);
    setText('#research .section-subtitle-center', about.sectionSubtitle);

    // Innovation
    var innov = d.innovation || {};
    setText('#architecture .section-title-center', innov.sectionTitle);
    setText('#architecture .section-subtitle-center', innov.sectionSubtitle);

    // R&D Solutions — dynamically render completed projects on homepage
    var rndProjects = (rndData && rndData.projects) ? rndData.projects : [];
    var completedProjects = rndProjects.filter(function (p) { return p.status === 'completed'; });
    var activeProjects = rndProjects.filter(function (p) { return p.status === 'active'; });
    var allShowable = completedProjects.concat(activeProjects);
    var solutionsGrid = qs('.solutions-grid');
    if (solutionsGrid) {
      if (allShowable.length > 0) {
        var icons = ['🌿', '🔬', '🤖', '⚡', '🔧', '📊', '🛡️', '🎯'];
        var gridHTML = allShowable.map(function (p, i) {
          var tagsHTML = (p.tags || []).map(function (t) {
            return '<span class="solution-tag mono">' + esc(t) + '</span>';
          }).join('');
          return '<div class="solution-card reveal-up">'
            + '<div class="solution-icon-wrap"><span class="solution-icon">' + (icons[i % icons.length]) + '</span></div>'
            + '<h4 class="solution-name">' + esc(p.title) + '</h4>'
            + '<p class="solution-desc">' + esc(p.description) + '</p>'
            + '<div class="solution-tags">' + tagsHTML + '</div>'
            + '<a href="rnd.html" class="solution-link mono">View Case Study →</a>'
            + '</div>';
        }).join('');
        solutionsGrid.innerHTML = gridHTML;
        // Update subsection title based on content
        var subsectionTitle = qs('#architecture .subsection-title');
        if (subsectionTitle) subsectionTitle.textContent = 'Developed Solutions';
      } else {
        solutionsGrid.innerHTML = '<p style="opacity:0.5;text-align:center;width:100%">No projects yet.</p>';
      }
    }

    // Portfolio — full regeneration so add/delete work
    var port = d.portfolio || {};
    setText('#evidence .section-title-center', port.sectionTitle);
    setText('#evidence .section-subtitle-center', port.sectionSubtitle);
    var portfolioSection = document.getElementById('evidence');
    if (port.clients && port.clients.length > 0) {
      var thumbCls = ['portfolio-thumb','portfolio-thumb-alt','portfolio-thumb-dark','portfolio-thumb-accent'];
      var gridHTML = port.clients.map(function (c, i) {
        var tagsHTML = (c.tags || []).map(function (t) {
          return '<span class="portfolio-tag mono">' + esc(t) + '</span>';
        }).join('');
        return '<div class="portfolio-card reveal-up">'
          + '<div class="' + thumbCls[i % thumbCls.length] + '">'
          + '<span class="portfolio-cat mono">' + esc(c.category) + '</span></div>'
          + '<div class="portfolio-body">'
          + '<div class="portfolio-client"><span class="portfolio-dot">◆</span>'
          + '<h4>' + esc(c.name) + '</h4></div>'
          + '<p>' + esc(c.description) + '</p>'
          + '<div class="portfolio-tags">' + tagsHTML + '</div>'
          + '</div></div>';
      }).join('');
      // If mobile carousel was already set up, update it too
      var carouselTrack = portfolioSection ? portfolioSection.querySelector('.portfolio-carousel-track') : null;
      var carouselOuter = portfolioSection ? portfolioSection.querySelector('.portfolio-carousel-outer') : null;
      var carouselDots  = portfolioSection ? portfolioSection.querySelector('.portfolio-carousel-dots') : null;
      if (carouselTrack) {
        // Remove old carousel, let grid show on all viewports
        if (carouselOuter) carouselOuter.remove();
        if (carouselDots) carouselDots.remove();
        var grid = qs('.portfolio-grid', portfolioSection);
        if (grid) grid.style.display = '';
      }
      setHTML('.portfolio-grid', gridHTML);
      if (portfolioSection) portfolioSection.style.display = '';
      // Re-observe new reveal-up elements so they animate in
      if (window.__observeReveal) {
        (portfolioSection || document).querySelectorAll('.reveal-up').forEach(function (el) {
          if (!el.classList.contains('visible')) window.__observeReveal(el);
        });
      }
    } else {
      // No clients — hide the entire section + carousel remnants so there's no gap
      if (portfolioSection) {
        portfolioSection.style.display = 'none';
        var co = portfolioSection.querySelector('.portfolio-carousel-outer');
        var cd = portfolioSection.querySelector('.portfolio-carousel-dots');
        if (co) co.remove();
        if (cd) cd.remove();
      }
    }

    // CTA
    var cta = d.cta || {};
    setText('.cta-label', cta.label);
    setHTML('.cta-headline', cta.headline);
    setText('.cta-body', cta.body);
  }

  /* ── Blog page ───────────────────────────────────── */
  function applyBlog(d) {
    if (!d) return;
    setHTML('.journal-title', esc(d.title));
    setText('.journal-desc', d.subtitle);

    var posts = d.posts || [];

    // When DB has 0 posts, clear the hardcoded HTML
    if (!posts.length) {
      var fs = qs('.journal-featured');
      if (fs) fs.innerHTML = '<div class="journal-inner"><p style="opacity:0.5;text-align:center;padding:3rem 0">No posts yet. Add posts from the admin dashboard.</p></div>';
      var ls = qs('.journal-list-section');
      if (ls) ls.innerHTML = '';
      // Update entry count
      var countEl = qs('.jh-count');
      if (countEl) countEl.textContent = '0 entries';
      return;
    }

    // Update entry count
    var countEl = qs('.jh-count');
    if (countEl) countEl.textContent = posts.length + ' entries';

    var featured = null, list = [];
    posts.forEach(function (p) {
      if (p.featured && !featured) featured = p; else list.push(p);
    });
    if (!featured) { featured = posts[0]; list = posts.slice(1); }

    // Featured
    var fs = qs('.journal-featured');
    if (fs) {
      fs.innerHTML = '<div class="journal-inner"><div class="entry-featured" data-category="' + esc(featured.category) + '">'
        + '<div class="ef-meta">'
        + '<span class="mono ef-tag">' + esc((featured.category || '').toUpperCase()) + '</span>'
        + '<span class="mono ef-date">' + esc(featured.date) + '</span>'
        + '<span class="mono ef-read">' + esc(featured.readTime) + '</span></div>'
        + '<h2 class="ef-title"><a href="#">' + esc(featured.title) + '</a></h2>'
        + '<p class="ef-body">' + esc(featured.excerpt) + '</p>'
        + '<div class="ef-footer"><a href="#" class="ef-link mono">Read entry &rarr;</a></div>'
        + '</div></div>';
    }

    // List
    var ls = qs('.journal-list-section');
    if (ls) {
      var listHTML = '<div class="journal-inner">';
      list.forEach(function (p, idx) {
        var num = ('0' + (idx + 1)).slice(-2);
        if (idx > 0) listHTML += '<div class="je-divider"></div>';
        listHTML += '<article class="journal-entry" data-category="' + esc(p.category) + '">'
          + '<div class="je-index mono">' + num + '</div>'
          + '<div class="je-body"><div class="je-meta">'
          + '<span class="mono je-tag">' + esc((p.category || '').toUpperCase()) + '</span>'
          + '<span class="mono je-date">' + esc(p.date) + '</span></div>'
          + '<h3 class="je-title"><a href="#">' + esc(p.title) + '</a></h3>'
          + '<p class="je-excerpt">' + esc(p.excerpt) + '</p></div>'
          + '<div class="je-right"><span class="mono je-read">' + esc(p.readTime) + '</span>'
          + '<a href="#" class="je-cta mono">&rarr;</a></div></article>';
      });
      listHTML += '</div>';
      ls.innerHTML = listHTML;
    }
  }

  /* ── R&D page ────────────────────────────────────── */
  function applyRnd(d) {
    if (!d) return;
    setText('.rnd-hero-title', d.title);
    setText('.rnd-hero-sub', d.subtitle);

    var projects = d.projects || [];
    if (!projects.length) return;

    var groups = { completed: [], active: [], planning: [] };
    projects.forEach(function (p) { (groups[p.status] || groups.planning).push(p); });

    var statusMap = {
      completed: { cls: 'rnd-status-completed', label: 'Completed' },
      active:    { cls: 'rnd-status-active',    label: 'Active' },
      planning:  { cls: 'rnd-status-planning',  label: 'Planning' }
    };
    var groupTitles = { completed: 'Completed Solutions', active: 'Ongoing Research', planning: 'Upcoming Projects' };

    var html = '';
    ['completed','active','planning'].forEach(function (status) {
      var items = groups[status];
      if (!items.length) return;
      html += '<h2 class="rnd-section-title">' + groupTitles[status] + '</h2><div class="rnd-grid">';
      items.forEach(function (p) {
        var sm = statusMap[status];
        var tagsHTML = (p.tags || []).map(function (t) {
          return '<span class="rnd-tag mono">' + esc(t) + '</span>';
        }).join('');
        var progressHTML = status === 'active'
          ? '<div class="rnd-progress-bar"><div class="rnd-progress-track">'
            + '<div class="rnd-progress-fill" style="width:' + (p.progress || 0) + '%"></div>'
            + '</div><span class="mono rnd-progress-label">' + (p.progress || 0) + '% Complete</span></div>'
          : '';
        html += '<article class="rnd-card" data-status="' + status + '">'
          + '<div class="rnd-card-header">'
          + '<span class="rnd-status ' + sm.cls + ' mono">' + sm.label + '</span>'
          + '<span class="mono rnd-date">' + esc(p.date) + '</span></div>'
          + '<h3 class="rnd-card-title">' + esc(p.title) + '</h3>'
          + '<p class="rnd-card-desc">' + esc(p.description) + '</p>'
          + '<div class="rnd-card-tags">' + tagsHTML + '</div>'
          + progressHTML
          + '<div class="rnd-card-footer"><a href="#" class="rnd-card-link mono">Read Research Blog &rarr;</a></div>'
          + '</article>';
      });
      html += '</div>';
    });

    // Stats
    html += '<div class="rnd-stats">'
      + '<div class="rnd-stat"><span class="rnd-stat-num">' + groups.completed.length + '</span><span class="mono rnd-stat-label">Completed Solutions</span></div>'
      + '<div class="rnd-stat"><span class="rnd-stat-num">' + groups.active.length + '</span><span class="mono rnd-stat-label">Active Research</span></div>'
      + '<div class="rnd-stat"><span class="rnd-stat-num">' + groups.planning.length + '</span><span class="mono rnd-stat-label">Upcoming Projects</span></div>'
      + '<div class="rnd-stat"><span class="rnd-stat-num">' + projects.length + '</span><span class="mono rnd-stat-label">Total Initiatives</span></div>'
      + '</div>';

    // Inject keeping the filter tabs
    var inner = qs('.rnd-content-inner');
    if (inner) {
      var filters = qs('.rnd-filters', inner);
      var filtersHTML = filters ? filters.outerHTML : '';
      inner.innerHTML = filtersHTML + html;
      // Re-init filter click handlers if rnd.js hasn't grabbed them yet
      qsa('.rnd-filter', inner).forEach(function (btn) {
        btn.addEventListener('click', function () {
          qsa('.rnd-filter', inner).forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var filter = btn.getAttribute('data-filter');
          qsa('.rnd-card', inner).forEach(function (card) {
            card.style.display = (filter === 'all' || card.getAttribute('data-status') === filter) ? '' : 'none';
          });
        });
      });
    }
  }

  /* ── Suite pages ─────────────────────────────────── */
  function applySuite(d) {
    if (!d) return;
    setText('.division-hero-label', d.heroLabel);
    setText('.division-hero-tagline', d.heroTagline);
    setText('.division-hero-desc', d.heroDesc);
    if (d.heroTitle) {
      var nameEl = qs('.division-hero-name');
      if (nameEl) nameEl.innerHTML = esc(d.heroTitle) + '<span class="brand-dot">.</span>';
    }
    if (d.services) {
      qsa('.service-item').forEach(function (el, i) {
        var s = d.services[i];
        if (!s) return;
        setText('.service-icon-box', s.icon, el);
        setText('.service-name', s.name, el);
        setText('.service-desc', s.description, el);
      });
    }
    setHTML('.division-cta-headline', d.ctaHeadline);
    setText('.division-cta-desc', d.ctaDesc);
  }

})();
