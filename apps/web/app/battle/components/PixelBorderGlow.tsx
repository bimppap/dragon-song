import { cn } from "@/lib/utils";

// 64px 아이콘 기준 테두리(1.5~66.5)를 따라 도는 사각 경로. 둘레 260, 불꽃 2개가 마주 보며 돈다.
const TRACK = { x: 1.5, y: 1.5, width: 65, height: 65 } as const;

/**
 * 아이콘 테두리를 따라 픽셀 불꽃이 끊어지듯 이동하는 효과. 부모는 relative여야 하고,
 * 아이콘 박스보다 2px 바깥까지 그려지므로 부모에 overflow-hidden을 두지 않는다.
 */
export default function PixelBorderGlow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 68 68"
      shapeRendering="crispEdges"
      className={cn("pixel-border-glow pointer-events-none absolute -left-0.5 -top-0.5 h-[calc(100%+4px)] w-[calc(100%+4px)] overflow-visible", className)}
    >
      <rect {...TRACK} className="pixel-border-glow-trail" />
      <rect {...TRACK} className="pixel-border-glow-core" />
      <rect {...TRACK} className="pixel-border-glow-tip" />
      <rect x={0.5} y={0.5} width={67} height={67} className="pixel-border-glow-spark" />
    </svg>
  );
}
