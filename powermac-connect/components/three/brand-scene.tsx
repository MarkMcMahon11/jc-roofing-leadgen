"use client";

import { useEffect, useRef } from "react";
import type * as T from "three";

/**
 * Real-time 3D backdrop in the PowerMac brand: a site-grid floor gliding toward the viewer,
 * wireframe building frames with scaffold floors, two tower cranes slewing their jibs,
 * rising sparks, and a glowing ring echoing the PMJ oval with a light orbiting it.
 * The camera drifts with the pointer for parallax.
 *
 *  - "ambient": fixed behind the app, quieter, skipped on phone-width screens (battery)
 *  - "hero": fills its parent (sign-in), ring centre stage
 * Loads three.js only when mounted; pauses when the tab is hidden; renders a single still
 * frame for "reduce motion"; leaves the CSS backdrop in place if WebGL is unavailable.
 */
export function BrandScene({ variant = "ambient", className }: { variant?: "ambient" | "hero"; className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (variant === "ambient" && window.innerWidth < 768) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed) return;

      let renderer: T.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        return; // no WebGL: the CSS backdrop stays
      }
      const hero = variant === "hero";
      const dim = hero ? 1 : 0.72;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hero ? 2 : 1.5));
      renderer.setClearColor(0x000000, 0);
      const canvas = renderer.domElement;
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 1.2s ease";
      el.appendChild(canvas);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x020302, hero ? 0.03 : 0.036);
      const camera = new THREE.PerspectiveCamera(hero ? 52 : 50, 1, 0.1, 220);
      const camBase = new THREE.Vector3(0, hero ? 2.6 : 3.4, hero ? 11 : 13);
      const look = new THREE.Vector3(0, hero ? 2.2 : 1.6, -8);
      camera.position.copy(camBase);

      const GREEN = new THREE.Color("#5ee000");
      const LIME = new THREE.Color("#8af04a");
      const DEEP = new THREE.Color("#3ea800");
      const SILVER = new THREE.Color("#cdd3cf");
      const disposables: { dispose: () => void }[] = [];
      const track = <X extends { dispose: () => void }>(x: X) => (disposables.push(x), x);

      const lineMat = (color: T.Color, opacity: number, additive = false) =>
        track(
          new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: opacity * dim,
            depthWrite: false,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          }),
        );
      const segments = (pts: number[], mat: T.LineBasicMaterial) => {
        const g = track(new THREE.BufferGeometry());
        g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        return new THREE.LineSegments(g, mat);
      };

      // ---- site-grid floor (gliding toward the camera)
      const STEP = 2;
      const grid: number[] = [];
      for (let x = -48; x <= 48; x += STEP) grid.push(x, 0, -70, x, 0, 14);
      for (let z = -70; z <= 14; z += STEP) grid.push(-48, 0, z, 48, 0, z);
      const floor = segments(grid, lineMat(DEEP, 0.34));
      scene.add(floor);

      // ---- construction skyline: wireframe frames with scaffold floors
      const rand = mulberry32(7);
      const frames: number[] = [];
      for (let i = 0; i < 30; i++) {
        let x = (rand() * 2 - 1) * 40;
        if (Math.abs(x) < 7) x += x < 0 ? -7 : 7;
        const z = -18 - rand() * 34;
        const w = 2 + rand() * 4;
        const d = 2 + rand() * 3;
        const h = 3 + rand() * 13;
        const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
        const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
        for (const [cx, cz] of corners) frames.push(cx, 0, cz, cx, h, cz); // columns
        for (let y = 0; y <= h + 0.01; y += 2.6) {
          // floor plates
          for (let k = 0; k < 4; k++) {
            const [ax, az] = corners[k];
            const [bx, bz] = corners[(k + 1) % 4];
            frames.push(ax, y, az, bx, y, bz);
          }
        }
        if (rand() > 0.55) frames.push(x0, 0, z1, x1, Math.min(h, 2.6), z1); // bracing
      }
      const skyline = segments(frames, lineMat(SILVER, 0.2));
      scene.add(skyline);

      // ---- two tower cranes (mast in silver, jib in brand green)
      const cranes: T.Group[] = [];
      for (const [cx, cz, ch, jl] of [
        [-15, -28, 17, 11],
        [19, -36, 21, 13],
      ]) {
        const crane = new THREE.Group();
        const mast: number[] = [];
        const m = 0.6;
        for (let y = 0; y < ch; y += 1.2) {
          mast.push(-m, y, -m, m, y + 1.2, -m, m, y, -m, -m, y + 1.2, -m); // lattice X
          mast.push(-m, y, -m, -m, y + 1.2, -m, m, y, -m, m, y + 1.2, -m);
        }
        crane.add(segments(mast, lineMat(SILVER, 0.32)));
        const jib = new THREE.Group();
        const jp: number[] = [-jl * 0.35, 0, 0, jl, 0, 0, 0, 2.2, 0, jl * 0.85, 0, 0, 0, 2.2, 0, -jl * 0.35, 0, 0, jl * 0.6, 0, 0, jl * 0.6, -3.5, 0];
        jib.add(segments(jp, lineMat(GREEN, 0.75, true)));
        jib.position.y = ch;
        crane.add(jib);
        crane.position.set(cx, 0, cz);
        crane.userData.jib = jib;
        cranes.push(crane);
        scene.add(crane);
      }

      // ---- the PMJ ring: glowing ellipse with a light orbiting it
      const ring = new THREE.Group();
      const curve = new THREE.EllipseCurve(0, 0, 4.8, 1.75, 0, Math.PI * 2, false, 0);
      const ringPts = curve.getPoints(220).map((p) => new THREE.Vector3(p.x, p.y, 0));
      [
        [1, 0.95],
        [1.02, 0.38],
        [1.045, 0.16],
        [0.975, 0.22],
      ].forEach(([s, o]) => {
        const g = track(new THREE.BufferGeometry().setFromPoints(ringPts));
        const loop = new THREE.LineLoop(g, lineMat(GREEN, o, true));
        loop.scale.setScalar(s);
        ring.add(loop);
      });
      const dot = track(makeDotTexture(THREE));
      const orbiterGeo = track(new THREE.BufferGeometry());
      orbiterGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
      const orbiter = new THREE.Points(
        orbiterGeo,
        track(new THREE.PointsMaterial({ size: hero ? 0.9 : 0.7, map: dot, color: LIME, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
      );
      ring.add(orbiter);
      if (hero) {
        ring.position.set(0, 3.1, -1.5);
        ring.scale.setScalar(1.05);
      } else {
        ring.position.set(9, 6.2, -10);
        ring.scale.setScalar(1.25);
      }
      ring.rotation.x = 0.38;
      scene.add(ring);

      // ---- rising sparks
      const N = hero ? 900 : 650;
      const sparkPos = new Float32Array(N * 3);
      const speed = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        sparkPos[i * 3] = (rand() * 2 - 1) * 36;
        sparkPos[i * 3 + 1] = rand() * 16;
        sparkPos[i * 3 + 2] = -46 + rand() * 54;
        speed[i] = 0.15 + rand() * 0.45;
      }
      const sparkGeo = track(new THREE.BufferGeometry());
      sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
      const sparks = new THREE.Points(
        sparkGeo,
        track(new THREE.PointsMaterial({ size: 0.16, map: dot, color: LIME, transparent: true, opacity: 0.7 * dim, depthWrite: false, blending: THREE.AdditiveBlending })),
      );
      scene.add(sparks);

      // ---- size, pointer, loop
      const resize = () => {
        const w = el.clientWidth || window.innerWidth;
        const h = el.clientHeight || window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        if (reduce) renderer.render(scene, camera);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      const pointer = { x: 0, y: 0 };
      const onPointer = (e: PointerEvent) => {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      const start = performance.now();
      let prev = start;
      const ringBaseY = ring.position.y;
      const frame = () => {
        const now = performance.now();
        const t = (now - start) / 1000;
        const dt = Math.min((now - prev) / 1000, 0.05);
        prev = now;
        floor.position.z = (t * 0.9) % STEP;
        skyline.rotation.y = Math.sin(t * 0.05) * 0.04;
        cranes.forEach((c, i) => ((c.userData.jib as T.Group).rotation.y = Math.sin(t * 0.12 + i * 2) * 1.1 + i));
        ring.rotation.y = Math.sin(t * 0.3) * 0.45;
        ring.rotation.z = Math.sin(t * 0.21) * 0.06;
        ring.position.y = ringBaseY + Math.sin(t * 0.8) * 0.14;
        const p = curve.getPoint((t * 0.07) % 1);
        orbiterGeo.attributes.position.setXYZ(0, p.x, p.y, 0);
        orbiterGeo.attributes.position.needsUpdate = true;
        for (let i = 0; i < N; i++) {
          let y = sparkPos[i * 3 + 1] + speed[i] * dt;
          if (y > 16) y = 0;
          sparkPos[i * 3 + 1] = y;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        const scrollY = Math.min(window.scrollY, 1200) * 0.0015;
        camera.position.x += (camBase.x + pointer.x * 1.6 - camera.position.x) * 0.04;
        camera.position.y += (camBase.y - pointer.y * 0.7 - scrollY - camera.position.y) * 0.04;
        camera.lookAt(look);
        renderer.render(scene, camera);
      };

      camera.lookAt(look);
      if (reduce) {
        renderer.render(scene, camera);
      } else {
        renderer.setAnimationLoop(frame);
      }
      requestAnimationFrame(() => (canvas.style.opacity = "1"));

      const onVisibility = () => {
        if (reduce) return;
        renderer.setAnimationLoop(document.hidden ? null : frame);
      };
      document.addEventListener("visibilitychange", onVisibility);

      cleanup = () => {
        renderer.setAnimationLoop(null);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pointermove", onPointer);
        ro.disconnect();
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        canvas.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [variant]);

  return (
    <div
      ref={host}
      aria-hidden
      className={className ?? (variant === "ambient" ? "pointer-events-none fixed inset-0 -z-10" : "pointer-events-none absolute inset-0")}
    />
  );
}

/** Small deterministic PRNG so the skyline is the same on every visit. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Soft round sprite for sparks and the orbiting light. */
function makeDotTexture(THREE: typeof import("three")) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.85)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
