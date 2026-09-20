// The sky: a painted night over painted hills, a painted moon with a figure under
// the banyan, and one paper lantern for every answer sent up.
import * as THREE from '../vendor/three.module.min.js';

const gsap = window.gsap;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const look = { x: 0, y: 0, tx: 0, ty: 0 };

const COMMON = `
  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
  float fbm(vec2 p){ float v=0.0, a=.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p*=2.03; a*=.5; } return v; }`;
const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

export function initSky(canvas, host) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 0, 10);
  const U = { uTime: { value: 0 }, uAspect: { value: 1 } };
  const loader = new THREE.TextureLoader();
  const tex = (url) => { const t = loader.load(url); t.anisotropy = 4; return t; };
  const ART = { sky: tex('img/art/sky.jpg'), moon: tex('img/art/moon.jpg'), lantern: tex('img/art/lantern.png') };

  // the painted sky, cover-fitted, with one thin band of mist drifting over the peaks
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { ...U, uTex: { value: ART.sky } }, depthWrite: false, vertexShader: VERT,
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uAspect; uniform sampler2D uTex; ${COMMON}
      void main(){
        vec2 uv = vUv; float ta = .5581;
        if (uAspect < ta) uv.x = (uv.x - .5) * (uAspect / ta) + .5; else uv.y = (uv.y - .5) * (ta / uAspect) + .5;
        vec3 col = texture2D(uTex, uv).rgb;
        float l = dot(col, vec3(.299, .587, .114));
        col = mix(col, vec3(l), .10) * vec3(.93, .97, 1.05);
        float n = fbm(vec2(uv.x*3.0 + uTime*.015, uv.y*9.0));
        float d = abs(uv.y - .30 - (n - .5)*.05);
        col = mix(col, vec3(.66, .76, .74), smoothstep(.035, .0, d)*.10);
        col += (hash(uv*vec2(913.0, 677.0)) - .5)*.02;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  bg.position.z = -60; scene.add(bg);

  // a few twinkling stars on top of the painted ones
  const STARS = 70;
  const sg = new THREE.BufferGeometry(); const sp = new Float32Array(STARS * 3); const sa = new Float32Array(STARS);
  for (let i = 0; i < STARS; i++) { sp[i * 3] = (Math.random() - .5) * 70; sp[i * 3 + 1] = 4 + Math.random() * 24; sp[i * 3 + 2] = -50; sa[i] = Math.random(); }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('seed', new THREE.BufferAttribute(sa, 1));
  scene.add(new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float seed; varying float vS; void main(){ vS = seed; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = 1.2 + seed*2.4; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying float vS; uniform float uTime; void main(){ vec2 p = gl_PointCoord-.5; float d = length(p); float tw = .55 + .45*sin(uTime*(.6+vS*1.7) + vS*40.0);
      float a = smoothstep(.5, .0, d) * tw; vec3 c = mix(vec3(1.0,.93,.78), vec3(.94,.81,.53), vS); gl_FragColor = vec4(c, a*.9); }`,
  })));

  // the painted moon inside procedural deco halo rings
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { ...U, uTex: { value: ART.moon }, uFull: { value: 0 } }, transparent: true, depthWrite: false, vertexShader: VERT,
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform sampler2D uTex; uniform float uFull; ${COMMON}
      void main(){
        vec2 p = vUv - .5; float r = length(p)*2.0;
        float disc = smoothstep(.36, .35, r);
        vec3 moonc = texture2D(uTex, p/.36 + .5).rgb;
        moonc = mix(moonc, moonc*vec3(1.04,.98,.86), .35) * (1.0 + .03*sin(uTime*.8) + uFull*.10);
        float rings = 0.0;
        rings += smoothstep(.012,.0,abs(r-.46))*.55; rings += smoothstep(.010,.0,abs(r-.56))*.35; rings += smoothstep(.008,.0,abs(r-.66))*.22;
        float glow = exp(-r*4.2)*(.55 + uFull*.35)*(1.0+.06*sin(uTime*.8));
        vec3 col = moonc*disc + vec3(.94,.81,.53)*(rings + glow)*(1.0-disc);
        gl_FragColor = vec4(col, max(disc, clamp(rings + glow, 0.0, 1.0)));
      }`,
  }));
  moon.position.set(-3.1, 8.0, -30); moon.scale.setScalar(12.5); scene.add(moon);

  // lanterns
  const lanternMat = (seed) => new THREE.ShaderMaterial({
    uniforms: { ...U, uSeed: { value: seed }, uLife: { value: 1 }, uTex: { value: ART.lantern } }, transparent: true, depthWrite: false, vertexShader: VERT,
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uSeed; uniform float uLife; uniform sampler2D uTex; ${COMMON}
      void main(){
        vec4 tx = texture2D(uTex, vUv);
        float flick = .84 + .16*vnoise(vec2(uTime*6.0 + uSeed*13.0, uSeed));
        float flame = smoothstep(.55, .05, vUv.y);
        vec3 col = tx.rgb * mix(.94, 1.0 + (flick - .84)*1.6, flame);
        col = mix(col, col*vec3(1.0, .92 + uSeed*.1, .9), .5);
        gl_FragColor = vec4(col, tx.a*uLife);
      }`,
  });
  const glowMat = (seed) => new THREE.ShaderMaterial({
    uniforms: { ...U, uSeed: { value: seed }, uLife: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: VERT,
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uSeed; uniform float uLife; ${COMMON}
      void main(){ float r = length(vUv-.5)*2.0; float flick = .85 + .15*vnoise(vec2(uTime*5.0 + uSeed*7.0, 1.0));
        float g = exp(-r*3.2)*.55*flick; gl_FragColor = vec4(vec3(1.0,.66,.30)*g*uLife, 1.0); }`,
  });

  // 25 places in the sky, none of them over the moon or under the sheet.
  //
  // The two multipliers below must not add up to a whole number. 0.6180339 and 0.3819660 sum to 1,
  // which makes frac(i*a2) exactly 1 - frac(i*a1): every lantern then lands on one diagonal line
  // and they all appear to hang together. These are 1/g and 1/g^2 of the plastic number
  // g = 1.3247179, the R2 sequence, which is built to cover a plane evenly. z uses the golden
  // ratio, which shares no whole-number sum with either.
  const A1 = 0.7548776662, A2 = 0.5698402910, A3 = 0.6180339887;
  const SLOTS = [];
  function makeSlots() {
    SLOTS.length = 0; camera.position.set(0, 0, 10); camera.lookAt(0, 1.2, -20); camera.updateMatrixWorld();
    const mv = new THREE.Vector3(-3.1, 8.0, -30).project(camera);
    // The moon and its rings rule out most of the sky, so candidates have to be tried in bulk to
    // find enough places. 400 of them only ever yielded 10, fewer than the questions a journey asks.
    for (let i = 0; SLOTS.length < 30 && i < 4000; i++) {
      const x = -2.6 + ((i * A1 + .13) % 1) * 5.2;
      const y = -.4 + ((i * A2 + .41) % 1) * 5.8;
      const z = -7 - ((i * A3 + .07) % 1) * 8;
      const p = new THREE.Vector3(x, y, z).project(camera);
      const dx = (p.x - mv.x) * camera.aspect, dy = p.y - mv.y;
      if (Math.hypot(dx, dy) < .30) continue;          // clear of the moon and its rings, whose outermost sits at .21
      if (p.y < -.42 || p.y > .80 || Math.abs(p.x) > .86) continue;   // clear of the sheet, the title and the edges
      if (SLOTS.some((q) => Math.hypot((q.p.x - p.x) * camera.aspect, q.p.y - p.y) < .13)) continue;
      SLOTS.push({ pos: [x, y, z], p });
    }
  }
  const lanterns = [];
  function addLantern(key, slot, seed = Math.random()) {
    if (!SLOTS.length) makeSlots();
    // Whatever index the caller asks for, two lanterns never share a place. Asking wrapped around
    // the list before, which sat four pairs exactly on top of each other.
    const taken = new Set(lanterns.map((L) => L.slot));
    let i = ((slot % SLOTS.length) + SLOTS.length) % SLOTS.length;
    for (let n = 0; n < SLOTS.length && taken.has(i); n++) i = (i + 1) % SLOTS.length;
    const [x, y, z] = SLOTS[i].pos;
    const g = new THREE.Group();
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), glowMat(seed));
    const body = new THREE.Mesh(new THREE.PlaneGeometry(.78, 1.02), lanternMat(seed));
    body.position.z = .01; g.add(glow, body); g.position.set(x, y, z); scene.add(g);
    const L = { key, g, x, y, z, seed, slot: i, phase: seed * 6.28 };
    lanterns.push(L);
    return L;
  }
  function removeAll() { for (const L of lanterns) scene.remove(L.g); lanterns.length = 0; }

  function resize() {
    const r = host.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    U.uAspect.value = camera.aspect;
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - bg.position.z);
    bg.scale.set(h * camera.aspect * 1.15, h * 1.15, 1);
  }
  addEventListener('resize', resize); resize();

  const frameHooks = [];
  let t0 = performance.now();
  renderer.setAnimationLoop(() => {
    const t = (performance.now() - t0) / 1000; U.uTime.value = t;
    if (!reduced) { look.x += (look.tx - look.x) * .04; look.y += (look.ty - look.y) * .04; }
    camera.position.x = look.x * .55; camera.position.y = -look.y * .35; camera.lookAt(0, 1.2, -20);
    const sway = reduced ? 0 : 1;
    for (const L of lanterns) {
      L.g.position.x = L.x + Math.sin(t * .35 + L.phase) * .12 * sway;
      L.g.position.y = L.y + Math.sin(t * .52 + L.phase * 1.7) * .08 * sway;
      L.g.rotation.z = Math.sin(t * .45 + L.phase) * .06 * sway;
      L.g.children[1].lookAt(camera.position); L.g.children[0].lookAt(camera.position);
    }
    for (const f of frameHooks) f(t);
    renderer.render(scene, camera);
  });

  const v3 = new THREE.Vector3();
  function screenPos(L) { L.g.getWorldPosition(v3); v3.project(camera); const r = canvas.getBoundingClientRect(); return { x: (v3.x + 1) / 2 * r.width, y: (1 - v3.y) / 2 * r.height }; }
  function lanternAt(x, y) {
    let best = null, bd = 1e9;
    for (const L of lanterns) { const p = screenPos(L); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = L; } }
    return bd < 52 ? best : null;
  }

  // parallax: the finger on a computer, the tilt of the phone once it is allowed
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect(); look.tx = ((e.clientX - r.left) / r.width - .5) * 2; look.ty = ((e.clientY - r.top) / r.height - .5) * 2;
  });

  return {
    addLantern, removeAll, lanterns, screenPos, lanternAt, frameHooks,
    setFull(v) { gsap.to(moon.material.uniforms.uFull, { value: v, duration: 2 }); },
    // at midnight the moon comes to the top of the screen, over the clock
    moonTo(centre) { gsap.to(moon.position, { x: centre ? 0 : -3.1, y: centre ? 12.9 : 8.0, duration: centre && !reduced ? 2.4 : .01, ease: 'power2.inOut' }); },
    grow(L, s, d = .6, ease = 'expo.out') { return gsap.to(L.g.scale, { x: s, y: s, duration: d, ease }); },
  };
}

let tiltAsked = false;
export function enableTilt() {
  if (tiltAsked) return; tiltAsked = true;
  const on = () => addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    look.tx = Math.max(-1, Math.min(1, e.gamma / 25)); look.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 25));
  });
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then((s) => { if (s === 'granted') on(); }).catch(() => {});
  } else { on(); }
}
