// config.jsx — Constants and configuration

var SCRIPT_NAME = "Pimpelmees Wallgen PSD tool";
var LABEL_W = 130;
var DLG_W = 520;
var GITHUB_REPO = "doublej/pimpelmees-wallgen-psd-tool";
var EXPECTED_GRAY_ICC = "Gray Gamma 1.0";
var EXPECTED_CMYK_ICC = "FOGRA39";
var EXPECTED_DPI = 100;

// New document dimensions (mm)
// BC_DIAMETERS_MM, MS_DIAMETERS_MM, ARC_W_MM, ARC_H_MM come from
// config-generated.jsx (codegen'd from wallgen/var/catalog/dimensions.json).
var STROKE_W_MM = 487;
var RECT_STROKES = [
  40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110,
];
var RECT_HEIGHTS_MM = [2400, 2500, 2600, 2700, 2800, 2900];
var DL_STROKES = [50, 60, 65, 75, 80];
var DL_HEIGHT_MM = 2000;
var BLEED_RECT = 3;
var BLEED_BC = 10;
var BLEED_MS = 3;
var BLEED_ARC = 3;
var BLEED_DL = 3;

// Frame-mask detection: a layer qualifies only if it's transparent inside
// the inner buffered circle AND opaque across ≥ MASK_OUTER_OPAQUE_RATIO of
// the outer ring (outside the outer buffered circle). Buffers forgive
// antialiased edges around the detected diameter.
var MASK_INNER_BUFFER = 0.995;
var MASK_INNER_OPAQUE_RATIO_MAX = 0.02;
var MASK_OUTER_BUFFER = 1.005;
var MASK_OUTER_OPAQUE_RATIO = 0.9;
// Frame masks are opaque squares with one transparent circular hole.
// The opaque area is the square minus the circle; for an inscribed circle
// that is about 0.215 of the bbox. The wider window allows bleed/buffer
// variants while rejecting full rectangles and standalone circular art.
var MASK_FRAME_FILL_MIN = 0.02;
var MASK_FRAME_FILL_MAX = 0.45;
// Frame-mask = opaque square covering the canvas with a transparent
// circular hole. Bbox area must be at least this fraction of canvas
// area to qualify (handles slight overshoots and 1-2 px insets seen in
// the wild).
var MASK_FRAME_BBOX_MIN_RATIO = 0.95;
// Automode auto-hide threshold: only candidates whose Ø is at least
// AUTO_HIDE_NEAR_LARGEST × largest-Ø get hidden silently. The cover is
// always the biggest circle in the doc; smaller circular shapes
// (medallions, decorative dots, badges) are design content and must
// survive the batch run. Interactive flows (cirkel/stepper) ignore
// this threshold — the user picks per-checkbox.
var AUTO_HIDE_NEAR_LARGEST = 0.9;
var NEW_DOC_GRAY_PROFILE = "Gray Gamma 1.0";
var NEW_DOC_CMYK_PROFILE = "Coated FOGRA39 (ISO 12647-2:2004)";

function mmToPx(mm) {
  return Math.round((mm / 25.4) * EXPECTED_DPI);
}
