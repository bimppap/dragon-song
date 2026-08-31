// Each SVG unit is a 4px square: stepped edges and flat colors, without smoothing.
const BAND = Array.from({ length: 21 }, (_, y) => `M${17 - y} ${y}h4v1h-4Z`).join("");
const BAND_LIGHT = Array.from({ length: 19 }, (_, y) => `M${17 - y} ${y}h1v1h-1Z`).join("");
const BAND_SHADOW = Array.from({ length: 21 }, (_, y) => `M${20 - y} ${y}h1v1h-1Z`).join("");

/** Pixel-art gift wrapping, clipped to the upper-left corner of the card. */
export default function SpecialMerchantRibbon() {
  return (
    <svg viewBox="0 0 22 22" role="img" aria-label="특수 상인 상품" shapeRendering="crispEdges"
      style={{ position: "absolute", top: 0, left: 0, width: 88, height: 88, pointerEvents: "none" }}>
      <path d={BAND} fill="#d92332" />
      <path d={BAND_LIGHT} fill="#ff5961" />
      <path d={BAND_SHADOW} fill="#8c1528" />
      {/* Forked tails. */}
      <path d="M5 9h3v3H7v2H6v2H5v-2H3v-2h1v-2h1ZM9 9h3v2h1v2h1v2h-2v-1h-2v-2H9Z" fill="#8c1528" />
      <path d="M5 10h2v2H6v2H5v-1H4v-1h1ZM10 10h1v2h1v1h-1v-1h-1Z" fill="#e82f3e" />
      {/* Square-edged loops with dark folded interiors. */}
      <path d="M2 4h3v1h2v1h1v4H6v1H3v-1H2V9H1V5h1ZM11 4h3v1h1v4h-1v1h-1v1h-3v-1H9V6h1V5h1Z" fill="#8c1528" />
      <path d="M2 5h3v1h2v3H5v1H3V9H2ZM11 5h3v3h-1v1h-2v1h-1V6h1Z" fill="#e82f3e" />
      <path d="M2 5h3v1H3v2H2ZM11 5h3v1h-2v1h-1Z" fill="#ff7275" />
      <path d="M3 8h2V7h1v2H3ZM11 7h2v1h-1v1h-2V8h1Z" fill="#b51c30" />
      {/* Central knot. */}
      <path d="M7 6h3v1h1v3h-1v1H7v-1H6V7h1Z" fill="#8c1528" />
      <path d="M7 7h3v3H7Z" fill="#e82f3e" />
      <path d="M7 7h2v1H8v1H7Z" fill="#ff7275" />
    </svg>
  );
}
