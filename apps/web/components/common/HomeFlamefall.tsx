"use client";

import { useEffect, useRef } from "react";

interface Ember { x: number; y: number; speed: number; size: number; shade: string; }
interface Lightning { points: { x: number; y: number }[]; expiresAt: number; }
const COLORS = ["#fff6c2", "#ffd23f", "#ff9f1c", "#ff5714"];

/** 홈 화면에만 표시하는 눈처럼 천천히 내리는 픽셀 불꽃. */
export default function HomeFlamefall() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    let width = 0; let height = 0; let raf = 0;
    let lightningAt = performance.now() + 2_000 + Math.random() * 4_000;
    let lightning: Lightning[] = [];
    const embers: Ember[] = Array.from({ length: 65 }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, speed: 0.25 + Math.random() * 0.8, size: Math.random() > 0.8 ? 4 : 2, shade: COLORS[Math.floor(Math.random() * COLORS.length)] }));
    const resize = () => { width = innerWidth; height = innerHeight; const dpr = Math.min(devicePixelRatio, 2); canvas.width = width * dpr; canvas.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    function createLightning(now: number): Lightning {
      const points: { x: number; y: number }[] = [];
      let x = Math.random() * width;
      const endY = Math.min(height * (0.35 + Math.random() * 0.4), 520);
      for (let y = 0; y < endY; y += 8) {
        points.push({ x, y });
        x = Math.max(0, Math.min(width - 4, x + (Math.random() - 0.5) * 22));
      }
      return { points, expiresAt: now + 150 + Math.random() * 90 };
    }

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const ember of embers) { ember.y += ember.speed; ember.x += Math.sin(ember.y / 38) * 0.25; if (ember.y > height + 5) { ember.y = -5; ember.x = Math.random() * width; } ctx.fillStyle = ember.shade; ctx.globalAlpha = 0.45; ctx.fillRect(Math.round(ember.x / 2) * 2, Math.round(ember.y / 2) * 2, ember.size, ember.size); }
      if (now >= lightningAt) {
        const count = 1 + Math.floor(Math.random() * 3);
        lightning = Array.from({ length: count }, () => createLightning(now));
        lightningAt = now + 3_000 + Math.random() * 5_000;
      }
      lightning = lightning.filter((bolt) => bolt.expiresAt > now);
      for (const bolt of lightning) {
        const flash = Math.max(0, (bolt.expiresAt - now) / 240);
        ctx.globalAlpha = flash * 0.38;
        ctx.fillStyle = "#65c7ff";
        ctx.shadowColor = "#4aa8ff";
        ctx.shadowBlur = 14;
        for (const point of bolt.points) ctx.fillRect(Math.round(point.x / 2) * 2, point.y, 5, 10);
        ctx.globalAlpha = flash * 0.9;
        ctx.fillStyle = "#e6f7ff";
        ctx.shadowBlur = 5;
        for (const point of bolt.points) ctx.fillRect(Math.round(point.x / 2) * 2 + 1, point.y + 1, 2, 7);
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0; raf = requestAnimationFrame(draw);
    };
    resize(); draw(performance.now()); addEventListener("resize", resize); return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0" />;
}
