/* ═══════════════════════════════════════════════════════
   NEXORA — Admin Dashboard Server
   Express + Session/Token Auth + Cheerio HTML Updates
   Compatible with Local Node.js & Vercel Serverless
═══════════════════════════════════════════════════════ */
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'nexora-secure-session-key-2026';

// ─── Safe Storage Helpers (Read-only filesystem resilient) ──
function safeReadJSON(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.warn(`[Storage] Read error for ${filePath}, using fallback:`, err.message);
  }
  return fallback;
}

function safeWriteJSON(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.warn(`[Storage] Notice: Cannot write to ${filePath} (${err.message}). In-memory data updated.`);
    return false;
  }
}

// In-memory data caches
let cachedAdmin = safeReadJSON(ADMIN_FILE, null);
if (!cachedAdmin) {
  const hash = bcrypt.hashSync('nexora2024', 10);
  cachedAdmin = { username: 'admin', passwordHash: hash };
  safeWriteJSON(ADMIN_FILE, cachedAdmin);
}

let cachedContent = safeReadJSON(CONTENT_FILE, null);
if (!cachedContent) {
  cachedContent = buildInitialContent();
  safeWriteJSON(CONTENT_FILE, cachedContent);
}

// ─── Token & Cookie Helpers ──────────────────────────
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers && req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts[0]?.trim();
    if (!name) return;
    list[name] = decodeURIComponent(parts.slice(1).join('=').trim());
  });
  return list;
}

function generateAuthToken(username) {
  const payload = Buffer.from(JSON.stringify({ username, exp: Date.now() + 4 * 3600 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (signature !== expectedSig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && Date.now() < data.exp) return data;
  } catch (_) {}
  return null;
}

function isAuthenticated(req) {
  if (req.session && req.session.authenticated) return true;
  const cookies = parseCookies(req);
  if (cookies.nexora_auth && verifyAuthToken(cookies.nexora_auth)) return true;
  const authHeader = req.headers && req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    if (verifyAuthToken(authHeader.slice(7))) return true;
  }
  return false;
}

// ─── Middleware ──────────────────────────────────────
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 4 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// Block sensitive files
app.use((req, res, next) => {
  const blocked = ['/server.js', '/package.json', '/package-lock.json'];
  if (blocked.includes(req.path) || req.path.startsWith('/data/') || req.path.startsWith('/node_modules/')) {
    return res.status(403).send('Forbidden');
  }
  next();
});

const requireAuth = (req, res, next) => {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

// ─── Auth Routes ────────────────────────────────────
app.post(['/api/auth/login', '/auth/login'], (req, res) => {
  try {
    const { username, password } = req.body || {};
    const admin = safeReadJSON(ADMIN_FILE, cachedAdmin);
    if (username === admin.username && bcrypt.compareSync(password || '', admin.passwordHash)) {
      if (req.session) req.session.authenticated = true;
      const token = generateAuthToken(username);
      res.cookie('nexora_auth', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 4 * 60 * 60 * 1000,
        path: '/'
      });
      return res.json({ success: true, token });
    }
    res.status(401).json({ error: 'Invalid credentials' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post(['/api/auth/logout', '/auth/logout'], (req, res) => {
  res.clearCookie('nexora_auth', { path: '/' });
  if (req.session) {
    req.session.destroy(() => res.json({ success: true }));
  } else {
    res.json({ success: true });
  }
});

app.get(['/api/auth/check', '/auth/check'], (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

app.put(['/api/auth/password', '/auth/password'], requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const admin = safeReadJSON(ADMIN_FILE, cachedAdmin);
    if (!bcrypt.compareSync(currentPassword || '', admin.passwordHash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    admin.passwordHash = bcrypt.hashSync(newPassword, 10);
    cachedAdmin = admin;
    safeWriteJSON(ADMIN_FILE, admin);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Content API ────────────────────────────────────
app.get(['/api/content', '/content'], requireAuth, (req, res) => {
  try {
    const content = safeReadJSON(CONTENT_FILE, cachedContent);
    res.json(content);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read content' });
  }
});

app.get(['/api/content-public', '/content-public'], (req, res) => {
  try {
    const content = safeReadJSON(CONTENT_FILE, cachedContent);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(content);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read content' });
  }
});

app.put(['/api/content/:section', '/content/:section'], requireAuth, (req, res) => {
  try {
    const section = req.params.section;
    const content = safeReadJSON(CONTENT_FILE, cachedContent);
    content[section] = req.body;
    content._lastModified = new Date().toISOString();
    cachedContent = content;
    safeWriteJSON(CONTENT_FILE, content);
    try {
      updateHTML(section, req.body, content);
    } catch (htmlErr) {
      console.warn('[HTML Engine] Could not update static files on disk:', htmlErr.message);
    }
    res.json({ success: true, timestamp: content._lastModified });
  } catch (e) {
    console.error('Save error:', e);
    res.status(500).json({ error: e.message || 'Failed to save' });
  }
});

// ─── Static Serving ─────────────────────────────────
app.use('/admin', express.static(path.join(ROOT, 'admin')));
app.use(express.static(ROOT, { extensions: ['html'] }));

// Fallback 404
app.use((req, res) => {
  const fourOhFour = path.join(ROOT, '404.html');
  if (fs.existsSync(fourOhFour)) return res.status(404).sendFile(fourOhFour);
  res.status(404).send('Not found');
});

// ─── HTML Update Engine ─────────────────────────────
function loadCheerio(filename) {
  const filepath = path.join(ROOT, filename);
  if (!fs.existsSync(filepath)) return null;
  const raw = fs.readFileSync(filepath, 'utf8');
  const $ = cheerio.load(raw, { decodeEntities: false });
  return { $, filepath };
}

function saveHTML(filepath, $) {
  fs.writeFileSync(filepath, $.html());
}

function updateHTML(section, data, full) {
  try {
    switch (section) {
      case 'home': updateHomeHTML(data); break;
      case 'settings': updateSettingsHTML(data); break;
      case 'techvyuha': updateSuitePageHTML('techvyuha.html', data); break;
      case 'nexora': updateSuitePageHTML('nexora-digital.html', data); break;
      case 'aetherai': updateSuitePageHTML('aetherai.html', data); break;
      case 'automatax': updateSuitePageHTML('automatax.html', data); break;
      case 'veltrix': updateSuitePageHTML('veltrix.html', data); break;
    }
  } catch (e) { console.error('HTML update error:', e.message); }
}

function updateHomeHTML(data) {
  const doc = loadCheerio('index.html');
  if (!doc) return;
  const { $, filepath } = doc;

  if (data.hero) {
    if (data.hero.label) $('.hero-label').text(data.hero.label);
    if (data.hero.headline1) $('#hl1').text(data.hero.headline1);
    if (data.hero.headline2) $('#hl2').text(data.hero.headline2);
    if (data.hero.subtitle) $('#hero-sub').html(data.hero.subtitle);
  }

  if (data.suite) {
    if (data.suite.sectionTitle) {
      $('#suite .section-title-center').first().text(data.suite.sectionTitle);
    }
    if (data.suite.sectionSubtitle) {
      $('#suite .section-subtitle-center').first().html(data.suite.sectionSubtitle);
    }
    if (data.suite.cards) {
      $('.suite-card').each((i, el) => {
        const card = data.suite.cards[i];
        if (!card) return;
        if (card.name) $(el).find('.suite-card-name').text(card.name);
        if (card.tagline) $(el).find('.suite-card-tagline').text(card.tagline);
        if (card.description !== undefined) $(el).find('.suite-card-desc').text(card.description);
      });
    }
  }

  if (data.about) {
    if (data.about.sectionTitle) $('#research .section-title-center').first().html(data.about.sectionTitle);
    if (data.about.sectionSubtitle) $('#research .section-subtitle-center').first().text(data.about.sectionSubtitle);
  }

  if (data.innovation) {
    if (data.innovation.sectionTitle) $('#architecture .section-title-center').first().text(data.innovation.sectionTitle);
    if (data.innovation.sectionSubtitle) $('#architecture .section-subtitle-center').first().text(data.innovation.sectionSubtitle);
  }

  if (data.portfolio) {
    if (data.portfolio.sectionTitle) $('#evidence .section-title-center').first().text(data.portfolio.sectionTitle);
    if (data.portfolio.sectionSubtitle) $('#evidence .section-subtitle-center').first().text(data.portfolio.sectionSubtitle);
    if (data.portfolio.clients) {
      $('.portfolio-card').each((i, el) => {
        const c = data.portfolio.clients[i];
        if (!c) return;
        if (c.category) $(el).find('.portfolio-cat').text(c.category);
        if (c.name) $(el).find('.portfolio-client h4').text(c.name);
        if (c.description) $(el).find('.portfolio-body > p').first().text(c.description);
      });
    }
  }

  if (data.cta) {
    if (data.cta.label) $('.cta-label').text(data.cta.label);
    if (data.cta.headline) $('.cta-headline').html(data.cta.headline);
    if (data.cta.body) $('.cta-body').text(data.cta.body);
  }

  saveHTML(filepath, $);
}

function updateSettingsHTML(data) {
  const pages = [
    'index.html', 'techvyuha.html', 'nexora-digital.html',
    'aetherai.html', 'automatax.html', 'veltrix.html',
    'rnd.html', 'blog.html', '404.html'
  ];

  pages.forEach(page => {
    const doc = loadCheerio(page);
    if (!doc) return;
    const { $, filepath } = doc;

    if (data.footer) {
      if (data.footer.description) $('.footer-desc').text(data.footer.description);
      if (data.footer.email) {
        $('a[href^="mailto:"]').each((_, el) => {
          $(el).attr('href', 'mailto:' + data.footer.email).text(data.footer.email);
        });
      }
    }

    if (data.social) {
      if (data.social.linkedin) $('a[aria-label="LinkedIn"]').attr('href', data.social.linkedin);
      if (data.social.twitter) $('a[aria-label="X (Twitter)"]').attr('href', data.social.twitter);
      if (data.social.instagram) $('a[aria-label="Instagram"]').attr('href', data.social.instagram);
      if (data.social.reddit) $('a[aria-label="Reddit"]').attr('href', data.social.reddit);
    }

    if (data.meta && page === 'index.html') {
      if (data.meta.siteTitle) $('title').text(data.meta.siteTitle);
      if (data.meta.siteDescription) $('meta[name="description"]').attr('content', data.meta.siteDescription);
    }

    saveHTML(filepath, $);
  });
}

function updateSuitePageHTML(filename, data) {
  const doc = loadCheerio(filename);
  if (!doc) return;
  const { $, filepath } = doc;

  if (data.heroTitle) {
    $('title').text(data.heroTitle + ' \u2014 Nexora Suite');
    $('.division-hero-name').html(data.heroTitle + '<span class="brand-dot">.</span>');
  }
  if (data.heroTagline) $('.division-hero-tagline').text(data.heroTagline);
  if (data.heroDesc) $('.division-hero-desc').text(data.heroDesc);
  if (data.heroLabel) $('.division-hero-label').text(data.heroLabel);

  if (data.services) {
    $('.service-item').each((i, el) => {
      const s = data.services[i];
      if (!s) return;
      if (s.icon) $(el).find('.service-icon-box').text(s.icon);
      if (s.name) $(el).find('.service-name').text(s.name);
      if (s.description) $(el).find('.service-desc').text(s.description);
    });
  }

  if (data.ctaHeadline) $('.division-cta-headline').html(data.ctaHeadline);
  if (data.ctaDesc) $('.division-cta-desc').text(data.ctaDesc);

  saveHTML(filepath, $);
}

// ─── Initial Content ────────────────────────────────
function buildInitialContent() {
  return {
    _lastModified: new Date().toISOString(),
    home: {
      hero: {
        label: 'NEXORA \u2014 AI SYSTEMS / EST. 2024',
        headline1: 'We Architect',
        headline2: 'Intelligence.',
        subtitle: 'Systems before scale.<br />Structure before speed.'
      },
      suite: {
        sectionTitle: 'Our Divisions',
        sectionSubtitle: 'Five specialized divisions, one unified vision \u2014 delivering comprehensive technology solutions across every domain.',
        cards: [
          { num: '01', name: 'TechVyuha', tagline: 'Academic Innovation & Project Support', description: 'Final year projects, internships, research mentorship, and lab setup support for institutions and students.', link: 'techvyuha.html', accent: '#6366F1' },
          { num: '02', name: 'Nexora Digital', tagline: 'Web Application Engineering', description: '', link: 'nexora-digital.html', accent: '#3B82F6' },
          { num: '03', name: 'AetherAI', tagline: 'Artificial Intelligence Systems', description: '', link: 'aetherai.html', accent: '#A855F7' },
          { num: '04', name: 'AutomataX', tagline: 'Automation & Workflow Engineering', description: '', link: 'automatax.html', accent: '#6D28D9' },
          { num: '05', name: 'Veltrix', tagline: 'Custom Software & Product Dev', description: '', link: 'veltrix.html', accent: '#0EA5E9' }
        ]
      },
      about: {
        sectionTitle: 'Where Intelligence<br>Meets Architecture',
        sectionSubtitle: 'Every breakthrough starts with a question. We turn complexity into structured, intelligent systems.'
      },
      innovation: {
        sectionTitle: 'Innovation in Action',
        sectionSubtitle: 'From concept to reality \u2014 explore our latest solutions and ongoing research initiatives.',
        solutions: [
          { name: 'AgroSense', description: 'Empowering farmers with intelligent soil and crop analysis.', tags: ['Soil Analytics', 'pH Detection', 'AgriTech AI'] }
        ]
      },
      portfolio: {
        sectionTitle: 'Client Success Stories',
        sectionSubtitle: 'Transforming businesses through intelligent technology solutions.',
        clients: [
          { category: 'FinTech', name: 'Nexora Financial', description: 'Built AI-powered fraud detection system and complete digital identity for a next-gen fintech startup. Reduced false positives by 40% in pilot phase.', tags: ['AI Systems', 'Brand Identity'] },
          { category: 'Healthcare', name: 'MedVault Labs', description: 'Designed secure patient data management platform with automated compliance reporting. Streamlined clinical workflows and reduced admin overhead by 60%.', tags: ['Data Platform', 'Automation'] },
          { category: 'Logistics', name: 'SwiftRoute Global', description: 'Developed intelligent route optimisation engine for last-mile delivery. Integrated real-time tracking and predictive analytics to cut delivery times by 35%.', tags: ['Route AI', 'Real-time Analytics'] },
          { category: 'EdTech', name: 'Learnova Academy', description: 'Created adaptive learning platform powered by ML that personalises curriculum paths. Achieved 2.5x improvement in student engagement and completion rates.', tags: ['ML Platform', 'Adaptive Learning'] }
        ]
      },
      cta: {
        label: "LET'S BUILD TOGETHER",
        headline: 'Have a project<br>in mind?<br><em>Let\'s talk.</em>',
        body: "Tell us about your idea, challenge, or vision. We'll get back to you within 24 hours with a clear plan of action."
      }
    },
    techvyuha: {
      heroTitle: 'TechVyuha',
      heroLabel: 'NEXORA SUITE / DIVISION 01',
      heroTagline: 'Academic Innovation & Project Support Division',
      heroDesc: 'Bridging the gap between academia and industry. We empower students and institutions with structured project guidance, hands-on internships, and research mentorship \u2014 building the next generation of tech professionals.',
      services: [
        { icon: '\ud83c\udf93', name: 'Final Year Project Guidance', description: 'B.Tech, M.Tech, and MCA project support with industry-standard methodologies, documentation, and implementation.' },
        { icon: '\ud83d\udcbc', name: 'Industrial Internship Programs', description: 'Hands-on training in AI, web development, automation, and data science.' },
        { icon: '\ud83d\udd2c', name: 'Research Mentorship', description: 'Paper writing support, thesis guidance, conference preparation, and literature review assistance.' },
        { icon: '\ud83c\udfd7\ufe0f', name: 'Lab Setup & Infrastructure', description: 'Smart lab installations, IoT setups, computer lab configurations, and educational infrastructure planning.' },
        { icon: '\ud83d\udcda', name: 'Workshops & Training', description: 'Technical workshops, coding bootcamps, hackathon facilitation, and faculty development programs.' },
        { icon: '\ud83d\udccb', name: 'Career Guidance & Placement', description: 'Mock interviews, resume building, portfolio development, and placement preparation programs.' }
      ],
      ctaHeadline: 'Ready to build<br /><em>your future?</em>',
      ctaDesc: 'Whether you\'re a student seeking project guidance or an institution looking for training partnerships \u2014 let\'s talk.'
    },
    nexora: {
      heroTitle: 'Nexora Digital',
      heroLabel: 'NEXORA SUITE / DIVISION 02',
      heroTagline: 'Web Application Engineering',
      heroDesc: 'Building modern, performant web applications that drive business growth.',
      services: [],
      ctaHeadline: 'Ready to build<br /><em>your vision?</em>',
      ctaDesc: 'Let\'s create something exceptional together.'
    },
    aetherai: {
      heroTitle: 'AetherAI',
      heroLabel: 'NEXORA SUITE / DIVISION 03',
      heroTagline: 'Artificial Intelligence Systems',
      heroDesc: 'Designing and deploying intelligent systems that solve real-world problems.',
      services: [],
      ctaHeadline: 'Ready to build<br /><em>intelligence?</em>',
      ctaDesc: 'From concept to production AI \u2014 let\'s talk.'
    },
    automatax: {
      heroTitle: 'AutomataX',
      heroLabel: 'NEXORA SUITE / DIVISION 04',
      heroTagline: 'Automation & Workflow Engineering',
      heroDesc: 'Streamlining operations through intelligent automation and workflow design.',
      services: [],
      ctaHeadline: 'Ready to<br /><em>automate?</em>',
      ctaDesc: 'Let\'s eliminate manual processes together.'
    },
    veltrix: {
      heroTitle: 'Veltrix',
      heroLabel: 'NEXORA SUITE / DIVISION 05',
      heroTagline: 'Custom Software & Product Dev',
      heroDesc: 'End-to-end software development for products that matter.',
      services: [],
      ctaHeadline: 'Ready to build<br /><em>your product?</em>',
      ctaDesc: 'From MVPs to enterprise systems \u2014 let\'s talk.'
    },
    blog: {
      title: 'System Thinking.',
      subtitle: 'Writing on AI architecture, structured intelligence, and the engineering of complex systems.',
      posts: [
        { id: 1, title: 'The Myth of the Minimal Viable Architecture', category: 'architecture', date: 'FEB 2026', readTime: '12 min read', excerpt: 'There is a belief that architecture can be deferred. This is not a strategy. It is an assumption.', featured: true },
        { id: 2, title: 'Failure Modes Are Features, Not Exceptions', category: 'systems', date: 'JAN 2026', readTime: '8 min', excerpt: 'Defensive architecture starts by mapping everything that can fail.' },
        { id: 3, title: 'Latency Is Not a Metric. It Is a Product Decision.', category: 'inference', date: 'JAN 2026', readTime: '6 min', excerpt: 'When a team optimises for inference speed without a latency budget, they are optimising in the wrong direction.' },
        { id: 4, title: 'Why Microservices Break at the Intelligence Layer', category: 'architecture', date: 'DEC 2025', readTime: '10 min', excerpt: 'Standard microservice principles hold well for stateless compute. They do not hold for stateful inference contexts.' },
        { id: 5, title: 'The Architecture Dossier: What We Ship Before We Build', category: 'process', date: 'NOV 2025', readTime: '7 min', excerpt: 'Before any Nexora project enters development, we produce one document.' }
      ]
    },
    rnd: {
      title: 'Innovation in Action',
      subtitle: 'From concept to reality \u2014 explore our completed solutions, active research, and upcoming projects.',
      projects: [
        { id: 1, title: 'AgroSense', status: 'completed', date: 'Launched 2025', description: 'Empowering farmers with intelligent soil and crop analysis.', tags: ['Soil Analytics', 'pH Detection', 'AgriTech AI'], progress: 100 },
        { id: 2, title: 'TrustScore\u2122 by Bevorse', status: 'active', date: 'Started Jan 2026', description: 'A business credibility scoring system that rates businesses based on their digital presence.', tags: ['Business Intelligence', 'Credibility Scoring', 'Review Automation'], progress: 65 },
        { id: 3, title: 'Virtual Ad Placement for Short-Form Content', status: 'active', date: 'Started Nov 2025', description: 'Developing distribution network technology that seamlessly integrates brand messages into short-form content.', tags: ['Ad Tech', 'Computer Vision', 'Content AI'], progress: 40 },
        { id: 4, title: 'Quick Fashion Logistics', status: 'active', date: 'Started Feb 2026', description: 'Innovation in fashion industry logistics for rapid fulfilment and supply chain optimisation.', tags: ['Supply Chain', 'Logistics AI', 'Optimisation'], progress: 20 },
        { id: 5, title: 'Butler \u2014 Super Intelligent Digital Partner', status: 'planning', date: 'Starting Q3 2026', description: 'Developing a next-generation AI assistant that acts as a comprehensive digital partner.', tags: ['AI Assistant', 'NLP', 'Business Automation'], progress: 0 }
      ]
    },
    settings: {
      footer: {
        description: 'We architect intelligent systems that bring order to complexity. Infrastructure-level AI for organisations that operate at scale.',
        email: 'contact@nexora.canonix.in'
      },
      social: {
        linkedin: 'https://linkedin.com/company/nexora',
        twitter: 'https://twitter.com/nexora_ai',
        instagram: 'https://instagram.com/nexora.nexora.in',
        reddit: 'https://reddit.com/r/nexora'
      },
      meta: {
        siteTitle: 'Nexora \u2014 We Architect Intelligence',
        siteDescription: 'Nexora builds intelligent systems that bring order to complexity. Infrastructure-level AI for organisations that operate at scale.',
        ogImage: 'https://nexora.nexora.in/images/og-image.png'
      }
    }
  };
}

// ─── Start & Lifecycle ──────────────────────────────
let activeServer = null;

function startServer(port, maxRetries = 10) {
  const currentPort = Number(port) || 3000;
  const srv = app.listen(currentPort);

  srv.on('listening', () => {
    activeServer = srv;
    console.log('');
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   NEXORA Server');
    console.log('   Site:  http://localhost:' + currentPort);
    console.log('   Admin: http://localhost:' + currentPort + '/admin');
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  });

  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && maxRetries > 0) {
      console.warn(`\n  [Notice: Port ${currentPort} is currently occupied, attempting port ${currentPort + 1}...]`);
      try { srv.close(); } catch (_) {}
      setTimeout(() => startServer(currentPort + 1, maxRetries - 1), 250);
    } else {
      console.error('Server error:', err.message || err);
    }
  });
}

function gracefulShutdown() {
  if (activeServer) {
    try {
      activeServer.close(() => {
        process.exit(0);
      });
      return;
    } catch (_) {}
  }
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Export for Vercel Serverless Function & testing
module.exports = app;

// Only bind TCP port when run directly (e.g. node server.js)
if (require.main === module) {
  startServer(PORT);
}

