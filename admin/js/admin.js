/* ═══════════════════════════════════════════════════════
   NEXORA ADMIN — Dashboard Logic
   SPA with hash routing, content CRUD, toast system
═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  let content = {};
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ─── API Layer ──────────────────────────────────────
  async function api(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok && !data.error) data.error = 'Request failed';
    return data;
  }

  // ─── Init ───────────────────────────────────────────
  async function init() {
    // Auth check
    const auth = await api('GET', '/api/auth/check');
    if (!auth.authenticated) {
      window.location.href = '/admin/login.html';
      return;
    }

    // Load content
    try {
      content = await api('GET', '/api/content');
    } catch (e) {
      toast('Failed to load content', 'error');
      return;
    }

    // Sidebar nav
    $$('.sidebar-nav .nav-item').forEach(a => {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        const view = this.getAttribute('data-view');
        if (view) navigate(view);
      });
    });

    // Logout
    $('#logout-btn').addEventListener('click', async () => {
      await api('POST', '/api/auth/logout');
      window.location.href = '/admin/login.html';
    });

    // Event delegation for quick cards and nav links in main content
    $('#main-content').addEventListener('click', function (e) {
      const card = e.target.closest('[data-view]');
      if (card && card.closest('.main-content, #main-content')) {
        e.preventDefault();
        navigate(card.getAttribute('data-view'));
      }
    });

    // Mobile sidebar toggle
    const toggle = $('#sidebar-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        $('#sidebar').classList.toggle('open');
      });
    }

    // Hash routing
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
  }

  // ─── Router ─────────────────────────────────────────
  function navigate(view) {
    location.hash = view;
  }

  function handleRoute() {
    const hash = location.hash.slice(1) || 'overview';
    render(hash);
    // Update active nav
    $$('.sidebar-nav .nav-item').forEach(a => {
      a.classList.toggle('active', a.getAttribute('data-view') === hash);
    });
    // Close mobile sidebar
    const sidebar = $('#sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }

  function render(view) {
    const main = $('#main-content');
    const viewFn = views[view];
    if (viewFn) {
      main.innerHTML = viewFn();
    } else {
      main.innerHTML = views.overview();
    }
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  // ─── Helpers ────────────────────────────────────────
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? (el.value || '') : '';
  }

  function field(label, id, value, type) {
    type = type || 'text';
    if (type === 'textarea') {
      return '<div class="field-group">' +
        '<label class="field-label" for="' + id + '">' + label + '</label>' +
        '<textarea class="field-input field-textarea" id="' + id + '" rows="3">' + esc(value) + '</textarea>' +
        '</div>';
    }
    return '<div class="field-group">' +
      '<label class="field-label" for="' + id + '">' + label + '</label>' +
      '<input type="' + type + '" class="field-input" id="' + id + '" value="' + esc(value) + '">' +
      '</div>';
  }

  function fieldRow() {
    var args = Array.prototype.slice.call(arguments);
    return '<div class="field-row">' + args.join('') + '</div>';
  }

  function sectionCard(title, bodyHTML) {
    return '<div class="section-card">' +
      '<div class="section-card-header"><h3>' + title + '</h3></div>' +
      '<div class="section-card-body">' + bodyHTML + '</div>' +
      '</div>';
  }

  // ─── Views ──────────────────────────────────────────
  var views = {};

  // ---- Overview ----
  views.overview = function () {
    var lastMod = content._lastModified
      ? new Date(content._lastModified).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : 'Never';

    var postCount = (content.blog && content.blog.posts) ? content.blog.posts.length : 0;
    var projectCount = (content.rnd && content.rnd.projects) ? content.rnd.projects.length : 0;
    var clientCount = (content.home && content.home.portfolio && content.home.portfolio.clients)
      ? content.home.portfolio.clients.length : 0;

    return '<div class="page-header"><h1>Dashboard</h1>' +
      '<p class="page-desc">Manage your Nexora website content</p></div>' +

      '<div class="stats-grid">' +
      '<div class="stat-card"><span class="stat-value">9</span><span class="stat-label">Total Pages</span></div>' +
      '<div class="stat-card"><span class="stat-value">5</span><span class="stat-label">Suite Divisions</span></div>' +
      '<div class="stat-card"><span class="stat-value">' + clientCount + '</span><span class="stat-label">Portfolio Clients</span></div>' +
      '<div class="stat-card"><span class="stat-value">' + projectCount + '</span><span class="stat-label">R&D Projects</span></div>' +
      '</div>' +

      '<p class="quick-section-title">Quick Edit</p>' +
      '<div class="quick-grid">' +
      quickCard('home', '🏠', 'Home Page', 'Hero, Suite, Portfolio, CTA') +
      quickCard('projex', '🎓', 'Projex', 'Academic division content') +
      quickCard('nexora', '🌐', 'Nexora Digital', 'Web engineering division') +
      quickCard('aetherai', '🤖', 'AetherAI', 'AI systems division') +
      quickCard('blog', '📝', 'Blog / Journal', postCount + ' posts') +
      quickCard('rnd', '🔬', 'R&D Projects', projectCount + ' projects') +
      quickCard('settings', '⚙️', 'Settings', 'Footer, Social, Meta') +
      '</div>' +

      '<div class="stat-card" style="margin-top:8px">' +
      '<span class="stat-label">Last Modified</span>' +
      '<span class="stat-value text-sm">' + lastMod + '</span>' +
      '</div>';
  };

  function quickCard(view, icon, title, desc) {
    return '<div class="quick-card" data-view="' + view + '">' +
      '<span class="quick-icon">' + icon + '</span>' +
      '<span class="quick-title">' + title + '</span>' +
      '<span class="quick-desc">' + esc(desc) + '</span>' +
      '</div>';
  }

  // ---- Home Page ----
  views.home = function () {
    var d = content.home || {};
    var hero = d.hero || {};
    var suite = d.suite || {};
    var about = d.about || {};
    var innovation = d.innovation || {};
    var portfolio = d.portfolio || {};
    var cta = d.cta || {};

    var html = '<div class="page-header"><h1>Home Page</h1>' +
      '<button class="save-btn primary" onclick="window.__save(\'home\')">Save &amp; Publish</button>' +
      '<p class="page-desc">Edit the main landing page content</p></div>';

    // Hero
    html += sectionCard('Hero Section',
      field('Label', 'hero-label', hero.label) +
      fieldRow(
        field('Headline Line 1', 'hero-h1', hero.headline1),
        field('Headline Line 2', 'hero-h2', hero.headline2)
      ) +
      field('Subtitle', 'hero-sub', hero.subtitle, 'textarea') +
      '<p class="field-hint">Supports HTML: use &lt;br&gt; for line breaks</p>'
    );

    // Suite
    var cardsHtml = '';
    var cards = suite.cards || [];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      cardsHtml += '<div class="editor-card">' +
        '<div class="editor-card-header">' +
        '<span class="editor-card-num">' + esc(c.num) + '</span>' +
        '<strong>' + esc(c.name) + '</strong></div>' +
        fieldRow(
          field('Name', 'card-' + i + '-name', c.name),
          field('Tagline', 'card-' + i + '-tag', c.tagline)
        ) +
        field('Description', 'card-' + i + '-desc', c.description, 'textarea') +
        '</div>';
    }
    html += sectionCard('Suite Divisions',
      field('Section Title', 'suite-title', suite.sectionTitle) +
      field('Section Subtitle', 'suite-sub', suite.sectionSubtitle, 'textarea') +
      '<div class="card-list">' + cardsHtml + '</div>'
    );

    // About
    html += sectionCard('About Section',
      field('Section Title', 'about-title', about.sectionTitle, 'textarea') +
      '<p class="field-hint">Supports HTML for line breaks</p>' +
      field('Section Subtitle', 'about-sub', about.sectionSubtitle, 'textarea')
    );

    // Innovation
    html += sectionCard('Innovation Section',
      field('Section Title', 'innov-title', innovation.sectionTitle) +
      field('Section Subtitle', 'innov-sub', innovation.sectionSubtitle, 'textarea')
    );

    // Portfolio
    var clientsHtml = '';
    var clients = portfolio.clients || [];
    for (var j = 0; j < clients.length; j++) {
      var cl = clients[j];
      clientsHtml += '<div class="editor-card" id="port-client-' + j + '">' +
        '<div class="editor-card-header">' +
        '<span class="editor-card-badge">' + esc(cl.category) + '</span>' +
        '<strong>' + esc(cl.name) + '</strong>' +
        '<button class="editor-card-remove" onclick="window.__removeClient(' + j + ')">Remove</button>' +
        '</div>' +
        fieldRow(
          field('Category', 'client-' + j + '-cat', cl.category),
          field('Name', 'client-' + j + '-name', cl.name)
        ) +
        field('Description', 'client-' + j + '-desc', cl.description, 'textarea') +
        field('Tags (comma-separated)', 'client-' + j + '-tags', (cl.tags || []).join(', ')) +
        '</div>';
    }
    html += sectionCard('Portfolio / Client Stories',
      field('Section Title', 'port-title', portfolio.sectionTitle) +
      field('Section Subtitle', 'port-sub', portfolio.sectionSubtitle, 'textarea') +
      '<div class="card-list" id="port-clients-list">' + clientsHtml + '</div>' +
      '<button class="add-btn" onclick="window.__addClient()">+ Add New Client</button>'
    );

    // CTA
    html += sectionCard('CTA Section',
      field('Label', 'cta-label', cta.label) +
      field('Headline', 'cta-headline', cta.headline, 'textarea') +
      '<p class="field-hint">Supports HTML: &lt;br&gt; for breaks, &lt;em&gt; for emphasis</p>' +
      field('Body Text', 'cta-body', cta.body, 'textarea')
    );

    return html;
  };

  // ---- Suite Page View Factory ----
  function suiteView(key, displayName) {
    return function () {
      var d = content[key] || {};
      var services = d.services || [];

      var html = '<div class="page-header"><h1>' + esc(displayName) + '</h1>' +
        '<button class="save-btn primary" onclick="window.__save(\'' + key + '\')">Save &amp; Publish</button>' +
        '<p class="page-desc">Edit ' + esc(displayName) + ' division page</p></div>';

      // Hero
      html += sectionCard('Hero Section',
        field('Label', key + '-label', d.heroLabel) +
        field('Title', key + '-title', d.heroTitle) +
        field('Tagline', key + '-tagline', d.heroTagline) +
        field('Description', key + '-desc', d.heroDesc, 'textarea')
      );

      // Services
      if (services.length > 0) {
        var svcHtml = '';
        for (var i = 0; i < services.length; i++) {
          var s = services[i];
          svcHtml += '<div class="editor-card">' +
            '<div class="editor-card-header">' +
            '<span class="editor-card-num">' + esc(s.icon) + '</span>' +
            '<strong>' + esc(s.name) + '</strong></div>' +
            fieldRow(
              field('Icon (emoji)', key + '-svc-' + i + '-icon', s.icon),
              field('Service Name', key + '-svc-' + i + '-name', s.name)
            ) +
            field('Description', key + '-svc-' + i + '-desc', s.description, 'textarea') +
            '</div>';
        }
        html += sectionCard('Services',
          '<div class="card-list">' + svcHtml + '</div>'
        );
      }

      // CTA
      html += sectionCard('CTA Section',
        field('Headline', key + '-cta-headline', d.ctaHeadline, 'textarea') +
        '<p class="field-hint">Supports HTML: &lt;br&gt; for breaks, &lt;em&gt; for emphasis</p>' +
        field('Description', key + '-cta-desc', d.ctaDesc, 'textarea')
      );

      return html;
    };
  }

  views.projex = suiteView('projex', 'Projex');
  views.techvyuha = suiteView('projex', 'Projex');
  views.nexora = suiteView('nexora', 'Nexora Digital');
  views.aetherai = suiteView('aetherai', 'AetherAI');

  // ---- Blog ----
  views.blog = function () {
    var d = content.blog || {};
    var posts = d.posts || [];

    var html = '<div class="page-header"><h1>Blog / Journal</h1>' +
      '<button class="save-btn primary" onclick="window.__save(\'blog\')">Save &amp; Publish</button>' +
      '<p class="page-desc">Manage journal posts</p></div>';

    html += sectionCard('Page Header',
      field('Title', 'blog-title', d.title) +
      field('Subtitle', 'blog-subtitle', d.subtitle, 'textarea')
    );

    var postsHtml = '';
    for (var i = 0; i < posts.length; i++) {
      var p = posts[i];
      postsHtml += '<div class="editor-card" id="blog-post-' + i + '">' +
        '<div class="editor-card-header">' +
        '<span class="editor-card-badge">' + esc(p.category) + '</span>' +
        '<strong>' + esc(p.title) + '</strong>' +
        '<button class="editor-card-remove" onclick="window.__removePost(' + i + ')">Remove</button>' +
        '</div>' +
        field('Title', 'post-' + i + '-title', p.title) +
        fieldRow(
          field('Category', 'post-' + i + '-cat', p.category),
          field('Date', 'post-' + i + '-date', p.date)
        ) +
        fieldRow(
          field('Read Time', 'post-' + i + '-time', p.readTime),
          field('Featured', 'post-' + i + '-featured', p.featured ? 'true' : 'false')
        ) +
        field('Excerpt', 'post-' + i + '-excerpt', p.excerpt, 'textarea') +
        '</div>';
    }

    html += sectionCard('Posts (' + posts.length + ')',
      '<div class="card-list" id="blog-posts-list">' + postsHtml + '</div>' +
      '<button class="add-btn" onclick="window.__addPost()">+ Add New Post</button>'
    );

    return html;
  };

  // ---- R&D ----
  views.rnd = function () {
    var d = content.rnd || {};
    var projects = d.projects || [];

    var html = '<div class="page-header"><h1>R&amp;D Projects</h1>' +
      '<button class="save-btn primary" onclick="window.__save(\'rnd\')">Save &amp; Publish</button>' +
      '<p class="page-desc">Manage research &amp; development projects</p></div>';

    html += sectionCard('Page Header',
      field('Title', 'rnd-title', d.title) +
      field('Subtitle', 'rnd-subtitle', d.subtitle, 'textarea')
    );

    var projHtml = '';
    for (var i = 0; i < projects.length; i++) {
      var pr = projects[i];
      var statusClass = pr.status === 'completed' ? 'status-completed' :
        pr.status === 'active' ? 'status-active' : 'status-planning';
      projHtml += '<div class="editor-card" id="rnd-proj-' + i + '">' +
        '<div class="editor-card-header">' +
        '<span class="status-badge ' + statusClass + '">' + esc(pr.status) + '</span>' +
        '<strong>' + esc(pr.title) + '</strong>' +
        '<button class="editor-card-remove" onclick="window.__removeProject(' + i + ')">Remove</button>' +
        '</div>' +
        field('Title', 'proj-' + i + '-title', pr.title) +
        fieldRow(
          field('Status (completed/active/planning)', 'proj-' + i + '-status', pr.status),
          field('Date Label', 'proj-' + i + '-date', pr.date)
        ) +
        field('Description', 'proj-' + i + '-desc', pr.description, 'textarea') +
        field('Tags (comma-separated)', 'proj-' + i + '-tags', (pr.tags || []).join(', ')) +
        field('Progress (0-100)', 'proj-' + i + '-progress', pr.progress, 'number') +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + (pr.progress || 0) + '%"></div></div>' +
        '</div>';
    }

    html += sectionCard('Projects (' + projects.length + ')',
      '<div class="card-list" id="rnd-projects-list">' + projHtml + '</div>' +
      '<button class="add-btn" onclick="window.__addProject()">+ Add New Project</button>'
    );

    return html;
  };

  // ---- Settings ----
  views.settings = function () {
    var s = content.settings || {};
    var footer = s.footer || {};
    var social = s.social || {};
    var meta = s.meta || {};

    var html = '<div class="page-header"><h1>Settings</h1>' +
      '<button class="save-btn primary" onclick="window.__save(\'settings\')">Save &amp; Publish</button>' +
      '<p class="page-desc">Global website settings — applied across all pages</p></div>';

    html += sectionCard('Footer Content',
      field('Footer Description', 'footer-desc', footer.description, 'textarea') +
      field('Contact Email', 'footer-email', footer.email, 'email')
    );

    html += sectionCard('Social Links',
      field('LinkedIn URL', 'social-linkedin', social.linkedin) +
      field('X (Twitter) URL', 'social-twitter', social.twitter) +
      field('Instagram URL', 'social-instagram', social.instagram) +
      field('Reddit URL', 'social-reddit', social.reddit)
    );

    html += sectionCard('SEO / Meta Tags',
      field('Site Title', 'meta-title', meta.siteTitle) +
      field('Site Description', 'meta-desc', meta.siteDescription, 'textarea') +
      field('OG Image URL', 'meta-og', meta.ogImage) +
      '<p class="field-hint">Meta updates apply to the home page. Footer &amp; social updates apply to all 9 pages.</p>'
    );

    html += '<div class="section-divider"></div>';

    html += sectionCard('Change Password',
      field('Current Password', 'pw-current', '', 'password') +
      field('New Password', 'pw-new', '', 'password') +
      '<p class="field-hint">Minimum 6 characters</p>' +
      '<div class="btn-row"><button class="save-btn outline" onclick="window.__changePw()">Update Password</button></div>'
    );

    return html;
  };

  // ─── Save Handlers ─────────────────────────────────
  window.__save = async function (section) {
    var data;
    var btn = document.querySelector('.save-btn.primary');

    switch (section) {
      case 'home':
        var homeCards = (content.home && content.home.suite && content.home.suite.cards) || [];
        var homeClients = (content.home && content.home.portfolio && content.home.portfolio.clients) || [];
        data = {
          hero: {
            label: val('hero-label'),
            headline1: val('hero-h1'),
            headline2: val('hero-h2'),
            subtitle: val('hero-sub')
          },
          suite: {
            sectionTitle: val('suite-title'),
            sectionSubtitle: val('suite-sub'),
            cards: homeCards.map(function (card, i) {
              return Object.assign({}, card, {
                name: val('card-' + i + '-name'),
                tagline: val('card-' + i + '-tag'),
                description: val('card-' + i + '-desc')
              });
            })
          },
          about: {
            sectionTitle: val('about-title'),
            sectionSubtitle: val('about-sub')
          },
          innovation: {
            sectionTitle: val('innov-title'),
            sectionSubtitle: val('innov-sub'),
            solutions: (content.home && content.home.innovation) ? content.home.innovation.solutions : []
          },
          portfolio: {
            sectionTitle: val('port-title'),
            sectionSubtitle: val('port-sub'),
            clients: homeClients.map(function (client, j) {
              var tagsStr = val('client-' + j + '-tags');
              return Object.assign({}, client, {
                category: val('client-' + j + '-cat'),
                name: val('client-' + j + '-name'),
                description: val('client-' + j + '-desc'),
                tags: tagsStr ? tagsStr.split(',').map(function(t){ return t.trim(); }).filter(Boolean) : (client.tags || [])
              });
            })
          },
          cta: {
            label: val('cta-label'),
            headline: val('cta-headline'),
            body: val('cta-body')
          }
        };
        break;

      case 'blog':
        var blogPosts = (content.blog && content.blog.posts) || [];
        data = {
          title: val('blog-title'),
          subtitle: val('blog-subtitle'),
          posts: blogPosts.map(function (post, i) {
            return {
              id: post.id || (i + 1),
              title: val('post-' + i + '-title') || post.title,
              category: val('post-' + i + '-cat') || post.category,
              date: val('post-' + i + '-date') || post.date,
              readTime: val('post-' + i + '-time') || post.readTime,
              excerpt: val('post-' + i + '-excerpt') || post.excerpt,
              featured: val('post-' + i + '-featured') === 'true'
            };
          })
        };
        break;

      case 'rnd':
        var rndProjects = (content.rnd && content.rnd.projects) || [];
        data = {
          title: val('rnd-title'),
          subtitle: val('rnd-subtitle'),
          projects: rndProjects.map(function (proj, i) {
            var tagsStr = val('proj-' + i + '-tags');
            return {
              id: proj.id || (i + 1),
              title: val('proj-' + i + '-title') || proj.title,
              status: val('proj-' + i + '-status') || proj.status,
              date: val('proj-' + i + '-date') || proj.date,
              description: val('proj-' + i + '-desc') || proj.description,
              tags: tagsStr ? tagsStr.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : (proj.tags || []),
              progress: parseInt(val('proj-' + i + '-progress')) || 0
            };
          })
        };
        break;

      case 'settings':
        data = {
          footer: {
            description: val('footer-desc'),
            email: val('footer-email')
          },
          social: {
            linkedin: val('social-linkedin'),
            twitter: val('social-twitter'),
            instagram: val('social-instagram'),
            reddit: val('social-reddit')
          },
          meta: {
            siteTitle: val('meta-title'),
            siteDescription: val('meta-desc'),
            ogImage: val('meta-og')
          }
        };
        break;

      default:
        // Suite pages
        var sd = content[section] || {};
        var svcs = sd.services || [];
        data = {
          heroTitle: val(section + '-title'),
          heroLabel: val(section + '-label'),
          heroTagline: val(section + '-tagline'),
          heroDesc: val(section + '-desc'),
          services: svcs.map(function (s, i) {
            return {
              icon: val(section + '-svc-' + i + '-icon') || s.icon,
              name: val(section + '-svc-' + i + '-name') || s.name,
              description: val(section + '-svc-' + i + '-desc') || s.description
            };
          }),
          ctaHeadline: val(section + '-cta-headline'),
          ctaDesc: val(section + '-cta-desc')
        };
    }

    if (!data) return;

    // UI feedback
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
    }

    try {
      var result = await api('PUT', '/api/content/' + section, data);
      if (result.success) {
        content[section] = data;
        if (result.timestamp) content._lastModified = result.timestamp;
        toast('Content saved & published!', 'success');
      } else {
        toast(result.error || 'Failed to save', 'error');
      }
    } catch (e) {
      toast('Network error — please try again', 'error');
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save & Publish';
    }
  };

  // ─── Blog CRUD ──────────────────────────────────────
  window.__addPost = function () {
    if (!content.blog) content.blog = { posts: [] };
    if (!content.blog.posts) content.blog.posts = [];
    var nextId = content.blog.posts.length > 0
      ? Math.max.apply(null, content.blog.posts.map(function (p) { return p.id || 0; })) + 1
      : 1;
    content.blog.posts.push({
      id: nextId,
      title: 'New Post',
      category: 'general',
      date: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase(),
      readTime: '5 min read',
      excerpt: '',
      featured: false
    });
    render('blog');
    toast('Post added — fill in the details and save', 'success');
  };

  window.__removePost = function (index) {
    if (!content.blog || !content.blog.posts) return;
    if (!confirm('Remove this post?')) return;
    content.blog.posts.splice(index, 1);
    render('blog');
    toast('Post removed — click Save to apply', 'success');
  };

  // ─── Portfolio Client CRUD ────────────────────────────
  window.__addClient = function () {
    if (!content.home) content.home = {};
    if (!content.home.portfolio) content.home.portfolio = { clients: [] };
    if (!content.home.portfolio.clients) content.home.portfolio.clients = [];
    content.home.portfolio.clients.push({
      category: 'Category',
      name: 'Client Name',
      description: '',
      tags: []
    });
    render('home');
    // Scroll to new card
    var list = document.getElementById('port-clients-list');
    if (list) list.lastElementChild && list.lastElementChild.scrollIntoView({ behavior: 'smooth' });
    toast('Client added — fill in the details and save', 'success');
  };

  window.__removeClient = function (index) {
    if (!content.home || !content.home.portfolio || !content.home.portfolio.clients) return;
    if (!confirm('Remove this client story?')) return;
    content.home.portfolio.clients.splice(index, 1);
    render('home');
    toast('Client removed — click Save & Publish to apply', 'success');
  };

  // ─── R&D CRUD ───────────────────────────────────────
  window.__addProject = function () {
    if (!content.rnd) content.rnd = { projects: [] };
    if (!content.rnd.projects) content.rnd.projects = [];
    var nextId = content.rnd.projects.length > 0
      ? Math.max.apply(null, content.rnd.projects.map(function (p) { return p.id || 0; })) + 1
      : 1;
    content.rnd.projects.push({
      id: nextId,
      title: 'New Project',
      status: 'planning',
      date: 'Starting Q' + (Math.ceil((new Date().getMonth() + 1) / 3)) + ' ' + new Date().getFullYear(),
      description: '',
      tags: [],
      progress: 0
    });
    render('rnd');
    toast('Project added — fill in the details and save', 'success');
  };

  window.__removeProject = function (index) {
    if (!content.rnd || !content.rnd.projects) return;
    if (!confirm('Remove this project?')) return;
    content.rnd.projects.splice(index, 1);
    render('rnd');
    toast('Project removed — click Save to apply', 'success');
  };

  // ─── Change Password ───────────────────────────────
  window.__changePw = async function () {
    var current = val('pw-current');
    var newPw = val('pw-new');

    if (!current || !newPw) {
      toast('Please fill in both password fields', 'error');
      return;
    }
    if (newPw.length < 6) {
      toast('Password must be at least 6 characters', 'error');
      return;
    }

    try {
      var result = await api('PUT', '/api/auth/password', {
        currentPassword: current,
        newPassword: newPw
      });
      if (result.success) {
        toast('Password updated!', 'success');
        document.getElementById('pw-current').value = '';
        document.getElementById('pw-new').value = '';
      } else {
        toast(result.error || 'Failed to update', 'error');
      }
    } catch (e) {
      toast('Network error', 'error');
    }
  };

  // ─── Toast ──────────────────────────────────────────
  function toast(msg, type) {
    type = type || 'success';
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast toast-' + type + ' toast-visible';
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.classList.remove('toast-visible');
    }, 3500);
  }

  // ─── Go ─────────────────────────────────────────────
  init();

})();
