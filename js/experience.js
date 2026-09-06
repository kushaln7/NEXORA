/* ═══════════════════════════════════════════════════════
   NEXORA — experience.js v2.0
   Cinematic photorealistic Earth — built to impress.
   NASA Blue Marble textures, volumetric atmosphere,
   animated star field, mouse parallax, scroll camera pull.
   Performance-safe: capped DPR, RAF gated, reduced-motion.
═══════════════════════════════════════════════════════ */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmallScreen = window.matchMedia('(max-width: 767px)').matches;
const isLowPower = false;

/* ─────────────────────────────────────────────────────
   1. CINEMATIC EARTH HERO (three.js)
───────────────────────────────────────────────────── */
async function initEarth() {
  const mount = document.getElementById('earth-visual');
  const canvas = document.getElementById('earth-canvas');
  const fallbackImg = document.getElementById('earth-fallback');
  if (!mount || !canvas) return;

  const supportsWebGL = (() => {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  })();

  if (!supportsWebGL || isLowPower) {
    canvas.remove();
    fallbackImg.classList.add('visible');
    dismissLoader();
    return;
  }

  let THREE;
  try {
    THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
  } catch (e) {
    canvas.remove();
    fallbackImg.classList.add('visible');
    dismissLoader();
    return;
  }

  // ── Renderer ──
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 1000);
  camera.position.set(0, 0, 4.2);

  // ── Globe group ──
  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  // Sun direction: desktop side lighting vs mobile front-facing illumination
  const sunDir = new THREE.Vector3(0.62, 0.38, 0.68).normalize();

  function sizeToContainer() {
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const aspect = w / h;
    const vFovRad = (camera.fov * Math.PI) / 180;
    const halfHeight = Math.tan(vFovRad / 2) * camera.position.z;
    const halfWidth = halfHeight * aspect;

    if (w >= 900) {
      // Desktop: Frame globe gracefully on the right side of the screen
      globeGroup.position.x = Math.max(0.70, halfWidth * 0.42);
      globeGroup.position.y = 0.02;
      globeGroup.scale.setScalar(1.18);
      sunDir.set(0.62, 0.38, 0.68).normalize();
    } else {
      // Mobile / Tablet: Centered horizontally, framed cleanly below hero headline
      // Enforce guaranteed safe margins on all 4 sides so the atmosphere never clips
      const maxRadius = Math.min(halfWidth * 0.74, halfHeight * 0.38);
      globeGroup.scale.setScalar(maxRadius / 1.022);
      globeGroup.position.x = 0.0;
      // Position globe with comfortable clearance above bottom fold & scroll indicator
      globeGroup.position.y = -halfHeight * 0.20;
      // Broad daylight illumination across front of Earth to prevent harsh half-cut shadow
      sunDir.set(0.18, 0.32, 0.93).normalize();
    }
  }

  // ── Load textures ──
  const loader = new THREE.TextureLoader();
  let dayMap, normalMap, specMap, nightMap, cloudMap;
  try {
    [dayMap, normalMap, specMap, nightMap, cloudMap] = await Promise.all([
      loader.loadAsync('images/textures/earth_atmos_2048.jpg'),
      loader.loadAsync('images/textures/earth_normal_2048.jpg'),
      loader.loadAsync('images/textures/earth_specular_2048.jpg'),
      loader.loadAsync('images/textures/earth_lights_2048.jpg'),
      loader.loadAsync('images/textures/earth_clouds_2048.jpg'),
    ]);
  } catch (e) {
    canvas.remove();
    fallbackImg.classList.add('visible');
    dismissLoader();
    return;
  }

  if (!dayMap) {
    canvas.remove();
    fallbackImg.classList.add('visible');
    dismissLoader();
    return;
  }

  [dayMap, nightMap, cloudMap].forEach((t) => {
    if (t) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
  });
  [normalMap, specMap].forEach((t) => {
    if (t) {
      t.colorSpace = THREE.NoColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
  });

  // ── Star field spanning the entire cosmic hero canvas ──
  const starCount = isSmallScreen ? 2500 : 5500;
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const r = 40 + Math.random() * 260;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = r * Math.cos(phi);
    starSizes[i] = 0.35 + Math.random() * 1.8;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));

  const starMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: `
      attribute float aSize;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vBrightness;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        float twinkle = sin(uTime * 1.5 + position.x * 0.5 + position.y * 0.3) * 0.5 + 0.5;
        vBrightness = 0.4 + twinkle * 0.6;
        gl_PointSize = aSize * uPixelRatio * (80.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying float vBrightness;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.0, d) * vBrightness;
        gl_FragColor = vec4(vec3(0.85, 0.92, 1.0), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMaterial);
  scene.add(stars);

  // ── 1. PHOTOREALISTIC BLUE MARBLE EARTH SURFACE ──
  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      dayTexture:      { value: dayMap },
      normalTexture:   { value: normalMap },
      specularTexture: { value: specMap },
      nightTexture:    { value: nightMap },
      cloudTexture:    { value: cloudMap },
      sunDirection:    { value: sunDir },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec3 vTangentW;
      varying vec3 vBitangentW;

      void main() {
        vUv = uv;
        vec3 n = normalize(normal);
        // Tangent frame on unit sphere for normal mapping
        vec3 t = normalize(vec3(-sin(uv.x * 6.2831853), 0.0, cos(uv.x * 6.2831853)));
        if (abs(n.y) > 0.999) t = vec3(1.0, 0.0, 0.0);
        vec3 b = cross(n, t);

        vNormalW    = normalize(mat3(modelMatrix) * n);
        vTangentW   = normalize(mat3(modelMatrix) * t);
        vBitangentW = normalize(mat3(modelMatrix) * b);
        vPosW       = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D dayTexture;
      uniform sampler2D normalTexture;
      uniform sampler2D specularTexture;
      uniform sampler2D nightTexture;
      uniform sampler2D cloudTexture;
      uniform vec3 sunDirection;

      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec3 vTangentW;
      varying vec3 vBitangentW;

      void main() {
        // ── 1. Geometric Normal and Tangent-space Normal Relief ──
        vec3 geoN = normalize(vNormalW);
        mat3 tbn  = mat3(normalize(vTangentW), normalize(vBitangentW), geoN);
        vec3 nMap = texture2D(normalTexture, vUv).rgb * 2.0 - 1.0;
        nMap.xy  *= 0.40; // realistic terrain elevation
        vec3 N    = normalize(tbn * nMap);

        vec3 L = normalize(sunDirection);
        vec3 V = normalize(cameraPosition - vPosW);
        vec3 H = normalize(L + V);

        // ── 2. NASA Blue Marble Day & Water Textures ──
        vec3 dayTex     = texture2D(dayTexture, vUv).rgb;
        float waterMask = texture2D(specularTexture, vUv).r;

        // ── 3. Photorealistic Ocean Modeling (Apollo 17 / Blue Marble Palette) ──
        // The raw satellite texture has very dark ocean albedo.
        // We reconstruct the photorealistic scattering of Earth's oceans:
        // - Continental shelves / shallow coastal banks (Bahamas, Great Barrier Reef)
        // - Open pelagic royal sapphire blue
        // - Deep abyssal blue
        float oceanLuma = clamp(dot(dayTex, vec3(0.299, 0.587, 0.114)) * 3.8, 0.0, 1.0);
        vec3 deepOcean   = vec3(0.018, 0.095, 0.28);  // Rich deep oceanic blue
        vec3 midOcean    = vec3(0.040, 0.205, 0.48);  // Open sea royal sapphire
        vec3 shallowSea  = vec3(0.075, 0.390, 0.59);  // Coastal shelf turquoise
        vec3 oceanColor  = mix(deepOcean, midOcean, oceanLuma);
        oceanColor       = mix(oceanColor, shallowSea, pow(oceanLuma, 2.2));

        // Land: Natural NASA photography with rich vegetation & warm desert vibrance
        vec3 landColor = pow(dayTex, vec3(0.92)) * 1.22;

        // Composite surface albedo
        vec3 albedo = mix(landColor, oceanColor, smoothstep(0.05, 0.80, waterMask));

        // ── 4. Cloud Shadows on Earth's Surface ──
        // Astronauts frequently note the soft cloud shadows on the oceans/continents
        vec2 cloudShadowUv = vUv - vec2(L.x, L.y) * 0.0026;
        float shadowDensity = texture2D(cloudTexture, cloudShadowUv).r;
        float cloudShadow = 1.0 - smoothstep(0.18, 0.70, shadowDensity) * 0.35;
        albedo *= cloudShadow;

        // ── 5. Daylight Illumination & Terminator ──
        float NdotL = dot(N, L);
        float diffuse = clamp(NdotL, 0.0, 1.0);
        // Atmospheric twilight wrap around the day/night curve
        float twilightWrap = smoothstep(-0.14, 0.14, NdotL);
        diffuse = mix(0.0, diffuse, twilightWrap);

        // Subtle space ambient / earthshine so dark side is visible in space
        float ambient = 0.06;
        float surfaceLight = diffuse * 0.94 + ambient;

        // Day/night blend factors
        float dayMix   = smoothstep(-0.04, 0.16, NdotL);
        float nightMix = 1.0 - smoothstep(-0.24, -0.01, NdotL);

        // ── 6. Night City Lights (Authentic Black Marble) ──
        // ONLY on the dark side of Earth, and strictly on land
        vec3 nightTex   = texture2D(nightTexture, vUv).rgb;
        vec3 cityLights = nightTex * vec3(1.6, 1.3, 0.85) * 1.5 * nightMix * (1.0 - waterMask * 0.9);

        // Surface base color
        vec3 surfaceColor = albedo * surfaceLight * dayMix + cityLights;

        // ── 7. Water Specular Sun Glint (Fresnel Water Sheen) ──
        float NdotH   = max(dot(N, H), 0.0);
        float spec    = pow(NdotH, 75.0) * waterMask * dayMix;
        float NdotV   = max(dot(N, V), 0.0);
        float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 5.0);
        vec3 sunGlint = vec3(1.0, 0.97, 0.91) * spec * fresnel * 2.2;
        surfaceColor += sunGlint;

        // ── 8. Rayleigh Atmospheric Limb Haze (Blue Glow across Planet Horizon) ──
        float geoNdotV    = max(dot(geoN, V), 0.0);
        float limbFresnel = pow(1.0 - geoNdotV, 3.2);
        float sunFacing   = smoothstep(-0.12, 0.45, dot(geoN, L));
        vec3 atmoHaze     = mix(vec3(0.12, 0.42, 0.92), vec3(0.38, 0.74, 1.0), sunFacing);
        surfaceColor     += atmoHaze * limbFresnel * (0.18 + 0.82 * sunFacing) * 1.05;

        gl_FragColor = vec4(surfaceColor, 1.0);
      }
    `,
  });

  const earthGeo = new THREE.SphereGeometry(1.0, 96, 96);
  const globe = new THREE.Mesh(earthGeo, earthMaterial);
  globeGroup.add(globe);

  // ── 2. REALISTIC CLOUD LAYER ──
  const cloudMaterial = new THREE.ShaderMaterial({
    uniforms: {
      cloudTexture: { value: cloudMap },
      sunDirection: { value: sunDir },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vPosW    = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D cloudTexture;
      uniform vec3 sunDirection;

      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;

      void main() {
        vec3 N = normalize(vNormalW);
        vec3 L = normalize(sunDirection);
        vec3 V = normalize(cameraPosition - vPosW);

        // Sample cloud texture
        float cloudDensity = texture2D(cloudTexture, vUv).r;
        // Multi-tier density for delicate wisps and thick storms
        float alpha = smoothstep(0.07, 0.72, cloudDensity) * 0.88;

        float NdotL = dot(N, L);
        float sunLit = smoothstep(-0.06, 0.20, NdotL);
        float cloudDiffuse = clamp(NdotL, 0.0, 1.0) * 0.88 + 0.12;

        // Brilliant cloud white lit by direct sunlight
        vec3 cloudColor = vec3(0.98, 0.99, 1.0) * cloudDiffuse;

        // Atmospheric rim tint on clouds towards edge of Earth
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        cloudColor += vec3(0.20, 0.52, 0.94) * rim * (sunLit * 0.35 + 0.12);

        // Clouds naturally soften on the night side of the planet rather than disappearing
        float finalAlpha = alpha * mix(0.18, 1.0, sunLit);

        gl_FragColor = vec4(cloudColor, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.007, 96, 96), cloudMaterial);
  globeGroup.add(clouds);

  // ── 3. OUTER ATMOSPHERE (LUMINOUS BLUE HALO) ──
  const outerAtmoMaterial = new THREE.ShaderMaterial({
    uniforms: { sunDirection: { value: sunDir } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      void main() {
        vNormal      = normalize(normalMatrix * normal);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      void main() {
        float rim = 1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);
        float intensity = pow(rim, 3.6);
        float sunFacing = smoothstep(-0.15, 0.45, dot(normalize(vWorldNormal), normalize(sunDirection)));
        vec3 atmoColor = mix(vec3(0.10, 0.42, 0.95), vec3(0.40, 0.78, 1.0), sunFacing);
        float alpha = intensity * (0.30 + sunFacing * 0.70);
        gl_FragColor = vec4(atmoColor, alpha);
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  const outerAtmo = new THREE.Mesh(new THREE.SphereGeometry(1.022, 64, 64), outerAtmoMaterial);
  globeGroup.add(outerAtmo);

  // Initial orientation — Americas facing camera in daylight (matching NASA Blue Marble photo)
  globeGroup.rotation.x = 0.22;
  globeGroup.rotation.y = 0.32;

  sizeToContainer();

  // Fade the WebGL canvas in; hide fallback.
  canvas.classList.add('ready');
  fallbackImg.classList.remove('visible');
  dismissLoader();

  // ── Interaction state ──
  const pointer = { x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };
  if (!prefersReducedMotion) {
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') {
        pointerTarget.x = (e.clientX / window.innerWidth - 0.5) * 0.25;
        pointerTarget.y = (e.clientY / window.innerHeight - 0.5) * 0.25;
      } else {
        pointerTarget.x = (e.clientX / window.innerWidth - 0.5) * 2;
        pointerTarget.y = (e.clientY / window.innerHeight - 0.5) * 2;
      }
    });
    window.addEventListener('pointerup', () => {
      pointerTarget.x = 0;
      pointerTarget.y = 0;
    });
    window.addEventListener('pointercancel', () => {
      pointerTarget.x = 0;
      pointerTarget.y = 0;
    });
  }

  // ── Only render while visible ──
  let running = false;
  let rafId = null;
  const clock = new THREE.Clock();

  function frame() {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.elapsedTime;

    if (!prefersReducedMotion) {
      // Slow, majestic axial rotation
      globeGroup.rotation.y += dt * 0.025;

      // Realistic cloud drift over the Earth's surface (differential trade winds)
      clouds.rotation.y += dt * 0.005;

      // Subtle, buttery mouse parallax
      pointer.x += (pointerTarget.x - pointer.x) * 0.035;
      pointer.y += (pointerTarget.y - pointer.y) * 0.035;
      globeGroup.rotation.x = 0.20 + pointer.y * 0.05;
      const isMobile = window.innerWidth < 900;
      const camMaxX = isMobile ? 0.03 : 0.14;
      const camMaxY = isMobile ? 0.02 : 0.08;
      camera.position.x = pointer.x * camMaxX;
      camera.position.y = 0.02 - pointer.y * camMaxY;
      camera.lookAt(0, 0, 0);

      // Star twinkle
      starMaterial.uniforms.uTime.value = elapsed;

      // Subtle star field drift
      stars.rotation.y = elapsed * 0.0015;
      stars.rotation.x = elapsed * 0.0008;
    }

    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    running = true;
    clock.getDelta();
    frame();
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { entry.isIntersecting ? start() : stop(); });
  }, { threshold: 0.01 });
  io.observe(mount);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else if (mount.getBoundingClientRect().bottom > 0) start();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(sizeToContainer, 120);
  });

  if (prefersReducedMotion) {
    renderer.render(scene, camera);
  } else {
    start();
  }
}

function dismissLoader() {
  const heroLoader = document.getElementById('hero-loader');
  if (heroLoader) {
    heroLoader.classList.add('hidden');
  }
}

/* ─────────────────────────────────────────────────────
   2. LENIS SMOOTH SCROLL + GSAP SCROLLTRIGGER SNAP
───────────────────────────────────────────────────── */
async function initScrollExperience() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  let lenis = null;
  if (!prefersReducedMotion) {
    try {
      const { default: Lenis } = await import('https://unpkg.com/lenis@1.3.26/dist/lenis.mjs');
      lenis = new Lenis({ duration: 1.05, smoothWheel: true, syncTouch: false });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } catch (e) { /* smooth scroll is an enhancement, not a requirement */ }
  }

  const canSnap = !prefersReducedMotion && window.matchMedia('(min-width: 1024px)').matches;
  if (canSnap) {
    const sections = gsap.utils.toArray('#main-content > section');
    if (sections.length > 1) {
      ScrollTrigger.addEventListener('refreshInit', () => {});
      requestAnimationFrame(() => {
        const total = document.documentElement.scrollHeight - window.innerHeight;
        if (total <= 0) return;
        const snapPoints = sections.map((s) => Math.min(s.offsetTop / total, 1));
        ScrollTrigger.create({
          start: 0,
          end: total,
          snap: { snapTo: snapPoints, duration: { min: 0.2, max: 0.6 }, delay: 0.06, ease: 'power1.inOut' },
        });
      });
    }
  }
}

/* ─────────────────────────────────────────────────────
   3. MOTION MICRO-INTERACTIONS
───────────────────────────────────────────────────── */
async function initMotion() {
  if (prefersReducedMotion) return;
  let animate, inView, stagger;
  try {
    ({ animate, inView, stagger } = await import('https://unpkg.com/motion@11/dist/es/index.mjs'));
  } catch (e) {
    document.querySelectorAll('[data-reveal-child]').forEach((el) => { el.style.opacity = '1'; });
    return;
  }

  // Staggered entrance for the hero copy
  const heroLines = document.querySelectorAll('.earth-hero-text [data-reveal-child]');
  if (heroLines.length) {
    animate(heroLines, { opacity: [0, 1], y: [24, 0] }, { delay: stagger(0.12), duration: 0.85, easing: [0.16, 1, 0.3, 1] });
  }

  // Magnetic buttons
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * 0.25;
      const y = (e.clientY - r.top - r.height / 2) * 0.35;
      animate(el, { x, y }, { duration: 0.3, easing: 'ease-out' });
    });
    el.addEventListener('pointerleave', () => {
      animate(el, { x: 0, y: 0 }, { duration: 0.4, easing: [0.16, 1, 0.3, 1] });
    });
  });

  // Generic scroll-in reveal
  inView('[data-motion-reveal]', ({ target }) => {
    animate(target, { opacity: [0, 1], y: [24, 0] }, { duration: 0.6, easing: [0.16, 1, 0.3, 1] });
  }, { margin: '-10% 0px -10% 0px' });
}

initEarth();
initScrollExperience();
initMotion();
