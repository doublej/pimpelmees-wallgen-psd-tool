// config.jsx — Constants and configuration

var SCRIPT_NAME = "Pimpelmees Wallgen PSD tool";
var LABEL_W = 130;
var DLG_W = 520;
var GITHUB_REPO = "doublej/pimpelmees-wallgen-psd-tool";
var EXPECTED_GRAY_ICC = "Gray Gamma 1.0";
var EXPECTED_CMYK_ICC = "FOGRA39";
var EXPECTED_DPI = 100;

// New document dimensions (mm)
var STROKE_W_MM = 487;
var RECT_STROKES = [40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110];
var RECT_HEIGHTS_MM = [2400, 2500, 2600, 2700, 2800, 2900];
var BC_DIAMETERS_MM = [950, 1425, 1900, 2375];
var MS_DIAMETERS_MM = [300, 1000, 1200, 1400];
var ARC_W_MM = 900;
var ARC_H_MM = 1750;
var DL_STROKES = [50, 60, 65, 75, 80];
var DL_HEIGHT_MM = 2000;
var BLEED_RECT = 3;
var BLEED_BC = 10;
var BLEED_MS = 3;
var BLEED_ARC = 3;
var BLEED_DL = 3;
var NEW_DOC_GRAY_PROFILE = "Gray Gamma 1.0";
var NEW_DOC_CMYK_PROFILE = "Coated FOGRA39 (ISO 12647-2:2004)";

function mmToPx(mm) {
    return Math.round(mm / 25.4 * EXPECTED_DPI);
}
