/* ═══════════════════════════════════════════════════════
   NEXORA — main.js
   Three.js wireframe phoenix + GSAP ScrollTrigger
   Split into independent blocks so a CDN failure
   doesn't kill the entire page.
═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════
     1. NAV BEHAVIOUR
  ═══════════════════════════════════════════════ */
  const nav = document.getElementById('nav');
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');

  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  if (hamburger) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', isOpen);
      hamburger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });
    mobileMenu.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.setAttribute('aria-label', 'Open menu');
      });
    });
  }

  /* ═══════════════════════════════════════════════
     1b. ACTIVE NAV LINK ON SCROLL
  ═══════════════════════════════════════════════ */
  const navLinks = document.querySelectorAll('.nav-links .nav-link[href^="#"]');
  const sections = [];
  navLinks.forEach(link => {
    const id = link.getAttribute('href').slice(1);
    const section = document.getElementById(id);
    if (section) sections.push({ el: section, link });
  });

  function updateActiveNav() {
    const scrollY = window.scrollY + 120;
    let current = null;
    for (const s of sections) {
      if (s.el.offsetTop <= scrollY) current = s;
    }
    navLinks.forEach(l => l.classList.remove('active'));
    if (current) current.link.classList.add('active');
  }

  if (sections.length) {
    window.addEventListener('scroll', updateActiveNav, { passive: true });
    updateActiveNav();
  }

  /* ═══════════════════════════════════════════════
     1c. BACK TO TOP BUTTON
  ═══════════════════════════════════════════════ */
  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('visible', window.scrollY > 600);
    }, { passive: true });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ═══════════════════════════════════════════════
     1d. HERO LOADER
  ═══════════════════════════════════════════════ */
  const heroLoader = document.getElementById('hero-loader');
  function dismissHeroLoader() {
    if (heroLoader) heroLoader.classList.add('hidden');
  }
  // Dismiss after Three.js scene starts or after a timeout fallback
  setTimeout(dismissHeroLoader, 3000);

  /* ═══════════════════════════════════════════════
     2. THREE.JS PHOENIX CANVAS
  ═══════════════════════════════════════════════ */
  (function initThreeScene() {
    const canvas = document.getElementById('phoenix-canvas');
    if (!canvas || typeof THREE === 'undefined') {
      dismissHeroLoader();
      return;
    }

    // Scene
    const scene = new THREE.Scene();
    const W = canvas.clientWidth || window.innerWidth;
    const H = canvas.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);

    // ── Colors — Light hero palette ─────────────
    const COL_LINE = new THREE.Color(0x0a2540);
    const COL_FIRE = new THREE.Color(0x0052cc);
    const COL_DIM  = new THREE.Color(0x3b82f6);
    const COL_PART   = new THREE.Color(0x0052cc);  // electric blue — visible on white bg
    const COL_PART_F = new THREE.Color(0x2563eb);

    // ── Phoenix wireframe (icosahedron core) ────
    const icoGeo = new THREE.IcosahedronGeometry(1.5, 2);
    const edgeMat = new THREE.LineBasicMaterial({ color: COL_LINE, transparent: true, opacity: 0.7 });
    const wireframe = new THREE.WireframeGeometry(icoGeo);
    const lineSegs = new THREE.LineSegments(wireframe, edgeMat);
    scene.add(lineSegs);

    // Outer ring — structural "wing" lines
    const ringGeo = new THREE.EdgesGeometry(new THREE.TorusGeometry(2.1, 0.01, 3, 24));
    const ringMat = new THREE.LineBasicMaterial({ color: COL_DIM, transparent: true, opacity: 0.4 });
    const ring = new THREE.LineSegments(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 3;
    scene.add(ring);

    const ring2Geo = new THREE.EdgesGeometry(new THREE.TorusGeometry(2.6, 0.008, 3, 18));
    const ring2 = new THREE.LineSegments(ring2Geo, new THREE.LineBasicMaterial({ color: COL_DIM, transparent: true, opacity: 0.2 }));
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.y = Math.PI / 6;
    scene.add(ring2);

    // ── Particles ──────────────────────────────
    const PARTICLE_COUNT = window.innerWidth < 600 ? 300 : window.innerWidth < 1024 ? 550 : 900;
    const partPositions = new Float32Array(PARTICLE_COUNT * 3);
    const partTargets = new Float32Array(PARTICLE_COUNT * 3);
    const partColors = new Float32Array(PARTICLE_COUNT * 3);

    const scatterRadius = 14;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = scatterRadius + Math.random() * 6;
      partPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      partPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      partPositions[i * 3 + 2] = r * Math.cos(phi);
    }

    const icoPositions = icoGeo.attributes.position;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const idx = Math.floor(Math.random() * (icoPositions.count));
      const scale = 1.4 + Math.random() * 0.3;
      partTargets[i * 3] = icoPositions.getX(idx) * scale;
      partTargets[i * 3 + 1] = icoPositions.getY(idx) * scale;
      partTargets[i * 3 + 2] = icoPositions.getZ(idx) * scale;
      partColors[i * 3] = COL_PART.r;
      partColors[i * 3 + 1] = COL_PART.g;
      partColors[i * 3 + 2] = COL_PART.b;
    }

    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute('position', new THREE.BufferAttribute(partPositions.slice(), 3));
    partGeo.setAttribute('color', new THREE.BufferAttribute(partColors, 3));

    const partMat = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const particles = new THREE.Points(partGeo, partMat);
    scene.add(particles);

    // ── Logo mark (two thin lines forming "C X") ─
    const logoGroup = new THREE.Group();
    const logoMat = new THREE.LineBasicMaterial({ color: COL_FIRE, transparent: true, opacity: 0 });
    const arcPts = [];
    for (let i = 0; i <= 24; i++) {
      const angle = (Math.PI * 0.25) + (i / 24) * (Math.PI * 1.5);
      arcPts.push(new THREE.Vector3(Math.cos(angle) * 0.5 - 0.4, Math.sin(angle) * 0.5, 0));
    }
    const cLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), logoMat.clone());
    const xL1 = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.1, 0.5, 0), new THREE.Vector3(0.6, -0.5, 0)]),
      logoMat.clone()
    );
    const xL2 = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.6, 0.5, 0), new THREE.Vector3(0.1, -0.5, 0)]),
      logoMat.clone()
    );
    logoGroup.add(cLine, xL1, xL2);
    logoGroup.visible = false;
    scene.add(logoGroup);

    // ── Animation State ─────────────────────────
    let assemblyProgress = 0;
    let dispersalProgress = 0;
    let phxOpacity = 0;
    let animPhase = 'assembling';
    const clock = new THREE.Clock();
    let isScrolledPast = false;

    // ── Mouse / Touch interactivity ─────────────
    const mouse = { x: 0, y: 0 };
    const targetRot = { x: 0, y: 0 };

    canvas.style.pointerEvents = 'auto';

    function onPointerMove(px, py) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((px - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((py - rect.top) / rect.height) * 2 + 1;
      targetRot.y = mouse.x * 0.4;
      targetRot.x = mouse.y * 0.25;
    }

    canvas.addEventListener('mousemove', (e) => {
      onPointerMove(e.clientX, e.clientY);
    });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    canvas.addEventListener('mouseleave', () => {
      targetRot.x = 0;
      targetRot.y = 0;
    });

    // Dismiss hero loader once first frame renders
    setTimeout(() => {
      animPhase = 'assembling';
      partMat.opacity = 1;
      dismissHeroLoader();
    }, 400);

    // Scroll — detect when hero exits
    const heroEl = document.getElementById('hero');
    window.addEventListener('scroll', () => {
      if (!heroEl) return;
      const heroBottom = heroEl.getBoundingClientRect().bottom;
      if (heroBottom < 0 && !isScrolledPast) {
        isScrolledPast = true;
        if (animPhase === 'idle') animPhase = 'dispersing';
      } else if (heroBottom >= 0 && isScrolledPast) {
        isScrolledPast = false;
        if (animPhase === 'logo' || animPhase === 'dispersing') {
          animPhase = 'assembling';
          dispersalProgress = 0;
          logoGroup.visible = false;
          logoGroup.children.forEach(c => { c.material.opacity = 0; });
          lineSegs.material.opacity = 0.7;
          ring.material.opacity = 0.4;
          ring2.material.opacity = 0.2;
        }
      }
    }, { passive: true });

    // ── Helpers ───────────────────────────────
    function lerp(a, b, t) { return a + (b - a) * t; }
    function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    // ── Pause render when hero canvas is off-screen ────
    let canvasVisible = true;
    if ('IntersectionObserver' in window) {
      const canvasObserver = new IntersectionObserver(
        (entries) => { canvasVisible = entries[0].isIntersecting; },
        { threshold: 0 }
      );
      canvasObserver.observe(canvas);
    }

    // ── Render loop ──────────────────────────
    function render() {
      requestAnimationFrame(render);
      if (!canvasVisible) return;
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      lineSegs.rotation.y += 0.0008;
      lineSegs.rotation.x += 0.0002;
      ring.rotation.z += 0.0004;
      ring2.rotation.y += 0.0003;

      // Smooth mouse/touch influence on scene
      scene.rotation.y += (targetRot.y - scene.rotation.y) * 0.03;
      scene.rotation.x += (targetRot.x - scene.rotation.x) * 0.03;
      particles.rotation.y = lineSegs.rotation.y;
      particles.rotation.x = lineSegs.rotation.x;

      const pos = partGeo.attributes.position;
      const col = partGeo.attributes.color;

      if (animPhase === 'assembling') {
        assemblyProgress = Math.min(assemblyProgress + delta * 0.35, 1);
        phxOpacity = Math.min(phxOpacity + delta * 0.8, 0.7);
        lineSegs.material.opacity = phxOpacity;
        const t = easeInOut(assemblyProgress);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const si = i * 3;
          pos.setX(i, lerp(partPositions[si], partTargets[si], t));
          pos.setY(i, lerp(partPositions[si + 1], partTargets[si + 1], t));
          pos.setZ(i, lerp(partPositions[si + 2], partTargets[si + 2], t));
          const blend = t;
          col.setX(i, lerp(COL_PART_F.r, COL_PART.r, blend));
          col.setY(i, lerp(COL_PART_F.g, COL_PART.g, blend));
          col.setZ(i, lerp(COL_PART_F.b, COL_PART.b, blend));
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;

        if (assemblyProgress >= 1) animPhase = 'idle';

      } else if (animPhase === 'idle') {
        const pulse = (Math.sin(elapsed * 0.8) + 1) / 2;
        const pc = COL_DIM.clone().lerp(COL_LINE, pulse * 0.3);
        lineSegs.material.color.set(pc);
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const si = i * 3;
          pos.setX(i, partTargets[si] + Math.sin(elapsed * 0.2 + i * 0.1) * 0.004);
          pos.setY(i, partTargets[si + 1] + Math.cos(elapsed * 0.25 + i * 0.13) * 0.004);
          pos.setZ(i, partTargets[si + 2] + Math.sin(elapsed * 0.15 + i * 0.17) * 0.004);
        }
        pos.needsUpdate = true;

      } else if (animPhase === 'dispersing') {
        dispersalProgress = Math.min(dispersalProgress + delta * 0.5, 1);
        const t = easeInOut(dispersalProgress);

        lineSegs.material.opacity = lerp(0.7, 0, t);
        ring.material.opacity = lerp(0.4, 0, t);
        ring2.material.opacity = lerp(0.2, 0, t);
        partMat.opacity = lerp(1, 0, t);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const si = i * 3;
          pos.setX(i, lerp(partTargets[si], partPositions[si], t));
          pos.setY(i, lerp(partTargets[si + 1], partPositions[si + 1], t));
          pos.setZ(i, lerp(partTargets[si + 2], partPositions[si + 2], t));
        }
        pos.needsUpdate = true;

        if (dispersalProgress >= 1) {
          animPhase = 'logo';
          logoGroup.visible = true;
        }

      } else if (animPhase === 'logo') {
        logoGroup.children.forEach(c => {
          c.material.opacity = Math.min(c.material.opacity + delta * 1.5, 0.9);
        });
      }

      renderer.render(scene, camera);
    }
    render();

    // ── Responsive camera — globe offset right of centre ──────────
    function updateCameraForSize(w) {
      if (w < 480) {
        camera.position.set(0, -1.2, 7.5);   // mobile: shifted up
        camera.fov = 55;
      } else if (w < 768) {
        camera.position.set(-0.6, -0.6, 6.5); // tablet: slight right + up
        camera.fov = 58;
      } else if (w < 1024) {
        camera.position.set(-1.0, 0, 5.5); // small desktop
        camera.fov = 60;
      } else {
        camera.position.set(-1.5, 0, 5);   // desktop: globe sits right half
        camera.fov = 60;
      }
      camera.updateProjectionMatrix();
    }
    updateCameraForSize(W);

    // ── Force correct canvas size after mobile layout stabilises ──
    setTimeout(() => {
      const fw = canvas.clientWidth || window.innerWidth;
      const fh = canvas.clientHeight || window.innerHeight;
      renderer.setSize(fw, fh);
      camera.aspect = fw / fh;
      updateCameraForSize(fw);
      camera.updateProjectionMatrix();
    }, 200);

    // ── Resize ─────────────────────────────────
    window.addEventListener('resize', () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      updateCameraForSize(w);
      renderer.setSize(w, h);
    });
  })();


    /* ═════════════════════════════════════════════
     2b. SUITE CARDS — removed (bento grid uses reveal-up)
  ═════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════
     3a. REVEAL ANIMATIONS (vanilla — no GSAP needed)
     Must work even if CDN fails.
  ═══════════════════════════════════════════════ */
  (function initRevealObservers() {
    // ── Reveal up ───────────────────────────────
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const delay = parseFloat(entry.target.dataset.delay || 0);
          setTimeout(() => {
            entry.target.classList.add('visible');
          }, delay * 1000);
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -20px 0px' });

    document.querySelectorAll('.reveal-up').forEach((el) => {
      const siblings = Array.from(el.parentElement.querySelectorAll('.reveal-up'));
      const sibIdx = siblings.indexOf(el);
      el.dataset.delay = sibIdx * 0.12;
      revealObserver.observe(el);
    });

    // ── Reveal in ───────────────────────────────
    const revealInObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealInObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal-in').forEach(el => revealInObserver.observe(el));

    // Expose for hydrate.js to re-observe dynamically added elements
    window.__observeReveal = function (el) {
      if (el.classList.contains('reveal-up')) {
        el.dataset.delay = '0';
        revealObserver.observe(el);
      } else if (el.classList.contains('reveal-in')) {
        revealInObserver.observe(el);
      }
    };
  })();

  /* ═══════════════════════════════════════════════
     3b. GSAP SCROLL ANIMATIONS
     (independent — works even if Three.js fails)
  ═══════════════════════════════════════════════ */
  (function initScrollAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    gsap.registerPlugin(ScrollTrigger);

    // ── Parallax Effects ─────────────────────────
    // Only apply on devices wide enough to benefit
    const mqParallax = window.matchMedia('(min-width: 769px)');

    // ── Hero → Suite overlap (runs on ALL viewports) ──
    (function initHeroOverlap() {
      const heroContent = document.querySelector('.hero-content');
      if (heroContent) {
        gsap.to(heroContent, {
          y: -80,
          opacity: 0,
          scale: 0.97,
          ease: 'none',
          scrollTrigger: {
            trigger: '#hero',
            start: '50% top',
            end: 'bottom top',
            scrub: 0.5,
          },
        });
      }

      const phoenixCanvas = document.getElementById('phoenix-canvas');
      if (phoenixCanvas) {
        gsap.to(phoenixCanvas, {
          opacity: 0.15,
          scale: 0.94,
          ease: 'none',
          scrollTrigger: {
            trigger: '#hero',
            start: '55% top',
            end: 'bottom top',
            scrub: 0.5,
          },
        });
      }
    })();

    function initParallax() {
      if (!mqParallax.matches) return;

      // Portfolio thumbs slide up slower than cards
      document.querySelectorAll('.portfolio-thumb').forEach((thumb) => {
        gsap.to(thumb, {
          y: -20,
          ease: 'none',
          scrollTrigger: {
            trigger: thumb.closest('.portfolio-card'),
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        });
      });

      // Footer watermark drifts up
      const footerWm = document.querySelector('.footer-watermark');
      if (footerWm) {
        gsap.fromTo(footerWm, { yPercent: 20 }, {
          yPercent: -10,
          ease: 'none',
          scrollTrigger: {
            trigger: '.footer',
            start: 'top bottom',
            end: 'bottom bottom',
            scrub: true,
          },
        });
      }

      // Section badges have subtle y-shift tied to scroll
      document.querySelectorAll('.section-badge').forEach((badge) => {
        gsap.to(badge, {
          y: -15,
          ease: 'none',
          scrollTrigger: {
            trigger: badge.closest('.section'),
            start: 'top bottom',
            end: 'center center',
            scrub: true,
          },
        });
      });
    }

    initParallax();
    // Re-init on resize crossing the breakpoint
    mqParallax.addEventListener('change', () => {
      ScrollTrigger.getAll().forEach(st => st.kill());
      if (mqParallax.matches) initParallax();
    });
  })();

  /* ═══════════════════════════════════════════════
     4. MOBILE PORTFOLIO CAROUSEL
     Single-card vertical auto-loop on <768px
  ═══════════════════════════════════════════════ */
  (function initPortfolioCarousel() {
    const mq = window.matchMedia('(max-width: 767px)');

    function setup() {
      const grid = document.querySelector('#evidence .portfolio-grid');
      if (!grid || grid.dataset.carouselReady) return;
      grid.dataset.carouselReady = 'true';

      const cards = Array.from(grid.querySelectorAll('.portfolio-card'));
      if (cards.length < 2) return;

      // Build outer wrapper
      const outer = document.createElement('div');
      outer.className = 'portfolio-carousel-outer';
      grid.parentNode.insertBefore(outer, grid);

      // Build scrolling track
      const track = document.createElement('div');
      track.className = 'portfolio-carousel-track';
      outer.appendChild(track);

      // Move cards into track
      cards.forEach(card => track.appendChild(card));

      // Dot indicators — placed OUTSIDE the clipping outer
      const dots = document.createElement('div');
      dots.className = 'portfolio-carousel-dots';
      outer.parentNode.insertBefore(dots, outer.nextSibling);
      cards.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'pc-dot' + (i === 0 ? ' active' : '');
        dot.addEventListener('click', () => goTo(i));
        dots.appendChild(dot);
      });

      // Hide original grid
      grid.style.display = 'none';

      let current = 0;
      let autoTimer;

      function cardH() {
        return (cards[0] ? cards[0].getBoundingClientRect().height : 240) + 16;
      }

      function updateHeight() {
        outer.style.height = Math.round(cardH()) + 'px';
      }

      function goTo(idx) {
        const total = cards.length;
        current = ((idx % total) + total) % total;
        track.style.transform = 'translateY(-' + (current * cardH()) + 'px)';
        dots.querySelectorAll('.pc-dot').forEach((d, i) => {
          d.classList.toggle('active', i === current);
        });
      }

      function next() { goTo(current + 1); }

      function startAuto() {
        clearInterval(autoTimer);
        autoTimer = setInterval(next, 3500);
      }

      // Enable transition after initial layout
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          track.style.transition = 'transform 0.65s cubic-bezier(0.16, 1, 0.3, 1)';
          updateHeight();
          startAuto();
        });
      });

      // Pause on touch, resume after 5s
      outer.addEventListener('touchstart', () => clearInterval(autoTimer), { passive: true });
      outer.addEventListener('touchend', () => setTimeout(startAuto, 5000), { passive: true });

      window.addEventListener('resize', () => {
        if (!mq.matches) return;
        updateHeight();
        goTo(current);
      }, { passive: true });
    }

    if (mq.matches) setup();
    mq.addEventListener('change', e => { if (e.matches) setup(); });
  })();

})();
