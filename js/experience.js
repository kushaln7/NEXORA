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

// Robust mobile detection: strictly targets real phones/tablets, never desktop/touch laptops
const isMobileDevice = (() => {
  try {
    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    return isMobileUA && window.innerWidth < 768;
  } catch (e) {
    return false;
  }
})();

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

  const safeDismissHeroLoader = () => {
    const heroLoader = document.getElementById('hero-loader');
    if (heroLoader) heroLoader.classList.add('hidden');
    if (typeof window.dismissHeroLoader === 'function') window.dismissHeroLoader();
  };

  if (!supportsWebGL || isLowPower) {
    if (fallbackImg) fallbackImg.classList.add('visible');
    safeDismissHeroLoader();
    return;
  }

  // Resilient multi-CDN import: unpkg -> cdnjs -> jsdelivr
  let THREE;
  const threeSources = [
    'https://unpkg.com/three@0.160.0/build/three.module.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'
  ];
  for (const src of threeSources) {
    try {
      THREE = await import(src);
      if (THREE) break;
    } catch (e) {}
  }

  if (!THREE) {
    if (fallbackImg) fallbackImg.classList.add('visible');
    safeDismissHeroLoader();
    return;
  }

  // ── Renderer ──
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  // Set DPR: balanced 1.25 on mobile to avoid shader bottlenecks, high-res on desktop
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobileDevice ? 1.25 : 2.0));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.20;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // WebGL context loss handling for phone app switching
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('WebGL context lost on device. Pausing frame.');
    stop();
  }, false);

  canvas.addEventListener('webglcontextrestored', () => {
    console.log('WebGL context restored. Re-initialising scene.');
    initEarth();
  }, false);

  const scene = new THREE.Scene();
  // Cinematic 30° field of view (ISS telephoto orbital perspective — minimizes distortion)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
  camera.position.set(0, 0, 4.15);

  // ── Globe group ──
  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  // Sun direction: Edolus-inspired dramatic oblique grazing sunlight
  const sunDir = new THREE.Vector3(0.68, 0.30, 0.65).normalize();

  let baseGlobeScale = 1.05;
  let targetPosX = 0.68;
  let targetPosY = -0.18;

  function sizeToContainer() {
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const aspect = w / h;
    const vFovRad = (camera.fov * Math.PI) / 180;
    const halfHeight = Math.tan(vFovRad / 2) * 4.15;
    const halfWidth = halfHeight * aspect;

    if (w >= 900) {
      // Desktop: Edolus cinematic framing — planet on right, clear of top navbar
      baseGlobeScale = 1.05;
      targetPosX = Math.max(0.66, halfWidth * 0.44);
      targetPosY = -halfHeight * 0.18;
      globeGroup.position.x = targetPosX;
      globeGroup.position.y = targetPosY;
      sunDir.set(0.68, 0.30, 0.65).normalize();
    } else {
      // Mobile / Tablet: Framed prominently in the lower-middle viewport
      const isTiny = w < 480;
      const targetRadius = Math.min(halfWidth * 0.92, halfHeight * (isTiny ? 0.46 : 0.42));
      baseGlobeScale = Math.max(0.50, targetRadius / 1.02);
      targetPosX = 0.0;
      targetPosY = -halfHeight * (isTiny ? 0.24 : 0.20);
      globeGroup.position.x = targetPosX;
      globeGroup.position.y = targetPosY;
      sunDir.set(0.35, 0.40, 0.85).normalize();
    }
  }

  // ── Telemetry Progress HUD Controller ──
  const loaderBar = document.getElementById('hero-loader-bar');
  const loaderPct = document.getElementById('hero-loader-pct');
  const loaderStatus = document.getElementById('hero-loader-status');

  const isReturningVisitor = (function() {
    try {
      return sessionStorage.getItem('nexora_preloader_seen') === 'true' ||
        document.documentElement.classList.contains('preload-bypassed');
    } catch (e) {
      return false;
    }
  })();

  let curDisplayPct = isReturningVisitor ? 100 : 0;
  let targetProgressPct = isReturningVisitor ? 100 : 16;
  let progressRaf = null;

  function updateProgressDisplay() {
    if (isReturningVisitor) {
      if (loaderBar) loaderBar.style.width = '100%';
      if (loaderPct) loaderPct.textContent = '100%';
      return;
    }
    curDisplayPct += (targetProgressPct - curDisplayPct) * 0.18;
    if (loaderBar) loaderBar.style.width = `${curDisplayPct.toFixed(1)}%`;
    if (loaderPct) loaderPct.textContent = `${Math.min(100, Math.round(curDisplayPct))}%`;
    if (curDisplayPct < targetProgressPct - 0.2 || targetProgressPct < 100) {
      progressRaf = requestAnimationFrame(updateProgressDisplay);
    } else {
      if (loaderBar) loaderBar.style.width = `${targetProgressPct}%`;
      if (loaderPct) loaderPct.textContent = `${targetProgressPct}%`;
    }
  }
  updateProgressDisplay();

  function setProgress(pct, statusText) {
    if (isReturningVisitor) return;
    targetProgressPct = Math.max(targetProgressPct, pct);
    if (statusText && loaderStatus) {
      loaderStatus.textContent = statusText;
    }
  }

  // ── Hardware Capability Check & True 10K Texture Selection ──
  const gl = renderer.getContext();
  const maxTexSize = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096;
  // Unconditionally prioritize authentic 10K (10240x5120) NASA textures on desktop hardware!
  // Fall back to 8K or 2K only on low-memory mobile phones or severely constrained WebGL contexts.
  const canUse10K = !isMobileDevice && maxTexSize >= 8192;
  const canUse8K = !isMobileDevice && maxTexSize >= 4096;
  const activeRes = canUse10K ? '10K' : (canUse8K ? '8K' : '2K');

  const textures10K = {
    day: 'images/textures/earth_atmos_10240.jpg',
    normal: 'images/textures/earth_normal_10240.jpg',
    spec: 'images/textures/earth_specular_10240.jpg',
    night: 'images/textures/earth_night_10240.jpg',
    clouds: 'images/textures/earth_clouds_10240.jpg',
  };

  const textures8K = {
    day: 'images/textures/earth_atmos_8192.jpg',
    normal: 'images/textures/earth_normal_8192.jpg',
    spec: 'images/textures/earth_specular_8192.jpg',
    night: 'images/textures/earth_night_8192.jpg',
    clouds: 'images/textures/earth_clouds_8192.jpg',
  };

  const textures2K = {
    day: 'images/textures/earth_atmos_2048.jpg',
    normal: 'images/textures/earth_normal_2048.jpg',
    spec: 'images/textures/earth_specular_2048.jpg',
    night: 'images/textures/earth_lights_2048.jpg',
    clouds: 'images/textures/earth_clouds_2048.jpg',
  };

  // Select target textures upfront so the scene is NEVER rendered in low-res before shifting!
  const targetTextures = canUse10K ? textures10K : (canUse8K ? textures8K : textures2K);

  const telemetryPhases = [
    `STREAMING ${activeRes} SURFACE ALBEDO MAP...`,
    `CALIBRATING ${activeRes} TOPOGRAPHIC RELIEF...`,
    `SYNCHRONIZING ${activeRes} OCEAN SPECULARITY...`,
    `RESOLVING ${activeRes} CITY ILLUMINATION MESH...`,
    `INTEGRATING ${activeRes} TROPOSPHERIC CLOUDS...`
  ];

  const loadingManager = new THREE.LoadingManager();
  loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
    const pct = Math.min(Math.round((itemsLoaded / itemsTotal) * 94), 94);
    const msg = telemetryPhases[Math.min(itemsLoaded - 1, telemetryPhases.length - 1)];
    setProgress(pct, msg);
  };

  const texLoader = new THREE.TextureLoader(loadingManager);

  setProgress(20, `SYNCHRONIZING ${activeRes} ORBITAL SATELLITE ASSETS...`);

  // Resilient procedural canvas texture generator to guarantee 100% crash-free rendering
  function createSolidTexture(r, g, b, a = 1) {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    const ctx = c.getContext('2d');
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    ctx.fillRect(0, 0, 4, 4);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function loadTextureSafe(url, fallbackUrl, fallbackTex) {
    return new Promise((resolve) => {
      texLoader.load(
        url,
        (tex) => resolve(tex),
        undefined,
        (err) => {
          console.warn(`Could not load primary texture from ${url}, attempting fallback ${fallbackUrl}`, err);
          if (fallbackUrl && fallbackUrl !== url) {
            texLoader.load(
              fallbackUrl,
              (fbTex) => resolve(fbTex),
              undefined,
              () => resolve(fallbackTex)
            );
          } else {
            resolve(fallbackTex);
          }
        }
      );
    });
  }

  // Load the target ultra-high-resolution textures directly during the preloader phase!
  // This guarantees ZERO visual pop or low-res shift when the preloader opens.
  const [dayMap, normalMap, specMap, nightMap, cloudMap] = await Promise.all([
    loadTextureSafe(targetTextures.day, textures2K.day, createSolidTexture(18, 55, 120)),
    loadTextureSafe(targetTextures.normal, textures2K.normal, createSolidTexture(128, 128, 255)),
    loadTextureSafe(targetTextures.spec, textures2K.spec, createSolidTexture(255, 255, 255)),
    loadTextureSafe(targetTextures.night, textures2K.night, createSolidTexture(0, 0, 0)),
    loadTextureSafe(targetTextures.clouds, textures2K.clouds, createSolidTexture(255, 255, 255, 0.4)),
  ]);

  // Configure high-fidelity anisotropic filtering and mipmaps
  const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
  [dayMap, nightMap, cloudMap].forEach((t) => {
    if (t) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
    }
  });
  [normalMap, specMap].forEach((t) => {
    if (t) {
      t.colorSpace = THREE.NoColorSpace;
      t.anisotropy = maxAniso;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
    }
  });

  // Signal complete calibration to progress HUD
  setProgress(100, `NEXORA ${activeRes} ORBITAL TELEMETRY SYNCHRONIZED`);

  // ── Star field spanning the entire cosmic hero canvas ──
  const starCount = isMobileDevice ? 1600 : (isSmallScreen ? 2800 : 6000);
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  const starColors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 50 + Math.random() * 300;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = r * Math.cos(phi);

    // Realistic stellar spectrum: cool blue-white giants, neutral white, and warm amber stars
    const starType = Math.random();
    if (starType > 0.88) {
      starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 0.82; starColors[i * 3 + 2] = 0.62; // Warm K/M
    } else if (starType > 0.68) {
      starColors[i * 3] = 0.76; starColors[i * 3 + 1] = 0.89; starColors[i * 3 + 2] = 1.0; // Cool O/B
    } else {
      starColors[i * 3] = 0.94; starColors[i * 3 + 1] = 0.96; starColors[i * 3 + 2] = 1.0; // Crisp White
    }
    starSizes[i] = 0.35 + Math.random() * 1.65;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(starColors, 3));

  const starMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: `
      attribute float aSize;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vBrightness;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        float twinkle = sin(uTime * 1.6 + position.x * 0.45 + position.y * 0.65) * 0.5 + 0.5;
        vBrightness = 0.35 + twinkle * 0.65;
        gl_PointSize = aSize * uPixelRatio * (78.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying float vBrightness;
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.0, d) * vBrightness;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMaterial);
  scene.add(stars);

  // ── 1. PHOTOREALISTIC 10K BLUE MARBLE EARTH SURFACE ──
  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      dayTexture:      { value: dayMap },
      normalTexture:   { value: normalMap },
      specularTexture: { value: specMap },
      nightTexture:    { value: nightMap },
      cloudTexture:    { value: cloudMap },
      sunDirection:    { value: sunDir },
      uCloudRotation:  { value: 0.0 },
      uTime:           { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec2 vCloudUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec3 vTangentW;
      varying vec3 vBitangentW;
      uniform float uCloudRotation;

      void main() {
        vUv = uv;
        // Synchronize cloud shadow coordinates with drifting cloud layer
        vCloudUv = vec2(fract(uv.x + uCloudRotation / 6.283185307), uv.y);

        vec3 n = normalize(normal);
        // Tangent frame on unit sphere for normal mapping
        vec3 t = normalize(vec3(-sin(uv.x * 6.283185307), 0.0, cos(uv.x * 6.283185307)));
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
      varying vec2 vCloudUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec3 vTangentW;
      varying vec3 vBitangentW;

      void main() {
        // ── 1. Geometric Normal and Tangent-space Normal Relief ──
        vec3 geoN = normalize(vNormalW);
        mat3 tbn  = mat3(normalize(vTangentW), normalize(vBitangentW), geoN);
        vec3 nMap = texture2D(normalTexture, vUv).rgb * 2.0 - 1.0;
        nMap.xy  *= 0.65; // Tangible, crisp 10K topographic mountain relief
        vec3 N    = normalize(tbn * nMap);

        vec3 L = normalize(sunDirection);
        vec3 V = normalize(cameraPosition - vPosW);
        vec3 H = normalize(L + V);

        // ── 2. NASA Blue Marble Day & Water Specular Maps ──
        vec3 dayTex     = texture2D(dayTexture, vUv).rgb;
        float waterMask = texture2D(specularTexture, vUv).r;

        // ── 3. Photorealistic Ocean Light Scattering & Bathymetry ──
        // Coastal shelves and shallow lagoons (Bahamas, Great Barrier Reef) scatter turquoise
        float oceanLuma = clamp(dot(dayTex, vec3(0.299, 0.587, 0.114)) * 3.6, 0.0, 1.0);
        vec3 deepOcean   = vec3(0.010, 0.045, 0.160);
        vec3 midOcean    = vec3(0.024, 0.125, 0.320);
        vec3 shallowSea  = vec3(0.065, 0.360, 0.540);
        vec3 reefSea     = vec3(0.120, 0.520, 0.680);
        vec3 oceanColor  = mix(deepOcean, midOcean, oceanLuma);
        oceanColor       = mix(oceanColor, shallowSea, pow(oceanLuma, 2.0));
        oceanColor       = mix(oceanColor, reefSea, pow(oceanLuma, 3.8));

        // Land: Natural NASA photography with rich vegetation & desert ochre
        vec3 landColor = pow(dayTex, vec3(0.94)) * 1.18;
        vec3 albedo = mix(landColor, oceanColor, smoothstep(0.04, 0.75, waterMask));

        // ── 4. Synchronized Soft Cloud Shadows on Earth's Surface ──
        vec2 cloudShadowUv = vCloudUv - vec2(L.x, L.y) * 0.0032;
        float shadowDensity = texture2D(cloudTexture, cloudShadowUv).r;
        float cloudShadow = 1.0 - smoothstep(0.16, 0.78, shadowDensity) * 0.48;
        albedo *= mix(1.0, cloudShadow, clamp(dot(geoN, L) * 2.4, 0.0, 1.0));

        // ── 5. Daylight Illumination & Terminator Sunset Gradient ──
        float NdotL = dot(N, L);
        float geoNdotL = dot(geoN, L);
        float diffuse = clamp(NdotL, 0.0, 1.0);
        float twilightWrap = smoothstep(-0.14, 0.16, NdotL);
        diffuse = mix(0.0, diffuse, twilightWrap);

        // Sunlight color shifts to warm golden-amber at the terminator (Rayleigh extinction)
        vec3 sunColor = mix(vec3(1.0, 0.62, 0.36), vec3(1.0, 0.99, 0.97), smoothstep(0.01, 0.28, geoNdotL));

        // Space ambient earthshine
        float ambient = 0.04;
        vec3 surfaceLight = diffuse * sunColor * 0.96 + vec3(ambient);

        // Day/night blend factors
        float dayMix   = smoothstep(-0.04, 0.18, geoNdotL);
        float nightMix = 1.0 - smoothstep(-0.24, -0.01, geoNdotL);

        // ── 6. 10K Night City Lights (Black Marble) ──
        vec3 nightTex   = texture2D(nightTexture, vUv).rgb;
        vec3 cityLights = nightTex * vec3(1.85, 1.45, 0.88) * 1.75 * nightMix * (1.0 - waterMask * 0.92);

        // Surface base color
        vec3 surfaceColor = albedo * surfaceLight * dayMix + cityLights;

        // ── 7. Physical Ocean Sunglint (Dual-Lobe Fresnel Microfacet) ──
        float NdotH     = max(dot(N, H), 0.0);
        float specCore  = pow(NdotH, 128.0) * 3.2; // Brilliant solar core reflection
        float specBroad = pow(NdotH, 18.0) * 0.65;  // Broad ocean wave dispersion sheen
        float spec      = (specCore + specBroad) * waterMask * dayMix;
        float NdotV     = max(dot(N, V), 0.0);
        float fresnel   = 0.03 + 0.97 * pow(1.0 - NdotV, 5.0);
        vec3 sunGlint   = sunColor * spec * fresnel * 0.95;
        surfaceColor   += sunGlint;

        // ── 8. Inner Rayleigh Atmospheric Extinction & Limb Veil ──
        float geoNdotV    = max(dot(geoN, V), 0.0);
        float limbFresnel = pow(1.0 - geoNdotV, 3.2);
        float sunFacing   = smoothstep(-0.12, 0.44, geoNdotL);
        vec3 atmoDayHaze  = mix(vec3(0.09, 0.42, 0.96), vec3(0.38, 0.78, 1.0), sunFacing);
        vec3 atmoTwilight = vec3(1.0, 0.48, 0.20);
        float twilightBelt = smoothstep(-0.16, 0.04, geoNdotL) * (1.0 - smoothstep(0.02, 0.24, geoNdotL));
        vec3 limbColor    = mix(atmoDayHaze, atmoTwilight, twilightBelt * 0.75);
        surfaceColor     += limbColor * limbFresnel * (0.20 + 0.80 * sunFacing) * 1.25;

        gl_FragColor = vec4(surfaceColor, 1.0);
      }
    `,
  });

  // 384 subdivisions on desktop for perfectly smooth curvature with zero polygon faceting
  const sphereSegs = isMobileDevice ? 128 : 384;
  const earthGeo = new THREE.SphereGeometry(1.0, sphereSegs, sphereSegs);
  const globe = new THREE.Mesh(earthGeo, earthMaterial);
  globeGroup.add(globe);

  // ── 2. REALISTIC CLOUD LAYER (VOLUMETRIC SELF-SHADOWING + MIE GLORY) ──
  const cloudMaterial = new THREE.ShaderMaterial({
    uniforms: {
      cloudTexture: { value: cloudMap },
      sunDirection: { value: sunDir },
      uTime:        { value: 0.0 },
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
      uniform float uTime;

      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;

      // Ultra-fast hash & 2-octave simplex/fBm for sub-pixel cloud wisps
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float cloudMicroDetail(vec2 p) {
        return vnoise(p) * 0.65 + vnoise(p * 2.05) * 0.35;
      }

      void main() {
        vec3 N = normalize(vNormalW);
        vec3 L = normalize(sunDirection);
        vec3 V = normalize(cameraPosition - vPosW);

        // Base 10K cloud density sample
        float rawDensity = texture2D(cloudTexture, vUv).r;

        // Sub-pixel procedural micro-fractal modulation (crisp cirrus filaments)
        float micro = cloudMicroDetail(vUv * 560.0 + vec2(uTime * 0.0018, 0.0));
        float cloudDensity = rawDensity * (0.86 + micro * 0.28);

        // Volumetric optical thickness (Beer-Lambert law)
        float alpha = 1.0 - exp(-cloudDensity * 3.8);
        alpha = smoothstep(0.03, 0.94, alpha) * 0.96;

        // Volumetric Cloud Self-Shadowing (sample sunward density)
        vec2 sunOffset = normalize(vec2(L.x, L.y + 0.0001)) * 0.0018;
        float densitySunward = texture2D(cloudTexture, vUv + sunOffset).r;
        float selfShadow = clamp(1.0 - max(densitySunward - rawDensity, 0.0) * 3.6, 0.42, 1.0);

        // Solar Illumination & Twilight Scattering
        float NdotL = dot(N, L);
        float sunLit = smoothstep(-0.06, 0.22, NdotL);
        float cloudDiffuse = clamp(NdotL, 0.0, 1.0) * 0.88 + 0.12;
        cloudDiffuse *= selfShadow;

        // Direct sunlight pure white
        vec3 sunWhite = vec3(0.99, 1.0, 1.0);

        // Terminator golden/amber sunset clouds
        float twilightZone = smoothstep(-0.08, 0.08, NdotL) * (1.0 - smoothstep(0.02, 0.26, NdotL));
        vec3 twilightSun = vec3(1.0, 0.62, 0.32) * 1.45;
        vec3 cloudSunColor = mix(sunWhite, twilightSun, twilightZone * 0.85);
        vec3 cloudColor = cloudSunColor * cloudDiffuse;

        // Mie Forward Scattering ("Silver Lining")
        float cosTheta = dot(-V, L);
        float g = 0.55;
        float miePhase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5) * 0.18;
        float edgePeak = pow(1.0 - max(dot(N, V), 0.0), 2.4);
        vec3 silverLining = vec3(1.0, 1.0, 1.0) * miePhase * edgePeak * sunLit * 2.5;
        cloudColor += silverLining;

        // Atmospheric Blue Rim on Clouds near horizon
        float atmoRim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 blueRim = vec3(0.15, 0.52, 0.98) * atmoRim * (sunLit * 0.42 + 0.08);
        cloudColor += blueRim;

        // Night side earthshine
        float finalAlpha = alpha * mix(0.12, 1.0, sunLit);
        vec3 nightTint = vec3(0.015, 0.04, 0.09) * (1.0 - sunLit);
        cloudColor += nightTint;

        gl_FragColor = vec4(cloudColor, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.008, sphereSegs, sphereSegs), cloudMaterial);
  globeGroup.add(clouds);

  // ── 3. OUTER ATMOSPHERE (RAYLEIGH SKY + STRATOSPHERIC OZONE + AIRGLOW) ──
  const outerAtmoMaterial = new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: sunDir },
      uArrival: { value: prefersReducedMotion ? 1.0 : 0.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vNormal      = normalize(normalMatrix * normal);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vWorldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      uniform float uArrival;
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      void main() {
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(sunDirection);
        vec3 WN = normalize(vWorldNormal);

        // Limb tangent optical depth
        float rim = 1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);
        float intensity = pow(rim, 3.2);

        // Sun-facing hemisphere factor
        float sunFacing = dot(WN, L);
        float dayLit = smoothstep(-0.18, 0.40, sunFacing);

        // Rayleigh blue daylight scattering
        vec3 atmoDay = mix(vec3(0.10, 0.42, 0.98), vec3(0.42, 0.82, 1.0), dayLit);

        // Stratospheric ozone absorption band (delicate royal-violet tint)
        vec3 ozoneViolet = vec3(0.22, 0.26, 0.86);
        atmoDay = mix(atmoDay, ozoneViolet, pow(rim, 5.0) * 0.38);

        // Sunset/sunrise twilight arch along the terminator horizon
        float terminatorBelt = smoothstep(-0.24, 0.03, sunFacing) * (1.0 - smoothstep(0.01, 0.28, sunFacing));
        vec3 twilightArch = vec3(1.0, 0.46, 0.16);
        vec3 atmoColor = mix(atmoDay, twilightArch, terminatorBelt * 0.82);

        // Night-side thermospheric airglow luminescence (subtle green-cyan line at ~90km)
        float nightSide = 1.0 - smoothstep(-0.26, 0.04, sunFacing);
        vec3 airglowColor = vec3(0.06, 0.78, 0.48);
        atmoColor = mix(atmoColor, airglowColor, nightSide * pow(rim, 4.2) * 0.42);

        // Forward Mie scattering towards camera
        float cosTheta = max(dot(-V, L), 0.0);
        float forwardGlow = pow(cosTheta, 4.0) * dayLit * 0.50;

        float alpha = (intensity * (0.26 + dayLit * 0.74) + forwardGlow) * uArrival;
        gl_FragColor = vec4(atmoColor, alpha);
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  const atmoSegs = isMobileDevice ? 96 : 192;
  const outerAtmo = new THREE.Mesh(new THREE.SphereGeometry(1.026, atmoSegs, atmoSegs), outerAtmoMaterial);
  globeGroup.add(outerAtmo);

  // ── 4. CINEMATIC SOLAR CORONA / LIMB GLOW (EDOLUS AESTHETIC) ──
  const flareGeo = new THREE.PlaneGeometry(1.6, 1.6);
  const flareMat = new THREE.ShaderMaterial({
    uniforms: {
      uArrival: { value: prefersReducedMotion ? 1.0 : 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uArrival;
      varying vec2 vUv;
      void main() {
        float dist = length(vUv - vec2(0.5));
        if (dist > 0.5) discard;
        float glowCore = pow(max(1.0 - dist * 2.0, 0.0), 3.5);
        float glowSpread = pow(max(1.0 - dist * 2.0, 0.0), 1.6) * 0.45;
        vec3 flareColor = mix(vec3(0.4, 0.78, 1.0), vec3(1.0, 0.95, 0.85), glowCore);
        gl_FragColor = vec4(flareColor, (glowCore + glowSpread) * 0.55 * uArrival);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const solarGlint = new THREE.Mesh(flareGeo, flareMat);
  solarGlint.position.copy(sunDir).multiplyScalar(1.025);
  solarGlint.lookAt(camera.position);
  globeGroup.add(solarGlint);

  // Initial orientation — Edolus low-orbital perspective:
  // ~23.4° physical axial tilt with sunlight illuminating the Americas / Atlantic
  globeGroup.rotation.x = 0.26;
  globeGroup.rotation.y = 0.42;

  sizeToContainer();

  // ── Dynamic Orbital Arrival State ──
  let isArrived = false;
  let arrivalTimer = 0;
  const arrivalDuration = 2.8;

  function triggerArrival() {
    isArrived = true;
    arrivalTimer = 0;
    try {
      sessionStorage.setItem('nexora_preloader_seen', 'true');
    } catch (e) {}
    document.documentElement.classList.add('preload-bypassed');

    const heroLoader = document.getElementById('hero-loader');
    if (heroLoader) {
      heroLoader.classList.add('hidden');
    }
    const visual = document.getElementById('earth-visual');
    if (visual) {
      visual.classList.add('arrived');
    }
    canvas.classList.add('ready');
    fallbackImg.classList.remove('visible');

    if (typeof window.triggerHeroCopyArrival === 'function') {
      window.triggerHeroCopyArrival();
    }
  }

  // If returning visitor or already bypassed, trigger immediately
  if (isReturningVisitor) {
    triggerArrival();
  } else {
    // Gracefully transition from 100% telemetry to arrival
    setTimeout(() => {
      triggerArrival();
    }, 340);
  }

  // Safety fallback: ensure arrival always triggers within 1.8s on mobile, 2.4s on desktop
  setTimeout(() => {
    if (!isArrived) triggerArrival();
  }, isMobileDevice ? 1800 : 2400);

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

  // ── Extended Pinned Video-Scrub Hero State ──
  const scrollTrack = document.getElementById('hero-scroll-track');
  const stage0 = document.getElementById('hero-stage-0');
  const stage1 = document.getElementById('hero-stage-1');
  const stage2 = document.getElementById('hero-stage-2');
  const stage3 = document.getElementById('hero-stage-3');
  const bar1 = document.getElementById('hud-bar-1');
  const bar2 = document.getElementById('hud-bar-2');
  const bar3 = document.getElementById('hud-bar-3');
  const phaseText = document.getElementById('hud-phase-text');
  const scrollHint = document.querySelector('.hero-scroll-hint');

  let heroScrollProgress = 0.0;
  let targetHeroScrollProgress = 0.0;
  let globeSpinAngle = 0.32;

  // ── Mobile 4-Stage Step Snapping Engine ──
  const STAGE_SP_POINTS = [0.00, 0.25, 0.54, 0.85];
  let currentStageIndex = 0;
  let isStageTransitioning = false;
  let stageTransitionTimer = null;

  function updateMobileStageUI(idx) {
    document.querySelectorAll('.m-stage-dot').forEach((dot) => {
      const s = parseInt(dot.getAttribute('data-stage'), 10);
      dot.classList.toggle('active', s === idx);
    });
    const prevBtn = document.getElementById('mobile-stage-prev');
    const nextBtn = document.getElementById('mobile-stage-next');
    if (prevBtn) prevBtn.disabled = (idx === 0);
    if (nextBtn) nextBtn.disabled = (idx === 3);
  }

  function setMobileStage(idx, smooth = true) {
    idx = Math.max(0, Math.min(3, idx));
    currentStageIndex = idx;
    const targetSp = STAGE_SP_POINTS[idx];
    targetHeroScrollProgress = targetSp;
    updateMobileStageUI(idx);

    if (scrollTrack) {
      const maxScroll = scrollTrack.offsetHeight - window.innerHeight;
      if (maxScroll > 0) {
        const targetScrollY = Math.round(maxScroll * targetSp);
        if (Math.abs(window.scrollY - targetScrollY) > 30) {
          window.scrollTo({
            top: targetScrollY,
            behavior: smooth ? 'smooth' : 'auto'
          });
        }
      }
    }
  }

  // Connect mobile dots & arrows
  document.querySelectorAll('.m-stage-dot').forEach((dot) => {
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      const s = parseInt(dot.getAttribute('data-stage'), 10);
      setMobileStage(s);
    });
  });

  const mPrevBtn = document.getElementById('mobile-stage-prev');
  if (mPrevBtn) {
    mPrevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (currentStageIndex > 0) setMobileStage(currentStageIndex - 1);
    });
  }

  const mNextBtn = document.getElementById('mobile-stage-next');
  if (mNextBtn) {
    mNextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (currentStageIndex < 3) setMobileStage(currentStageIndex + 1);
      else {
        const aboutEl = document.getElementById('about');
        if (aboutEl) aboutEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // ── Touch swipe navigation on mobile inside the hero ──
  let touchStartY = 0;
  let touchStartX = 0;
  let touchStartTime = 0;

  window.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      touchStartTime = Date.now();
    }
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (!isMobileDevice || isStageTransitioning || !scrollTrack) return;
    if (!e.changedTouches || e.changedTouches.length === 0) return;

    const rect = scrollTrack.getBoundingClientRect();
    const maxScroll = scrollTrack.offsetHeight - window.innerHeight;
    const isInHero = rect.top <= 20 && rect.bottom >= window.innerHeight - 20;
    if (!isInHero) return;

    const touchEndY = e.changedTouches[0].clientY;
    const touchEndX = e.changedTouches[0].clientX;
    const deltaY = touchStartY - touchEndY; // positive = swiping up (scrolling down)
    const deltaX = touchStartX - touchEndX;

    // Minimum swipe threshold & primarily vertical
    if (Math.abs(deltaY) > 35 && Math.abs(deltaY) > Math.abs(deltaX) * 1.15) {
      if (deltaY > 0) {
        // Swipe Up -> Advance 1 stage
        if (currentStageIndex < 3) {
          isStageTransitioning = true;
          setMobileStage(currentStageIndex + 1);
          clearTimeout(stageTransitionTimer);
          stageTransitionTimer = setTimeout(() => { isStageTransitioning = false; }, 420);
        } else {
          // At final stage 3: smooth scroll down into next section
          const aboutEl = document.getElementById('about');
          if (aboutEl) aboutEl.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        // Swipe Down -> Step back 1 stage
        if (currentStageIndex > 0) {
          isStageTransitioning = true;
          setMobileStage(currentStageIndex - 1);
          clearTimeout(stageTransitionTimer);
          stageTransitionTimer = setTimeout(() => { isStageTransitioning = false; }, 420);
        }
      }
    }
  }, { passive: true });

  function updateHeroScroll() {
    if (!scrollTrack) return;
    const rect = scrollTrack.getBoundingClientRect();
    const maxScroll = scrollTrack.offsetHeight - window.innerHeight;
    if (maxScroll <= 0) {
      targetHeroScrollProgress = 0;
      return;
    }
    const rawP = -rect.top / maxScroll;
    const spClamped = Math.max(0, Math.min(1, rawP));

    if (isMobileDevice) {
      if (!isStageTransitioning) {
        // Synchronize stage indicator from external scroll
        if (spClamped < 0.12) currentStageIndex = 0;
        else if (spClamped < 0.38) currentStageIndex = 1;
        else if (spClamped < 0.68) currentStageIndex = 2;
        else currentStageIndex = 3;
        updateMobileStageUI(currentStageIndex);
        targetHeroScrollProgress = spClamped;
      }
    } else {
      targetHeroScrollProgress = spClamped;
    }
  }
  window.__updateHeroScroll = updateHeroScroll;
  window.addEventListener('scroll', updateHeroScroll, { passive: true });
  updateHeroScroll();

  // ── Only render while visible ──
  let running = false;
  let rafId = null;
  const clock = new THREE.Clock();

  function hermite(t) {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  }
  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function frame() {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.elapsedTime;

    // Damped smooth progress interpolation (cinematic video-scrubbing feel)
    heroScrollProgress += (targetHeroScrollProgress - heroScrollProgress) * 0.085;
    const sp = heroScrollProgress;

    // Viewport metrics for dynamic camera framing
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    const isDesktop = w >= 900;
    const aspect = w / h;
    const vFovRad = (camera.fov * Math.PI) / 180;
    const halfHeight = Math.tan(vFovRad / 2) * 4.15;
    const halfWidth = halfHeight * aspect;

    // ── Keyframe 0: Initial Hero View (Edolus Low Orbital Angle) ──
    const k0 = {
      x: isDesktop ? Math.max(0.66, halfWidth * 0.44) : 0.0,
      y: isDesktop ? -halfHeight * 0.18 : -halfHeight * (w < 480 ? 0.24 : 0.20),
      scale: baseGlobeScale,
      camZ: 4.15,
      rotY: 0.0,
      rotX: 0.26,
      sun: new THREE.Vector3(0.68, 0.30, 0.65).normalize()
    };

    // ── Keyframe 1: Low Orbital Horizon Arc (Edolus Signature Curvature Sweep) ──
    const k1 = {
      x: isDesktop ? halfWidth * 0.08 : 0.0,
      y: isDesktop ? -halfHeight * 0.86 : -halfHeight * 0.78,
      scale: baseGlobeScale * (isDesktop ? 2.95 : 2.25),
      camZ: 3.55,
      rotY: 0.92,
      rotX: 0.05,
      sun: new THREE.Vector3(0.40, 0.88, 0.38).normalize()
    };

    // ── Keyframe 2: Planetary Night Network (10K Black Marble City Constellations) ──
    const k2 = {
      x: isDesktop ? -Math.max(0.70, halfWidth * 0.44) : 0.0,
      y: isDesktop ? -halfHeight * 0.08 : halfHeight * 0.28,
      scale: baseGlobeScale * (isDesktop ? 1.25 : 0.94),
      camZ: 4.05,
      rotY: 2.28,
      rotX: 0.18,
      sun: new THREE.Vector3(-0.78, 0.20, 0.58).normalize()
    };

    // ── Keyframe 3: Full Planetary Overview (Cosmic Orbital Symmetry) ──
    const k3 = {
      x: isDesktop ? Math.max(0.70, halfWidth * 0.44) : 0.0,
      y: isDesktop ? -halfHeight * 0.10 : -halfHeight * 0.26,
      scale: baseGlobeScale * (isDesktop ? 1.20 : 0.92),
      camZ: 4.15,
      rotY: 3.45,
      rotX: 0.22,
      sun: new THREE.Vector3(0.68, 0.32, 0.65).normalize()
    };

    // Smooth transition factors between the 4 states
    const t1 = hermite(clamp01((sp - 0.04) / 0.26));
    const t2 = hermite(clamp01((sp - 0.36) / 0.28));
    const t3 = hermite(clamp01((sp - 0.68) / 0.26));

    let targetX = k0.x + (k1.x - k0.x) * t1;
    let targetY = k0.y + (k1.y - k0.y) * t1;
    let targetScale = k0.scale + (k1.scale - k0.scale) * t1;
    let targetCamZ = k0.camZ + (k1.camZ - k0.camZ) * t1;
    let targetRotY = k0.rotY + (k1.rotY - k0.rotY) * t1;
    let targetRotX = k0.rotX + (k1.rotX - k0.rotX) * t1;
    let targetSun = new THREE.Vector3().lerpVectors(k0.sun, k1.sun, t1);

    if (t2 > 0) {
      targetX += (k2.x - targetX) * t2;
      targetY += (k2.y - targetY) * t2;
      targetScale += (k2.scale - targetScale) * t2;
      targetCamZ += (k2.camZ - targetCamZ) * t2;
      targetRotY += (k2.rotY - targetRotY) * t2;
      targetRotX += (k2.rotX - targetRotX) * t2;
      targetSun.lerp(k2.sun, t2);
    }

    if (t3 > 0) {
      targetX += (k3.x - targetX) * t3;
      targetY += (k3.y - targetY) * t3;
      targetScale += (k3.scale - targetScale) * t3;
      targetCamZ += (k3.camZ - targetCamZ) * t3;
      targetRotY += (k3.rotY - targetRotY) * t3;
      targetRotX += (k3.rotX - targetRotX) * t3;
      targetSun.lerp(k3.sun, t3);
    }

    // ── Cinematic Orbital Arrival Sequence ──
    let arrivalEase = 1.0;
    if (!prefersReducedMotion) {
      if (isArrived && arrivalTimer < arrivalDuration && sp < 0.02) {
        arrivalTimer += dt;
        const progress = Math.min(arrivalTimer / arrivalDuration, 1.0);
        arrivalEase = 1.0 - Math.pow(1.0 - progress, 4);

        camera.position.z = 6.2 - 2.05 * arrivalEase;
        const scaleMult = 0.82 + 0.18 * arrivalEase;
        globeGroup.scale.setScalar(baseGlobeScale * scaleMult);

        if (isDesktop) {
          globeGroup.position.x = k0.x * (0.72 + 0.28 * arrivalEase);
          globeGroup.position.y = k0.y;
        } else {
          globeGroup.position.x = k0.x;
          globeGroup.position.y = k0.y * (0.80 + 0.20 * arrivalEase);
        }

        if (outerAtmoMaterial.uniforms.uArrival) {
          outerAtmoMaterial.uniforms.uArrival.value = arrivalEase;
        }
        if (flareMat && flareMat.uniforms.uArrival) {
          flareMat.uniforms.uArrival.value = arrivalEase;
        }
      } else if (!isArrived && sp < 0.02) {
        camera.position.z = 6.2;
        globeGroup.scale.setScalar(baseGlobeScale * 0.82);
        if (outerAtmoMaterial.uniforms.uArrival) {
          outerAtmoMaterial.uniforms.uArrival.value = 0.0;
        }
        if (flareMat && flareMat.uniforms.uArrival) {
          flareMat.uniforms.uArrival.value = 0.0;
        }
      } else {
        // Video scrub controls position, scale, and camera depth seamlessly
        camera.position.z = targetCamZ;
        globeGroup.scale.setScalar(targetScale);
        globeGroup.position.x = targetX;
        globeGroup.position.y = targetY;
        sunDir.copy(targetSun).normalize();
        if (outerAtmoMaterial.uniforms.uArrival) {
          outerAtmoMaterial.uniforms.uArrival.value = 1.0;
        }
        if (flareMat && flareMat.uniforms.uArrival) {
          flareMat.uniforms.uArrival.value = 1.0;
        }
      }
    } else {
      camera.position.z = targetCamZ;
      globeGroup.scale.setScalar(targetScale);
      globeGroup.position.x = targetX;
      globeGroup.position.y = targetY;
    }

    if (!prefersReducedMotion) {
      // Axial rotation with initial orbital momentum sweep + scrub perspective offset
      const rotBoost = isArrived && arrivalTimer < arrivalDuration && sp < 0.02 ? Math.pow(1.0 - arrivalEase, 2.2) * 0.08 : 0;
      globeSpinAngle += dt * (0.016 + rotBoost);
      globeGroup.rotation.y = globeSpinAngle + targetRotY;

      // Realistic cloud drift over the Earth's surface (differential trade winds)
      clouds.rotation.y += dt * (0.022 + rotBoost * 0.3);

      // Subtle, buttery mouse parallax
      pointer.x += (pointerTarget.x - pointer.x) * 0.035;
      pointer.y += (pointerTarget.y - pointer.y) * 0.035;
      globeGroup.rotation.x = targetRotX + pointer.y * 0.04;

      const camMaxX = isDesktop ? 0.12 : 0.03;
      const camMaxY = isDesktop ? 0.07 : 0.02;
      camera.position.x = pointer.x * camMaxX;
      camera.position.y = (isDesktop ? 0.03 : targetY) - pointer.y * camMaxY;
      camera.lookAt(0, isDesktop ? 0.03 : targetY, 0);

      // Star twinkle and drift
      starMaterial.uniforms.uTime.value = elapsed;
      stars.rotation.y = elapsed * 0.0012;
      stars.rotation.x = elapsed * 0.0006;
    }

    // Always keep shader uniforms synchronized every frame
    if (earthMaterial && earthMaterial.uniforms) {
      earthMaterial.uniforms.sunDirection.value.copy(sunDir);
      earthMaterial.uniforms.uCloudRotation.value = clouds.rotation.y - globeGroup.rotation.y;
      earthMaterial.uniforms.uTime.value = elapsed;
    }
    if (cloudMaterial && cloudMaterial.uniforms) {
      cloudMaterial.uniforms.sunDirection.value.copy(sunDir);
      cloudMaterial.uniforms.uTime.value = elapsed;
    }
    if (outerAtmoMaterial && outerAtmoMaterial.uniforms) {
      outerAtmoMaterial.uniforms.sunDirection.value.copy(sunDir);
    }
    if (solarGlint) {
      solarGlint.position.copy(sunDir).multiplyScalar(1.025);
      solarGlint.lookAt(camera.position);
    }

    // ── Update 3-Part Story Stages & Telemetry Flight Scrubber ──
    const s0_op = clamp01(1.0 - (sp - 0.03) / 0.14);
    if (stage0) {
      stage0.style.opacity = s0_op.toFixed(3);
      stage0.style.transform = `translateY(${(-28 * (1 - s0_op)).toFixed(1)}px)`;
      stage0.style.filter = isMobileDevice ? 'none' : `blur(${(8 * (1 - s0_op)).toFixed(1)}px)`;
      stage0.style.pointerEvents = s0_op > 0.05 ? 'auto' : 'none';
    }

    const s1_in = clamp01((sp - 0.14) / 0.12);
    const s1_out = clamp01(1.0 - (sp - 0.36) / 0.08);
    const s1_op = s1_in * s1_out;
    if (stage1) {
      stage1.style.opacity = s1_op.toFixed(3);
      stage1.style.transform = `translateY(${((1 - s1_op) * 22).toFixed(1)}px) scale(${(0.96 + 0.04 * s1_op).toFixed(3)})`;
      stage1.style.filter = isMobileDevice ? 'none' : `blur(${((1 - s1_op) * 8).toFixed(1)}px)`;
      stage1.style.pointerEvents = s1_op > 0.08 ? 'auto' : 'none';
      if (s1_op > 0.01) stage1.classList.add('stage-active');
      else stage1.classList.remove('stage-active');
    }

    const s2_in = clamp01((sp - 0.42) / 0.12);
    const s2_out = clamp01(1.0 - (sp - 0.66) / 0.08);
    const s2_op = s2_in * s2_out;
    if (stage2) {
      stage2.style.opacity = s2_op.toFixed(3);
      stage2.style.transform = `translateY(${((1 - s2_op) * 22).toFixed(1)}px) scale(${(0.96 + 0.04 * s2_op).toFixed(3)})`;
      stage2.style.filter = isMobileDevice ? 'none' : `blur(${((1 - s2_op) * 8).toFixed(1)}px)`;
      stage2.style.pointerEvents = s2_op > 0.08 ? 'auto' : 'none';
      if (s2_op > 0.01) stage2.classList.add('stage-active');
      else stage2.classList.remove('stage-active');
    }

    const s3_in = clamp01((sp - 0.70) / 0.12);
    const s3_out = clamp01(1.0 - (sp - 0.94) / 0.05);
    const s3_op = s3_in * s3_out;
    if (stage3) {
      stage3.style.opacity = s3_op.toFixed(3);
      stage3.style.transform = `translateY(${((1 - s3_op) * 22).toFixed(1)}px) scale(${(0.96 + 0.04 * s3_op).toFixed(3)})`;
      stage3.style.filter = isMobileDevice ? 'none' : `blur(${((1 - s3_op) * 8).toFixed(1)}px)`;
      stage3.style.pointerEvents = s3_op > 0.08 ? 'auto' : 'none';
      if (s3_op > 0.01) stage3.classList.add('stage-active');
      else stage3.classList.remove('stage-active');
    }

    if (bar1 && bar2 && bar3 && phaseText) {
      const b1 = clamp01(sp / 0.35);
      const b2 = clamp01((sp - 0.35) / 0.33);
      const b3 = clamp01((sp - 0.68) / 0.28);
      bar1.style.width = `${(b1 * 100).toFixed(0)}%`;
      bar2.style.width = `${(b2 * 100).toFixed(0)}%`;
      bar3.style.width = `${(b3 * 100).toFixed(0)}%`;

      if (sp < 0.16) {
        phaseText.textContent = 'ORBITAL VIEW · INITIAL';
      } else if (sp < 0.44) {
        phaseText.textContent = '01 // PLANETARY HORIZON';
      } else if (sp < 0.72) {
        phaseText.textContent = '02 // VELOCITY & SCALE';
      } else {
        phaseText.textContent = '03 // SPECIALIZED SUITES';
      }
    }

    if (scrollHint) {
      scrollHint.style.opacity = (1 - clamp01(sp / 0.08)).toFixed(2);
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

  // ── Browser Back/Forward & BFCache Restoration ──
  window.addEventListener('pageshow', () => {
    dismissLoader();
    document.body.classList.remove('page-transitioning');
    document.documentElement.classList.add('preload-bypassed');
    if (!prefersReducedMotion) {
      start();
    }
    if (window.__lenis) {
      window.__lenis.resize();
    }
    if (typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.refresh();
    }
  });

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'auto';
  }

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
  try {
    sessionStorage.setItem('nexora_preloader_seen', 'true');
  } catch (e) {}
  document.documentElement.classList.add('preload-bypassed');
  const heroLoader = document.getElementById('hero-loader');
  if (heroLoader) {
    heroLoader.classList.add('hidden');
  }
  const visual = document.getElementById('earth-visual');
  if (visual) {
    visual.classList.add('arrived');
  }
  const canvas = document.getElementById('earth-canvas');
  if (canvas) {
    canvas.classList.add('ready');
  }
  if (typeof window.triggerHeroCopyArrival === 'function') {
    window.triggerHeroCopyArrival();
  }
}

/* ─────────────────────────────────────────────────────
   2. LENIS LUXURY SMOOTH SCROLL + FLUID UI/UX TRANSITIONS
───────────────────────────────────────────────────── */
async function initScrollExperience() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  const progressBar = document.getElementById('scroll-progress-bar');
  function updateScrollProgress(y) {
    if (!progressBar) return;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const pct = maxScroll > 0 ? Math.min(100, Math.max(0, (y / maxScroll) * 100)) : 0;
    progressBar.style.width = `${pct.toFixed(1)}%`;
  }

  let lenis = null;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 900;

  // On touch / mobile screens, use native 120Hz/60Hz compositor momentum scrolling
  // Only smooth mouse wheels on desktop to avoid touch lag and stutter
  if (!prefersReducedMotion && !isTouchDevice) {
    try {
      const { default: Lenis } = await import('https://unpkg.com/lenis@1.3.26/dist/lenis.mjs');
      const isMobileViewport = window.matchMedia('(max-width: 680px)').matches;
      lenis = new Lenis({
        duration: isMobileViewport ? 0.78 : 1.05,
        easing: (t) => 1 - Math.pow(1 - t, 4),
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        syncTouch: false,
        wheelMultiplier: 0.95,
      });
      window.__lenis = lenis;

      lenis.on('scroll', (e) => {
        ScrollTrigger.update();
        updateScrollProgress(e.scroll || window.scrollY);
        if (typeof window.__updateHeroScroll === 'function') {
          window.__updateHeroScroll();
        }
      });
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } catch (e) {
      console.warn('Lenis desktop init fallback:', e);
    }
  }

  window.addEventListener('scroll', () => {
    updateScrollProgress(window.scrollY);
  }, { passive: true });

  if (window.scrollY > 0) {
    requestAnimationFrame(() => {
      if (lenis) lenis.resize();
      ScrollTrigger.refresh();
      updateScrollProgress(window.scrollY);
    });
  }

  // ── Fluid Anchor Scrolling (Glides smoothly without jarring jumps) ──
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          if (lenis) {
            lenis.scrollTo(targetEl, {
              offset: -70,
              duration: 1.3,
              easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            });
          } else {
            targetEl.scrollIntoView({ behavior: 'smooth' });
          }

          // Close mobile menu if open
          const mobileMenu = document.getElementById('mobile-menu');
          const hamburger = document.getElementById('hamburger');
          if (mobileMenu && mobileMenu.classList.contains('open')) {
            mobileMenu.classList.remove('open');
            if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
          }
        }
      }
    });
  });

  // ── Smooth Back-to-Top Integration ──
  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    backToTop.addEventListener('click', (e) => {
      e.preventDefault();
      if (lenis) {
        lenis.scrollTo(0, { duration: 1.4 });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }
}

/* ─────────────────────────────────────────────────────
   3. 3D CARD TURN & SPECULAR GLARE
───────────────────────────────────────────────────── */
function initCard3DTilt() {
  const cards = document.querySelectorAll('.portfolio-card, .bento-card, .service-detail-card, .whoweare-card');
  cards.forEach((card) => {
    if (!card.querySelector('.card-specular-glare')) {
      const glare = document.createElement('div');
      glare.className = 'card-specular-glare';
      card.appendChild(glare);
    }

    let rafId = null;
    card.addEventListener('pointermove', (e) => {
      if (prefersReducedMotion || e.pointerType === 'touch') return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const normX = (x - centerX) / centerX;
        const normY = (y - centerY) / centerY;
        const tiltX = -normY * 6.5;
        const tiltY = normX * 6.5;

        card.style.transform = `perspective(1000px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translateZ(8px) scale3d(1.015, 1.015, 1.015)`;
        card.style.setProperty('--mouse-x', `${x.toFixed(1)}px`);
        card.style.setProperty('--mouse-y', `${y.toFixed(1)}px`);
      });
    });

    card.addEventListener('pointerleave', () => {
      if (rafId) cancelAnimationFrame(rafId);
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0) scale3d(1, 1, 1)';
    });
  });
}

/* ─────────────────────────────────────────────────────
   4. 3D SECTION TURN & DEPTH REVEALS
───────────────────────────────────────────────────── */
function initSectionTurnReveals() {
  if (prefersReducedMotion) return;
  const targets = document.querySelectorAll('.whoweare-card, .bento-card, .service-detail-card, .portfolio-card, .pricing-card, .step-item');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  targets.forEach((el, index) => {
    el.classList.add('reveal-turn');
    el.style.transitionDelay = `${(index % 3) * 0.08}s`;
    observer.observe(el);
  });
}

/* ─────────────────────────────────────────────────────
   5. LAUNCHLUME-STYLE HERO TEXT LOADING & KINETIC ARRIVAL
───────────────────────────────────────────────────── */
let heroAnimated = false;
window.triggerHeroCopyArrival = () => {
  if (heroAnimated) return;
  heroAnimated = true;

  const label = document.querySelector('.earth-hero .hero-label');
  const hl1 = document.getElementById('hl1');
  const hl2 = document.getElementById('hl2');
  const rule = document.querySelector('.earth-hero .hero-rule');
  const sub = document.getElementById('hero-sub');
  const actions = document.querySelectorAll('.earth-hero-actions a');

  if (typeof gsap !== 'undefined') {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // 1. Badge label: LaunchLume tracking expansion + optic deblur (if present)
    if (label) {
      tl.fromTo(label,
        { opacity: 0, y: 14, letterSpacing: '0.45em', filter: 'blur(10px)' },
        { opacity: 1, y: 0, letterSpacing: '0.24em', filter: 'blur(0px)', duration: 0.95 },
        0
      );
    }

    // 2. Headline 3D perspective unroll
    if (hl1) {
      tl.fromTo(hl1,
        { opacity: 0, y: 38, rotationX: 20, filter: 'blur(12px)', transformPerspective: 900 },
        { opacity: 1, y: 0, rotationX: 0, filter: 'blur(0px)', duration: 1.1 },
        label ? 0.12 : 0
      );
    }

    if (hl2) {
      tl.fromTo(hl2,
        { opacity: 0, y: 42, rotationX: 20, filter: 'blur(12px)', transformPerspective: 900 },
        { opacity: 1, y: 0, rotationX: 0, filter: 'blur(0px)', duration: 1.1 },
        label ? 0.24 : 0.12
      );
    }

    // 3. Glowing cyan divider rule
    if (rule) {
      tl.fromTo(rule,
        { opacity: 0, scaleX: 0, filter: 'drop-shadow(0 0 0px #4d9aff)' },
        { opacity: 1, scaleX: 1, filter: 'drop-shadow(0 0 16px #4d9aff)', duration: 0.85 },
        label ? 0.38 : 0.24
      );
    }

    // 4. Subheadline glide
    if (sub) {
      tl.fromTo(sub,
        { opacity: 0, y: 22, filter: 'blur(8px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.85 },
        label ? 0.48 : 0.34
      );
    }

    // 5. Hero CTA buttons staggered spring arrival
    if (actions && actions.length) {
      tl.fromTo(actions,
        { opacity: 0, y: 20, scale: 0.94, filter: 'blur(6px)' },
        { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.8, stagger: 0.1 },
        label ? 0.60 : 0.44
      );
    }
  } else {
    // Zero-dependency CSS fallback
    document.querySelectorAll('[data-reveal-child]').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.filter = 'none';
    });
  }
};

/* ─────────────────────────────────────────────────────
   6. MOTION MICRO-INTERACTIONS
───────────────────────────────────────────────────── */
async function initMotion() {
  if (prefersReducedMotion) return;
  let animate, inView;
  try {
    ({ animate, inView } = await import('https://unpkg.com/motion@11/dist/es/index.mjs'));
  } catch (e) {
    return;
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
initCard3DTilt();
initSectionTurnReveals();
initMotion();
