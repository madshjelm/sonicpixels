// Renderer, camera and viewport bookkeeping. The camera looks at the origin
// from z=2.2 with a gentle pointer parallax; `view` is the visible extent of
// the z=0 plane in scene units — target builders lay out within it.

import * as THREE from 'three';
import { PALETTE } from '../palette.js';

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // post chain handles the look; MSAA is wasted on points
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(new THREE.Color(PALETTE.void), 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 12);
    this.camera.position.set(0, 0, 2.2);

    this.view = { w: 2, h: 2 };
    this.pointScale = 6;
    this.dpr = 1;

    this._pointer = new THREE.Vector2();
    this._parallax = new THREE.Vector2();
    addEventListener('pointermove', (e) => {
      this._pointer.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    }, { passive: true });
  }

  resize(settings) {
    const w = innerWidth;
    const h = innerHeight;
    this.dpr = Math.min(
      devicePixelRatio || 1,
      settings.dprCap,
      Math.sqrt(settings.pixelBudget / (w * h))
    );
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const vh = 2 * this.camera.position.z * Math.tan((this.camera.fov * Math.PI) / 360);
    this.view = { w: vh * this.camera.aspect, h: vh };

    // ~2.0 css px at 1080p, scaled by viewport height and dpr; the vertex
    // shader divides by view-space depth (camera z ≈ 2.2)
    this.pointScale = 2.0 * 2.2 * (h / 1080) * this.dpr;
  }

  // Project a scene-space point to CSS pixel coordinates.
  project(x, y, z = 0) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * innerWidth,
      y: (-v.y * 0.5 + 0.5) * innerHeight,
    };
  }

  update(dt, motion) {
    const target = this._parallax;
    target.x += (this._pointer.x * 0.07 * motion - target.x) * (1 - Math.exp(-dt * 3));
    target.y += (-this._pointer.y * 0.045 * motion - target.y) * (1 - Math.exp(-dt * 3));
    this.camera.position.x = target.x;
    this.camera.position.y = target.y;
    this.camera.lookAt(0, 0, 0);
  }
}
