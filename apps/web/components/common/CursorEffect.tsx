"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number; // 그리드 배수 (도트 크기)
}

const GRID = 3; // 도트 한 칸 크기(px)
const GRAVITY = 0.07;
const MAX_PARTICLES = 500;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** 수명(t: 1→0)에 따라 뜨거운색(흰/노랑)에서 식은색(빨강)으로 변하는 불꽃 팔레트. */
function flameColor(t: number): string {
  if (t > 0.82) return "#fff6c2";
  if (t > 0.58) return "#ffd23f";
  if (t > 0.36) return "#ff9f1c";
  if (t > 0.18) return "#ff5714";
  return "#d72638";
}

/** 전역 마우스 커서 불꽃 이펙트(도트). 이동=잔불 낙하, 클릭=불꽃 버스트. */
export default function CursorEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.imageSmoothingEnabled = false;
    }
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];

    function spawn(x: number, y: number, vx: number, vy: number, size: number, life: number) {
      if (particles.length >= MAX_PARTICLES) return;
      particles.push({ x, y, vx, vy, life, max: life, size });
    }

    // ── 이동: 경로를 따라 가볍게 떨어지는 잔불 ──
    let lastX = 0;
    let lastY = 0;
    let accum = 0;
    let started = false;
    function onMove(e: PointerEvent) {
      const { clientX: x, clientY: y } = e;
      if (!started) {
        lastX = x;
        lastY = y;
        started = true;
        return;
      }
      accum += Math.hypot(x - lastX, y - lastY);
      lastX = x;
      lastY = y;
      // 8px 이동마다 잔불 하나 (가볍게)
      while (accum >= 8) {
        accum -= 8;
        spawn(
          x + rand(-2, 2),
          y + rand(-2, 2),
          rand(-0.3, 0.3),
          rand(0.2, 1.1),
          Math.random() < 0.25 ? 2 : 1,
          rand(20, 34),
        );
      }
    }

    // ── 클릭: 클릭 지점에서 불꽃이 살짝 인다 ──
    function onDown(e: PointerEvent) {
      const { clientX: x, clientY: y } = e;
      for (let i = 0; i < 16; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(0.6, 2.6);
        spawn(
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed - rand(0.6, 2), // 위로 살짝 솟았다가 떨어짐
          Math.random() < 0.5 ? 2 : 1,
          rand(26, 46),
        );
      }
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });

    let raf = 0;
    function frame() {
      ctx!.clearRect(0, 0, width, height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        const t = p.life / p.max;
        ctx!.globalAlpha = Math.min(1, t * 1.2);
        ctx!.fillStyle = flameColor(t);
        const s = p.size * GRID;
        // 그리드에 스냅해 도트 느낌
        const px = Math.round(p.x / GRID) * GRID;
        const py = Math.round(p.y / GRID) * GRID;
        ctx!.fillRect(px - s / 2, py - s / 2, s, s);
      }
      ctx!.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[9999]" />;
}
