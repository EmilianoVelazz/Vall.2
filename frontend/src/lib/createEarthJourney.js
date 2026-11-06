import * as THREE from 'three';
import { animate, createScope, createTimeline } from 'animejs';
import { EARTH_LOCATIONS } from './earthJourneyData.js';

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const earthShader = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 normal = normalize(vWorldNormal);
    float sunlight = dot(normal, normalize(sunDirection));
    float dayMix = smoothstep(-0.15, 0.22, sunlight);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    vec3 color = day * (0.075 + 1.15 * max(sunlight, 0.0));
    color += night * (1.0 - dayMix) * 1.45;
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.4);
    color += vec3(0.12, 0.38, 0.72) * rim * (0.18 + dayMix * 0.6);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const atmosphereShader = `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float rim = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDirection)), 3.0);
    gl_FragColor = vec4(0.18, 0.48, 0.95, rim * 0.42);
    #include <colorspace_fragment>
  }
`;
const positionFor = ({ lat, lon }, radius = 1.465) => {
  const latitude = THREE.MathUtils.degToRad(lat);
  const longitude = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), -Math.cos(latitude) * Math.sin(longitude)).multiplyScalar(radius);
};

export default function createEarthJourney({ host, section, viewport, labels, fill, progressText, motion, reduced, onStage, onProgress, onInteract, onReady, onFailure }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    onFailure();
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.25 : 1.5));
  renderer.setClearColor(0x111827, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 180);
  const planet = new THREE.Group();
  scene.add(planet);
  const textures = [];
  let disposed = false;
  let frameId = 0;
  let visible = true;
  let lastFrame = 0;
  let width = 1;
  let height = 1;
  let progress = 0;
  let targetProgress = 0;
  let positioned = false;
  let lastPercent = -1;
  let notifiedProgress = -1;
  let chapter = -1;
  let dragging = null;
  let idleAngle = 0;
  let motionTime = 0;
  let rotationAnimation;
  let selected = null;
  const state = { approach: 0 };
  const cameraPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(2.1, -.12, 11), new THREE.Vector3(1.6, -.08, 8),
    new THREE.Vector3(1.15, -.2, 5.6), new THREE.Vector3(.85, 0, 3.65),
  ]);
  const rotationPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.12, .7, 0), new THREE.Vector3(.22, -.2, 0),
    new THREE.Vector3(.32, .25, 0), new THREE.Vector3(.339, .159, 0),
  ]);
  const cameraPose = new THREE.Vector3();
  const rotationPose = new THREE.Vector3();
  const viewRotation = { yaw: .7, pitch: .12 };
  const interaction = { yaw: .7, pitch: .12 };
  const velocity = { yaw: 0, pitch: 0 };
  let timeline;
  const scope = createScope({ root: host }).add(() => {
    // One continuous spline avoids stopping at each former camera keyframe.
    timeline = createTimeline({ autoplay: false })
      .add(state, { approach: [0, 1], duration: 3000, ease: 'inOut(2)' }, 0);
  });
  const requestRender = () => {
    if (!disposed && visible && !document.hidden && !frameId) frameId = requestAnimationFrame(renderFrame);
  };
  const loader = new THREE.TextureLoader();
  let loadedTextures = 0;
  const loadTexture = (url) => {
    const texture = loader.load(url, () => {
      if (disposed) return;
      loadedTextures += 1;
      if (loadedTextures === 2) onReady();
      requestRender();
    }, undefined, () => { if (!disposed) onFailure(); });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    textures.push(texture);
    return texture;
  };
  const earthMaterial = new THREE.ShaderMaterial({
    vertexShader, fragmentShader: earthShader,
    uniforms: {
      dayMap: { value: loadTexture('/assets/img/space/earth-day.jpg') },
      nightMap: { value: loadTexture('/assets/img/space/earth-night.png') },
      sunDirection: { value: new THREE.Vector3(-2, 1.8, 4).normalize() },
    },
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1.45, 72, 48), earthMaterial);
  planet.add(earth);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.492, 64, 40), new THREE.ShaderMaterial({ vertexShader, fragmentShader: atmosphereShader, transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  planet.add(atmosphere);

  // Seeded stars are stable across visits and never depend on market data.
  let seed = 164;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const starPositions = new Float32Array(1800 * 3);
  for (let i = 0; i < 1800; i += 1) {
    starPositions[i * 3] = (random() - .5) * 110;
    starPositions[i * 3 + 1] = (random() - .5) * 75;
    starPositions[i * 3 + 2] = -12 - random() * 75;
  }
  const starGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ size: .075, color: 0xc4d9f0, transparent: true, opacity: .85, depthWrite: false, sizeAttenuation: true });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  const markers = EARTH_LOCATIONS.map(location => {
    const position = positionFor(location);
    const point = new THREE.Mesh(new THREE.SphereGeometry(.019, 10, 8), new THREE.MeshBasicMaterial({ color: 0xb9d7ff, transparent: true }));
    point.position.copy(position);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.032, .002, 6, 32), new THREE.MeshBasicMaterial({ color: 0xb9d7ff, transparent: true, opacity: .7 }));
    ring.position.copy(position);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), position.clone().normalize());
    planet.add(point, ring);
    return { location, position, point, ring };
  });
  const connections = new THREE.Group();
  const start = positionFor(EARTH_LOCATIONS[0]);
  EARTH_LOCATIONS.slice(1).forEach(location => {
    const end = positionFor(location);
    const points = Array.from({ length: 65 }, (_, i) => start.clone().lerp(end, i / 64).normalize().multiplyScalar(1.475 + Math.sin(i / 64 * Math.PI) * .22));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: 0xa6d8dd, transparent: true, opacity: .32, dashSize: .025, gapSize: .018, depthWrite: false }));
    line.computeLineDistances();
    connections.add(line);
  });
  planet.add(connections);
  const world = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const viewDirection = new THREE.Vector3();
  const markerOrder = markers.map((marker, i) => ({ ...marker, i }));
  let labelSelection;

  function renderFrame(time = performance.now()) {
    frameId = 0;
    if (disposed || !visible || document.hidden) return;
    const delta = Math.min((time - lastFrame) / 1000 || 1 / 60, .05);
    lastFrame = time;
    if (motion.current) motionTime += delta;
    progress = motion.current ? THREE.MathUtils.damp(progress, targetProgress, 9, delta) : targetProgress;
    if (Math.abs(progress - targetProgress) < .0001) progress = targetProgress;
    timeline.seek(Math.min(progress / .62, 1) * 3000);
    cameraPath.getPoint(state.approach, cameraPose);
    rotationPath.getPoint(state.approach, rotationPose);
    publishProgress();
    if (motion.current && !dragging && !selected && progress < .75) idleAngle += delta * .024;
    camera.position.set(0, 0, cameraPose.z);
    camera.lookAt(0, 0, 0);
    const mobile = width < 700;
    const mobileHeightOffset = -.7 + THREE.MathUtils.smoothstep(progress, .3, .72) * .9;
    planet.position.set(mobile ? cameraPose.x * .24 : cameraPose.x, cameraPose.y + (mobile ? mobileHeightOffset : 0), 0);
    const ambientRotation = idleAngle * (1 - THREE.MathUtils.smoothstep(progress, .3, .55));
    if (motion.current && selected === 'manual' && !dragging) {
      interaction.yaw += velocity.yaw * delta;
      interaction.pitch = THREE.MathUtils.clamp(interaction.pitch + velocity.pitch * delta, -.7, 1.2);
      const friction = Math.exp(-delta * 7);
      velocity.yaw *= friction; velocity.pitch *= friction;
    }
    const targetYaw = selected ? interaction.yaw : rotationPose.y + ambientRotation;
    const yaw = viewRotation.yaw + Math.atan2(Math.sin(targetYaw - viewRotation.yaw), Math.cos(targetYaw - viewRotation.yaw));
    const pitch = selected ? interaction.pitch : rotationPose.x;
    viewRotation.yaw = motion.current ? THREE.MathUtils.damp(viewRotation.yaw, yaw, 18, delta) : yaw;
    viewRotation.pitch = motion.current ? THREE.MathUtils.damp(viewRotation.pitch, pitch, 18, delta) : pitch;
    planet.rotation.set(viewRotation.pitch, viewRotation.yaw, -.05);
    stars.rotation.z = Math.sin(motionTime / 80) * .03;
    starMaterial.opacity = .85 - progress * .57;
    const markerOpacity = THREE.MathUtils.smoothstep(progress, .25, .36);
    connections.visible = markerOpacity > 0;
    connections.children.forEach(line => { line.material.opacity = markerOpacity * .32; });
    markers.forEach(({ point, ring, location }) => {
      point.visible = markerOpacity > 0;
      point.material.opacity = markerOpacity;
      ring.visible = point.visible;
      ring.scale.setScalar(1 + Math.sin(motionTime / .85) * .16);
      ring.material.opacity = markerOpacity * (selected === location.id ? .95 : .55);
      point.material.color.setHex(selected === location.id ? 0xffffff : 0xb9d7ff);
    });
    planet.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const labelBoxes = [];
    // Reserve space for the selected label before nearby European cities.
    if (labelSelection !== selected) {
      labelSelection = selected;
      markerOrder.sort((a, b) => Number(b.location.id === selected) - Number(a.location.id === selected) || a.i - b.i);
    }
    markerOrder.forEach(({ location, position, i }) => {
      const label = labels[i];
      if (!label) return;
      world.copy(position).applyMatrix4(planet.matrixWorld);
      normal.copy(position).normalize().transformDirection(planet.matrixWorld);
      viewDirection.copy(camera.position).sub(world).normalize();
      projected.copy(world).project(camera);
      const x = (projected.x * .5 + .5) * width;
      const y = (-projected.y * .5 + .5) * height;
      const facing = normal.dot(viewDirection);
      const box = { x, y, right: x + (location.id === 'barcelona' ? 94 : 86), bottom: y + 38 };
      const overlaps = labelBoxes.some(other => box.x < other.right + 8 && box.right + 8 > other.x && box.y < other.bottom + 6 && box.bottom + 6 > other.y);
      const shown = progress > .28 && facing > .12 && x > 25 && x < width - 105 && y > 90 && y < height - 170 && !overlaps;
      if (shown) labelBoxes.push(box);
      label.hidden = !shown;
      label.style.opacity = String(markerOpacity * THREE.MathUtils.smoothstep(facing, .12, .35));
      label.style.transform = `translate(${x}px, ${y}px)`;
      label.dataset.selected = String(selected === location.id);
    });
    renderer.render(scene, camera);
    if (motion.current) frameId = requestAnimationFrame(renderFrame);
  }
  function publishProgress() {
    viewport.style.setProperty('--vp-arrival', String(THREE.MathUtils.smoothstep(progress, .83, 1)));
    fill.style.transform = `scaleX(${progress})`;
    const percent = Math.round(progress * 100);
    if (percent !== lastPercent) { lastPercent = percent; progressText.textContent = `${percent.toString().padStart(2, '0')}%`; }
    const next = progress < .20 ? 0 : progress < .55 ? 1 : 2;
    if (chapter !== next) { chapter = next; onStage(next); }
    if (Math.abs(progress - notifiedProgress) >= .0001) {
      notifiedProgress = progress;
      onProgress?.(progress);
    }
  }
  const updateScroll = () => {
    const travel = section.offsetHeight - viewport.clientHeight;
    targetProgress = reduced ? 1 : THREE.MathUtils.clamp(-section.getBoundingClientRect().top / Math.max(travel, 1), 0, 1);
    if (!positioned) { progress = targetProgress; positioned = true; }
    requestRender();
  };
  const resize = () => {
    width = viewport.clientWidth;
    height = viewport.clientHeight;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    updateScroll();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(viewport);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) { lastFrame = performance.now(); updateScroll(); }
    else { cancelAnimationFrame(frameId); frameId = 0; }
  });
  observer.observe(section);
  const visibility = () => { if (!document.hidden) { lastFrame = performance.now(); requestRender(); } };
  const down = event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    rotationAnimation?.cancel();
    velocity.yaw = 0; velocity.pitch = 0;
    dragging = { x: event.clientX, y: event.clientY, id: event.pointerId, time: event.timeStamp, active: false, touch: event.pointerType === 'touch' };
    renderer.domElement.focus({ preventScroll: true });
  };
  const move = event => {
    if (!dragging || event.pointerId !== dragging.id) return;
    const dx = event.clientX - dragging.x;
    const dy = event.clientY - dragging.y;
    if (!dragging.active) {
      if (Math.hypot(dx, dy) < 5 || (dragging.touch && Math.abs(dy) > Math.abs(dx))) return;
      dragging.active = true;
      interaction.yaw = viewRotation.yaw; interaction.pitch = viewRotation.pitch;
      selected = 'manual'; onInteract?.();
      renderer.domElement.classList.add('dragging');
      renderer.domElement.setPointerCapture(event.pointerId);
    }
    const elapsed = Math.max(16, event.timeStamp - dragging.time) / 1000;
    velocity.yaw = THREE.MathUtils.clamp(dx * .006 / elapsed, -1.5, 1.5);
    velocity.pitch = THREE.MathUtils.clamp(dy * .004 / elapsed, -.7, .7);
    interaction.yaw += dx * .006;
    interaction.pitch = THREE.MathUtils.clamp(interaction.pitch + dy * .004, -.7, 1.2);
    dragging.x = event.clientX;
    dragging.y = event.clientY;
    dragging.time = event.timeStamp;
    requestRender();
  };
  const up = () => { dragging = null; renderer.domElement.classList.remove('dragging'); };
  const keydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    rotationAnimation?.cancel();
    if (selected !== 'manual') { interaction.yaw = viewRotation.yaw; interaction.pitch = viewRotation.pitch; }
    selected = 'manual';
    onInteract?.(); velocity.yaw = 0; velocity.pitch = 0;
    interaction.yaw += event.key === 'ArrowLeft' ? -.15 : event.key === 'ArrowRight' ? .15 : 0;
    interaction.pitch = THREE.MathUtils.clamp(interaction.pitch + (event.key === 'ArrowUp' ? -.1 : event.key === 'ArrowDown' ? .1 : 0), -.7, 1.2);
    requestRender();
  };
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('role', 'group');
  renderer.domElement.setAttribute('aria-label', 'Tierra interactiva. Arrastra para girarla o utiliza las teclas de dirección.');
  renderer.domElement.addEventListener('pointerdown', down);
  renderer.domElement.addEventListener('pointermove', move);
  renderer.domElement.addEventListener('pointerup', up);
  renderer.domElement.addEventListener('pointercancel', up);
  renderer.domElement.addEventListener('lostpointercapture', up);
  renderer.domElement.addEventListener('keydown', keydown);
  window.addEventListener('pointerup', up);
  window.addEventListener('scroll', updateScroll, { passive: true });
  document.addEventListener('visibilitychange', visibility);
  const contextLost = event => { event.preventDefault(); onFailure(); };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  resize();

  return {
    focusRegion(id) {
      const location = EARTH_LOCATIONS.find(item => item.id === id);
      if (!location) return;
      selected = id;
      rotationAnimation?.cancel();
      velocity.yaw = 0; velocity.pitch = 0;
      interaction.yaw = viewRotation.yaw; interaction.pitch = viewRotation.pitch;
      const target = -THREE.MathUtils.degToRad(location.lon) - Math.PI / 2;
      const nearestYaw = interaction.yaw + Math.atan2(Math.sin(target - interaction.yaw), Math.cos(target - interaction.yaw));
      rotationAnimation = animate(interaction, { yaw: nearestYaw, pitch: THREE.MathUtils.degToRad(location.lat), duration: motion.current ? 1550 : 0, ease: 'inOut(3)', onUpdate: requestRender });
      requestRender();
    },
    reset() {
      rotationAnimation?.cancel();
      selected = 'reset';
      idleAngle = 0;
      velocity.yaw = 0; velocity.pitch = 0;
      interaction.yaw = viewRotation.yaw; interaction.pitch = viewRotation.pitch;
      const yaw = interaction.yaw + Math.atan2(Math.sin(rotationPose.y - interaction.yaw), Math.cos(rotationPose.y - interaction.yaw));
      rotationAnimation = animate(interaction, { yaw, pitch: rotationPose.x, duration: motion.current ? 1100 : 0, ease: 'inOut(3)', onUpdate: requestRender, onComplete: () => { selected = null; requestRender(); } });
      requestRender();
    },
    refresh() {
      if (motion.current) rotationAnimation?.resume();
      else rotationAnimation?.pause();
      requestRender();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      rotationAnimation?.cancel();
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('pointerup', up);
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerup', up);
      renderer.domElement.removeEventListener('pointercancel', up);
      renderer.domElement.removeEventListener('lostpointercapture', up);
      renderer.domElement.removeEventListener('keydown', keydown);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      scope.revert();
      scene.traverse(object => {
        object.geometry?.dispose();
        if (object.material) object.material.dispose();
      });
      textures.forEach(texture => texture.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
