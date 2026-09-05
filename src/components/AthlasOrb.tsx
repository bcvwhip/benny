import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { VoiceOrbState } from '../types.js';

interface AthlasOrbProps {
  state: VoiceOrbState;
  audioLevel: number; // 0.0 to 1.0
  frequencies?: Uint8Array;
  className?: string;
  size?: number;
}

// Color palettes for the 4 states
const STATE_COLORS: Record<
  VoiceOrbState,
  {
    core: THREE.Color;
    innerGlow: THREE.Color;
    outerGlow: THREE.Color;
    particles: THREE.Color;
    filaments: THREE.Color;
  }
> = {
  // 🟢 ASCOLTO: "Ti ascolto…" (Cyan / Emerald bioluminescence)
  listening: {
    core: new THREE.Color('#00E5FF'),
    innerGlow: new THREE.Color('#10B981'),
    outerGlow: new THREE.Color('#065F46'),
    particles: new THREE.Color('#67E8F9'),
    filaments: new THREE.Color('#34D399'),
  },
  // 🟣 ELABORAZIONE: "Sto pensando…" (Cosmic Amethyst / Magenta vortex)
  thinking: {
    core: new THREE.Color('#C084FC'),
    innerGlow: new THREE.Color('#9333EA'),
    outerGlow: new THREE.Color('#4C1D95'),
    particles: new THREE.Color('#E879F9'),
    filaments: new THREE.Color('#F43F5E'),
  },
  // 🔵 RISPOSTA: "3 athlas" (Electric Sapphire / Royal Cobalt / Golden corona)
  speaking: {
    core: new THREE.Color('#38BDF8'),
    innerGlow: new THREE.Color('#2563EB'),
    outerGlow: new THREE.Color('#1E3A8A'),
    particles: new THREE.Color('#93C5FD'),
    filaments: new THREE.Color('#FBBF24'),
  },
  // ⚪ IDLE: "Parlami…" (Starlight Platinum / Pearl Obsidian)
  idle: {
    core: new THREE.Color('#F1F5F9'),
    innerGlow: new THREE.Color('#94A3B8'),
    outerGlow: new THREE.Color('#334155'),
    particles: new THREE.Color('#CBD5E1'),
    filaments: new THREE.Color('#64748B'),
  },
};

export const AthlasOrb: React.FC<AthlasOrbProps> = ({
  state,
  audioLevel,
  frequencies,
  className = '',
  size = 380,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioLevelRef = useRef(audioLevel);
  const frequenciesRef = useRef(frequencies);
  const stateRef = useRef(state);

  audioLevelRef.current = audioLevel;
  frequenciesRef.current = frequencies;
  stateRef.current = state;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth || size;
    let height = container.clientHeight || size;

    // --- Scene, Camera, Renderer ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 7;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Group containing entire orb system
    const orbGroup = new THREE.Group();
    scene.add(orbGroup);

    // --- 1. CORE SPHERE with custom shader / displacement ---
    const coreRadius = 1.45;
    const coreGeometry = new THREE.IcosahedronGeometry(coreRadius, 28);
    const originalPositions = coreGeometry.attributes.position.clone();

    // Shader Material with Fresnel glow and organic pulsing
    const coreMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAudioLevel: { value: 0 },
        uColor1: { value: new THREE.Color(STATE_COLORS[state].core) },
        uColor2: { value: new THREE.Color(STATE_COLORS[state].innerGlow) },
        uFresnelColor: { value: new THREE.Color(STATE_COLORS[state].outerGlow) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        uniform float uTime;
        uniform float uAudioLevel;

        // Simplex noise approximation
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i  = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3  ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          
          // Organic surface ripples
          float noise = snoise(position * 1.3 + uTime * 0.4);
          float displacement = noise * (0.12 + uAudioLevel * 0.35);
          
          vec3 newPos = position + normal * displacement;
          vWorldPosition = (modelMatrix * vec4(newPos, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        uniform float uTime;
        uniform float uAudioLevel;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uFresnelColor;

        void main() {
          // Fresnel effect for radiant aura edge
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          float fresnel = 1.0 - max(0.0, dot(viewDir, vNormal));
          fresnel = pow(fresnel, 2.5);

          // Internal gradient
          float innerPulse = sin(vPosition.y * 2.0 + uTime * 1.5) * 0.5 + 0.5;
          vec3 color = mix(uColor1, uColor2, innerPulse);
          color = mix(color, uFresnelColor, fresnel * 0.9);

          // Highlight glimmers
          float specular = pow(max(0.0, dot(reflect(-viewDir, vNormal), viewDir)), 16.0);
          color += vec3(specular * 0.6);

          gl_FragColor = vec4(color, 0.88 + fresnel * 0.12);
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
    });

    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    orbGroup.add(coreMesh);

    // --- 2. ENERGY FILAMENTS (Torus & orbital glowing ribbons) ---
    const filamentGroup = new THREE.Group();
    orbGroup.add(filamentGroup);

    const filamentMaterials: THREE.MeshBasicMaterial[] = [];
    const filamentRings: THREE.Mesh[] = [];

    const ringConfigs = [
      { radius: 1.85, tube: 0.015, rx: 1.2, ry: 0.4, rz: 0.8 },
      { radius: 2.1, tube: 0.012, rx: -0.6, ry: 1.4, rz: -0.3 },
      { radius: 2.35, tube: 0.014, rx: 0.3, ry: -0.8, rz: 1.6 },
    ];

    ringConfigs.forEach((cfg) => {
      const geo = new THREE.TorusGeometry(cfg.radius, cfg.tube, 16, 100);
      const mat = new THREE.MeshBasicMaterial({
        color: STATE_COLORS[state].filaments,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.set(cfg.rx, cfg.ry, cfg.rz);
      filamentGroup.add(mesh);
      filamentMaterials.push(mat);
      filamentRings.push(mesh);
    });

    // --- 3. ORBITING MICRO-PARTICLES (Quantum Stardust) ---
    const particleCount = 1400;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const particleVelocities = new Float32Array(particleCount * 3);
    const particleRadii = new Float32Array(particleCount);
    const particleSpeeds = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      // Golden spiral distribution on spherical volume
      const r = 1.9 + Math.random() * 1.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      particleRadii[i] = r;
      particleSpeeds[i] = 0.2 + Math.random() * 0.8;
      particleVelocities[i * 3] = (Math.random() - 0.5) * 0.02;
      particleVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Particle sprite texture (soft circular glow)
    const createParticleTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.7)');
      grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.15)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(canvas);
    };

    const particleTexture = createParticleTexture();

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.08,
      map: particleTexture,
      transparent: true,
      color: STATE_COLORS[state].particles,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particlePoints = new THREE.Points(particleGeometry, particleMaterial);
    orbGroup.add(particlePoints);

    // --- 4. CONCENTRIC ENERGY WAVE SHOCKWAVES ---
    const waveCount = 3;
    const waveRings: THREE.Mesh[] = [];
    const waveMaterials: THREE.MeshBasicMaterial[] = [];

    for (let i = 0; i < waveCount; i++) {
      const ringGeo = new THREE.RingGeometry(1.6, 1.66, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: STATE_COLORS[state].outerGlow,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const waveMesh = new THREE.Mesh(ringGeo, ringMat);
      waveMesh.rotation.x = Math.PI / 2;
      orbGroup.add(waveMesh);
      waveRings.push(waveMesh);
      waveMaterials.push(ringMat);
    }

    // --- Animation State Interpolators ---
    let smoothAudioLevel = 0;
    let clock = new THREE.Clock();

    // Color lerping targets
    const currentColorCore = new THREE.Color(STATE_COLORS[state].core);
    const currentColorInner = new THREE.Color(STATE_COLORS[state].innerGlow);
    const currentColorOuter = new THREE.Color(STATE_COLORS[state].outerGlow);
    const currentColorParticles = new THREE.Color(STATE_COLORS[state].particles);
    const currentColorFilaments = new THREE.Color(STATE_COLORS[state].filaments);

    let animationId: number;

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();
      const rawAudio = audioLevelRef.current || 0;
      const targetState = stateRef.current;

      // Exponential smoothing for organic, fluid audio response
      smoothAudioLevel += (rawAudio - smoothAudioLevel) * 0.18;

      // Target colors for current state
      const targetColors = STATE_COLORS[targetState];
      currentColorCore.lerp(targetColors.core, 0.05);
      currentColorInner.lerp(targetColors.innerGlow, 0.05);
      currentColorOuter.lerp(targetColors.outerGlow, 0.05);
      currentColorParticles.lerp(targetColors.particles, 0.05);
      currentColorFilaments.lerp(targetColors.filaments, 0.05);

      // Update core shader uniforms
      coreMaterial.uniforms.uTime.value = elapsedTime;
      coreMaterial.uniforms.uAudioLevel.value = smoothAudioLevel;
      coreMaterial.uniforms.uColor1.value.copy(currentColorCore);
      coreMaterial.uniforms.uColor2.value.copy(currentColorInner);
      coreMaterial.uniforms.uFresnelColor.value.copy(currentColorOuter);

      // Core breath / scale
      let baseScale = 1.0;
      if (targetState === 'listening') {
        // Expands proportional to voice volume
        baseScale = 1.0 + smoothAudioLevel * 0.55;
      } else if (targetState === 'thinking') {
        // Pulsing inward/outward vortex
        baseScale = 0.95 + Math.sin(elapsedTime * 4.0) * 0.08;
      } else if (targetState === 'speaking') {
        // Cadenced dynamic scale
        baseScale = 1.02 + smoothAudioLevel * 0.45;
      } else {
        // Idle gentle breathing
        baseScale = 1.0 + Math.sin(elapsedTime * 1.2) * 0.04;
      }
      coreMesh.scale.set(baseScale, baseScale, baseScale);

      // Rotate filament rings
      const rotSpeed = targetState === 'thinking' ? 2.8 : targetState === 'speaking' ? 1.5 : 0.8;
      filamentRings[0].rotation.z += 0.008 * rotSpeed;
      filamentRings[1].rotation.x += 0.006 * rotSpeed;
      filamentRings[2].rotation.y += 0.007 * rotSpeed;

      filamentMaterials.forEach((mat) => {
        mat.color.copy(currentColorFilaments);
        mat.opacity = 0.45 + smoothAudioLevel * 0.45;
      });

      // Orbiting particles update
      particleMaterial.color.copy(currentColorParticles);
      particleMaterial.size = 0.07 + smoothAudioLevel * 0.06;

      const posAttr = particleGeometry.attributes.position as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;

      // In thinking state: particles spiral inwards towards core
      // In listening state: particles expand outward with volume
      // In speaking state: dynamic harmonic oscillations
      const particleSpeedMult = targetState === 'thinking' ? 2.5 : 1.0;

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        let x = posArray[i3];
        let y = posArray[i3 + 1];
        let z = posArray[i3 + 2];

        // Angular rotation around Y and Z axis
        const angle = 0.004 * particleSpeeds[i] * particleSpeedMult;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const newX = x * cosA - z * sinA;
        const newZ = x * sinA + z * cosA;
        x = newX;
        z = newZ;

        // Radial breathing
        if (targetState === 'thinking') {
          // Attract towards core and reset when too close
          const dist = Math.sqrt(x * x + y * y + z * z);
          if (dist < 1.5) {
            const newR = 3.2 + Math.random() * 0.8;
            x = (x / dist) * newR;
            y = (y / dist) * newR;
            z = (z / dist) * newR;
          } else {
            x *= 0.985;
            y *= 0.985;
            z *= 0.985;
          }
        } else if (targetState === 'listening' || targetState === 'speaking') {
          // Subtle outward push on voice peak
          if (smoothAudioLevel > 0.15) {
            x *= 1.002;
            y *= 1.002;
            z *= 1.002;
          }
        }

        posArray[i3] = x;
        posArray[i3 + 1] = y;
        posArray[i3 + 2] = z;
      }
      posAttr.needsUpdate = true;

      // Concentric Shockwave rings
      for (let i = 0; i < waveCount; i++) {
        const ring = waveRings[i];
        const mat = waveMaterials[i];
        mat.color.copy(currentColorOuter);

        const wavePhase = (elapsedTime * 0.8 + i * (1.0 / waveCount)) % 1.0;
        const waveScale = 1.0 + wavePhase * (1.6 + smoothAudioLevel * 0.8);
        ring.scale.set(waveScale, waveScale, waveScale);
        mat.opacity = Math.sin(wavePhase * Math.PI) * (0.35 + smoothAudioLevel * 0.5);
      }

      // Gentle continuous rotation of the entire entity
      orbGroup.rotation.y = elapsedTime * 0.15;
      orbGroup.rotation.x = Math.sin(elapsedTime * 0.1) * 0.1;

      renderer.render(scene, camera);
    };

    animate();

    // Resize handling
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || size;
      height = container.clientHeight || size;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      coreGeometry.dispose();
      coreMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      particleTexture.dispose();
      renderer.dispose();
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center select-none overflow-visible ${className}`}
      style={{ width: '100%', height: '100%', minHeight: size, minWidth: size }}
    >
      {/* Ambient backdrop glow that matches the 4 states */}
      <div
        className="absolute inset-0 rounded-full blur-3xl pointer-events-none transition-all duration-700 opacity-40 -z-10 scale-125"
        style={{
          background:
            state === 'listening'
              ? 'radial-gradient(circle, rgba(0, 242, 254, 0.45) 0%, rgba(16, 185, 129, 0.15) 50%, transparent 80%)'
              : state === 'thinking'
              ? 'radial-gradient(circle, rgba(168, 85, 247, 0.5) 0%, rgba(236, 72, 153, 0.2) 50%, transparent 80%)'
              : state === 'speaking'
              ? 'radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, rgba(245, 158, 11, 0.15) 50%, transparent 80%)'
              : 'radial-gradient(circle, rgba(226, 232, 240, 0.25) 0%, rgba(148, 163, 184, 0.1) 50%, transparent 80%)',
        }}
      />
    </div>
  );
};
