// analysis.jsx — Document inspection and analysis

function measureOutOfCanvas(doc) {
    var w = doc.width.as("px");
    var h = doc.height.as("px");
    var b = doc.activeLayer.bounds;
    var l = b[0].as("px"), t = b[1].as("px");
    var r = b[2].as("px"), bt = b[3].as("px");

    return { hasExcess: (l < 0 || t < 0 || r > w || bt > h) };
}

function hasSemiTransparentPixels(doc) {
    if (doc.activeLayer.isBackgroundLayer) return false;

    var origFg = app.foregroundColor;

    try {
        var desc = new ActionDescriptor();
        var ref1 = new ActionReference();
        ref1.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
        desc.putReference(charIDToTypeID("null"), ref1);
        var ref2 = new ActionReference();
        ref2.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Trsp"));
        desc.putReference(charIDToTypeID("T   "), ref2);
        executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
    } catch (e) {
        return false;
    }

    var tempCh = doc.channels.add();
    tempCh.name = "__alpha_check";
    tempCh.kind = ChannelType.MASKEDAREA;
    doc.activeChannels = [tempCh];

    var white = new SolidColor();
    white.rgb.red = 255;
    white.rgb.green = 255;
    white.rgb.blue = 255;
    app.foregroundColor = white;

    try { doc.selection.fill(app.foregroundColor); } catch (e) {}
    try { doc.selection.deselect(); } catch (e) {}

    var hist = tempCh.histogram;
    var hasSemi = false;
    for (var v = 1; v < 255; v++) {
        if (hist[v] > 0) { hasSemi = true; break; }
    }

    tempCh.remove();
    app.foregroundColor = origFg;
    doc.activeChannels = doc.componentChannels;

    return hasSemi;
}

function checkIccProfile(doc) {
    var profile = safeProfileName(doc);
    var mode = doc.mode;

    if (mode === DocumentMode.GRAYSCALE) {
        if (profile.indexOf(EXPECTED_GRAY_ICC) !== -1) return null;
        return { profile: profile || "None", expected: EXPECTED_GRAY_ICC, wrongMode: false };
    }
    if (mode === DocumentMode.CMYK) {
        if (profile.indexOf(EXPECTED_CMYK_ICC) !== -1) return null;
        return { profile: profile || "None", expected: EXPECTED_CMYK_ICC, wrongMode: false };
    }

    var modeName = getColorModeName(mode);
    return { profile: modeName + " / " + (profile || "None"), expected: null, wrongMode: true };
}

function countHiddenLayers(layers) {
    var count = 0;
    for (var i = 0; i < layers.length; i++) {
        if (!layers[i].visible) count++;
        if (layers[i].typename === "LayerSet") {
            count += countHiddenLayers(layers[i].layers);
        }
    }
    return count;
}

// Convert the bottom Background layer to a regular layer (legacy entry
// point — kept for backwards compat and as a quick "just unlock the
// bottom" call). Most flows now want unlockAllLayersDeep below.
function unlockBackground(doc) {
    try {
        var last = doc.layers[doc.layers.length - 1];
        if (last.isBackgroundLayer) last.isBackgroundLayer = false;
    } catch (e) {}
}

// Walk the entire layer tree and clear every lock flag on every layer:
// background flag, all-lock, pixel-lock, transparency-lock, position-
// lock. Necessary before any mutation step (.remove(), .grouped=false,
// Dlt mask) — Photoshop raises a non-suppressible "command Delete is
// not currently available" modal when the script touches a locked
// layer, even with DialogModes.NO. Designers routinely lock background
// composites + reference layers in the BoP source PSDs.
function unlockAllLayersDeep(layers, events) {
    var n = unlockAllLayersInner(layers);
    if (events) ev_kv(events, "unlockAllLayers", n + " unlocked");
    return n;
}
function unlockAllLayersInner(layers) {
    var n = 0;
    for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        var changed = false;
        try { if (L.isBackgroundLayer) { L.isBackgroundLayer = false; changed = true; } } catch (e1) {}
        try { if (L.allLocked) { L.allLocked = false; changed = true; } } catch (e2) {}
        try { if (L.pixelsLocked) { L.pixelsLocked = false; changed = true; } } catch (e3) {}
        try { if (L.positionLocked) { L.positionLocked = false; changed = true; } } catch (e4) {}
        try { if (L.transparentPixelsLocked) { L.transparentPixelsLocked = false; changed = true; } } catch (e5) {}
        if (changed) n++;
        if (L.typename === "LayerSet") {
            n += unlockAllLayersInner(L.layers);
        }
    }
    return n;
}

// Build a selection of every non-white pixel via Color Range sampled at white.
// Action manager because doc.selection has no color-range API.
function selectNonWhitePixels(doc) {
    try { doc.selection.deselect(); } catch (e) {}
    var desc = new ActionDescriptor();
    desc.putInteger(stringIDToTypeID("fuzziness"), 5);
    var sample = new ActionDescriptor();
    sample.putDouble(stringIDToTypeID("luminance"), 100);
    sample.putDouble(stringIDToTypeID("a"), 0);
    sample.putDouble(stringIDToTypeID("b"), 0);
    desc.putObject(stringIDToTypeID("minimum"), stringIDToTypeID("labColor"), sample);
    desc.putObject(stringIDToTypeID("maximum"), stringIDToTypeID("labColor"), sample);
    desc.putBoolean(stringIDToTypeID("colorModel"), false);
    executeAction(stringIDToTypeID("colorRange"), desc, DialogModes.NO);
    // Color Range selected white pixels — invert to get the design.
    try { doc.selection.invert(); } catch (e) { return false; }
    return true;
}

// Largest-non-white-region detection. Assumes circle is dominant, roughly
// centered. Returns null if no usable selection (fully white / errors).
function detectCircle(doc) {
    var ok = selectNonWhitePixels(doc);
    if (!ok) return null;
    var bounds;
    try { bounds = doc.selection.bounds; } catch (e) { return null; }
    if (!bounds) return null;
    try { doc.selection.deselect(); } catch (e) {}

    var l = bounds[0].as("px");
    var t = bounds[1].as("px");
    var r = bounds[2].as("px");
    var b = bounds[3].as("px");
    var w = r - l;
    var h = b - t;
    if (w <= 0 || h <= 0) return null;

    var halfW = w / 2;
    var halfH = h / 2;
    var rPx = halfW > halfH ? halfW : halfH;
    var diameterPx = rPx * 2;
    var dpi = doc.resolution;
    var diameterMm = diameterPx / dpi * 25.4;

    return {
        cx_px: l + halfW,
        cy_px: t + halfH,
        r_px: rPx,
        diameter_px: diameterPx,
        diameter_mm: diameterMm,
        source: "auto"
    };
}

// Walk doc.layers recursively, collect every visible leaf (non-LayerSet,
// non-background). Kind filtering happens later so the diagnostic can
// report each rejection reason. Adjustment layers etc. are excluded later.
function collectVisibleLeaves(layers, parentPath, out) {
    for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        if (!L.visible) continue;
        var thisPath = parentPath ? parentPath + "/" + L.name : L.name;
        if (L.typename === "LayerSet") {
            collectVisibleLeaves(L.layers, thisPath, out);
            continue;
        }
        if (L.isBackgroundLayer) continue;
        out.push({ layer: L, path: thisPath });
    }
}

function describeLayerKind(k) {
    if (k === LayerKind.NORMAL) return "NORMAL";
    if (k === LayerKind.TEXT) return "TEXT";
    if (k === LayerKind.SOLIDFILL) return "SOLIDFILL";
    if (k === LayerKind.GRADIENTFILL) return "GRADIENTFILL";
    if (k === LayerKind.PATTERNFILL) return "PATTERNFILL";
    if (k === LayerKind.SMARTOBJECT) return "SMARTOBJECT";
    if (k === LayerKind.LEVELS) return "LEVELS";
    if (k === LayerKind.CURVES) return "CURVES";
    if (k === LayerKind.BRIGHTNESSCONTRAST) return "BRIGHTNESSCONTRAST";
    if (k === LayerKind.HUESATURATION) return "HUESATURATION";
    if (k === LayerKind.COLORBALANCE) return "COLORBALANCE";
    if (k === LayerKind.INVERSION) return "INVERSION";
    if (k === LayerKind.THRESHOLD) return "THRESHOLD";
    if (k === LayerKind.POSTERIZE) return "POSTERIZE";
    if (k === LayerKind.BLACKANDWHITE) return "BLACKANDWHITE";
    if (k === LayerKind.PHOTOFILTER) return "PHOTOFILTER";
    if (k === LayerKind.COLORLOOKUP) return "COLORLOOKUP";
    if (k === LayerKind.VIBRANCE) return "VIBRANCE";
    if (k === LayerKind.CHANNELMIXER) return "CHANNELMIXER";
    if (k === LayerKind.EXPOSURE) return "EXPOSURE";
    if (k === LayerKind.LAYER3D) return "LAYER3D";
    if (k === LayerKind.VIDEO) return "VIDEO";
    return "other";
}

function layerCoversDoc(layer, doc, tolPx) {
    var docW = doc.width.as("px");
    var docH = doc.height.as("px");
    var b = layer.bounds;
    var l = b[0].as("px");
    var t = b[1].as("px");
    var r = b[2].as("px");
    var bt = b[3].as("px");
    if (Math.abs(l - 0) > tolPx) return false;
    if (Math.abs(t - 0) > tolPx) return false;
    if (Math.abs(r - docW) > tolPx) return false;
    if (Math.abs(bt - docH) > tolPx) return false;
    return true;
}

function selectInnerEllipse(doc, cx, cy, diameter) {
    var r = diameter / 2;
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
    desc.putReference(charIDToTypeID("null"), ref);
    var ell = new ActionDescriptor();
    ell.putUnitDouble(charIDToTypeID("Top "), charIDToTypeID("#Pxl"), cy - r);
    ell.putUnitDouble(charIDToTypeID("Left"), charIDToTypeID("#Pxl"), cx - r);
    ell.putUnitDouble(charIDToTypeID("Btom"), charIDToTypeID("#Pxl"), cy + r);
    ell.putUnitDouble(charIDToTypeID("Rght"), charIDToTypeID("#Pxl"), cx + r);
    desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Elps"), ell);
    executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
}

function intersectSelectionWithLayerTransparency(doc) {
    var desc = new ActionDescriptor();
    var ref1 = new ActionReference();
    ref1.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
    desc.putReference(charIDToTypeID("null"), ref1);
    var ref2 = new ActionReference();
    ref2.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Trsp"));
    desc.putReference(charIDToTypeID("T   "), ref2);
    executeAction(charIDToTypeID("Intr"), desc, DialogModes.NO);
}

// Set selection = active layer's opaque region (Cmd-click thumbnail equivalent).
function loadLayerTransparencyAsSelection(doc) {
    var desc = new ActionDescriptor();
    var ref1 = new ActionReference();
    ref1.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
    desc.putReference(charIDToTypeID("null"), ref1);
    var ref2 = new ActionReference();
    ref2.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Trsp"));
    desc.putReference(charIDToTypeID("T   "), ref2);
    executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
}

// True if the active layer has ANY transparent pixels. Load opaque region,
// invert; an empty inverted selection means the layer is fully opaque.
function layerHasAnyTransparency(doc) {
    try { loadLayerTransparencyAsSelection(doc); } catch (e) { return false; }
    try { doc.selection.invert(); } catch (e) { return false; }
    return !isSelectionEmpty(doc);
}

function isSelectionEmpty(doc) {
    try {
        var b = doc.selection.bounds;
        return !b;
    } catch (e) {
        return true;
    }
}

// Count pixels in the current selection by filling a temp alpha channel
// with white and summing histogram[1..255]. Throws with a sub-step prefix
// when any underlying AM call fails (so the caller's diagnostic can pin it).
function measureSelectionPixelArea(doc) {
    var subStep = "channels.add";
    var tempCh = null;
    var prevActiveChannels = null;
    try {
        tempCh = doc.channels.add();
        subStep = "set channel kind";
        try { tempCh.kind = ChannelType.MASKEDAREA; } catch (eK) {}
        subStep = "read activeChannels";
        prevActiveChannels = doc.activeChannels;
        subStep = "set activeChannels";
        doc.activeChannels = [tempCh];
        subStep = "fill selection";
        var white = new SolidColor();
        white.rgb.red = 255; white.rgb.green = 255; white.rgb.blue = 255;
        try { doc.selection.fill(white); } catch (eF) {}
        subStep = "read histogram";
        var hist = tempCh.histogram;
        var total = 0;
        for (var v = 1; v <= 255; v++) total += hist[v];
        try { tempCh.remove(); } catch (eR) {}
        try { doc.activeChannels = prevActiveChannels; } catch (eC) {}
        return total;
    } catch (e) {
        try { if (tempCh) tempCh.remove(); } catch (eR2) {}
        try { if (prevActiveChannels) doc.activeChannels = prevActiveChannels; } catch (eC2) {}
        throw new Error("measure[" + subStep + "]: " + e.message);
    }
}

// Approximate selection area via bbox. Used as fallback when the histogram
// path errors. Overestimates for non-rectangular selections, but stable.
function approxSelectionPixelAreaByBounds(doc) {
    try {
        var b = doc.selection.bounds;
        if (!b) return 0;
        var bw = b[2].as("px") - b[0].as("px");
        var bh = b[3].as("px") - b[1].as("px");
        return Math.round(bw * bh);
    } catch (e) { return 0; }
}

// Wraps measureSelectionPixelArea with a bbox fallback. Returns
// { area, fallback, error } so the caller can surface the path used.
function measureOrApprox(doc) {
    try { return { area: measureSelectionPixelArea(doc), fallback: false, error: null }; }
    catch (e) { return { area: approxSelectionPixelAreaByBounds(doc), fallback: true, error: e.message }; }
}

// Bounds of the active layer's opaque region (alpha > 0). More reliable
// than layer.bounds, which for some layers (with masks, smart objects)
// returns the canvas frame instead of pixel extent. Returns null if the
// layer is entirely transparent or the load fails.
function getOpaqueAreaBounds(doc) {
    try { loadLayerTransparencyAsSelection(doc); } catch (e) { return null; }
    var b = null;
    try { b = doc.selection.bounds; } catch (eB) {}
    try { doc.selection.deselect(); } catch (eD) {}
    if (!b) return null;
    return [b[0].as("px"), b[1].as("px"), b[2].as("px"), b[3].as("px")];
}

// True if the composite color at (x,y) is near-white (within mode tolerances).
// Used to distinguish "white-cover layers" from design layers that happen to
// match the circle shape — cover layers paint over the design with white;
// design layers have any other color.
function sampleCompositeIsWhite(doc, x, y) {
    var sampler = null;
    try { sampler = doc.colorSamplers.add([UnitValue(x, "px"), UnitValue(y, "px")]); }
    catch (e) { return false; }
    var c = sampler.color;
    sampler.remove();
    try {
        if (doc.mode === DocumentMode.GRAYSCALE) return c.gray.gray >= 95;
        if (doc.mode === DocumentMode.CMYK)
            return c.cmyk.cyan <= 5 && c.cmyk.magenta <= 5
                && c.cmyk.yellow <= 5 && c.cmyk.black <= 5;
        if (doc.mode === DocumentMode.RGB)
            return c.rgb.red >= 240 && c.rgb.green >= 240 && c.rgb.blue >= 240;
    } catch (eC) {}
    return false;
}

// Sample 5 points (center + N/S/E/W at 50% radius) inside the circle. If at
// least 4 read as near-white in the composite, treat the layer as the
// white-cover. Assumes the cover is the front-most visible content at these
// points (which is the case for a layer painted on top of the design).
function isLayerMostlyWhite(doc, circle) {
    var pts = [
        [circle.cx_px, circle.cy_px],
        [circle.cx_px + circle.r_px * 0.5, circle.cy_px],
        [circle.cx_px - circle.r_px * 0.5, circle.cy_px],
        [circle.cx_px, circle.cy_px + circle.r_px * 0.5],
        [circle.cx_px, circle.cy_px - circle.r_px * 0.5]
    ];
    var whiteCount = 0;
    for (var i = 0; i < pts.length; i++) {
        if (sampleCompositeIsWhite(doc, pts[i][0], pts[i][1])) whiteCount++;
    }
    return { whiteCount: whiteCount, total: pts.length, mostlyWhite: whiteCount >= 4 };
}

// Returns { passed, ratio, opaqueArea, outerArea }. Measures what fraction
// of the doc's outer ring (outside the outer-buffered circle) is opaque on
// the active layer. Frame masks wrap most of the canvas → ratio near 1.0;
// rim decoration / vignettes only cover a small ring → low ratio.
function layerOpaqueOutsideCircle(doc, circle) {
    var bufferedDia = circle.diameter_px * MASK_OUTER_BUFFER;
    var res = { passed: false, ratio: 0, opaqueArea: 0, outerArea: 0, fallback: false };

    try {
        selectInnerEllipse(doc, circle.cx_px, circle.cy_px, bufferedDia);
        doc.selection.invert();
    } catch (e) { return res; }

    var m1 = measureOrApprox(doc);
    res.outerArea = m1.area;
    if (m1.fallback) res.fallback = true;
    if (res.outerArea <= 0) {
        try { doc.selection.deselect(); } catch (e1) {}
        return res;
    }

    try {
        selectInnerEllipse(doc, circle.cx_px, circle.cy_px, bufferedDia);
        doc.selection.invert();
    } catch (e2) {
        try { doc.selection.deselect(); } catch (e3) {}
        return res;
    }

    var threwEmpty = false;
    try { intersectSelectionWithLayerTransparency(doc); }
    catch (e4) { threwEmpty = true; }
    if (!threwEmpty && !isSelectionEmpty(doc)) {
        var m2 = measureOrApprox(doc);
        res.opaqueArea = m2.area;
        if (m2.fallback) res.fallback = true;
    }
    try { doc.selection.deselect(); } catch (e5) {}

    res.ratio = res.opaqueArea / res.outerArea;
    res.passed = res.ratio >= MASK_OUTER_OPAQUE_RATIO;
    return res;
}

// Returns true only when the active layer is essentially transparent inside
// the inferred circle. The small opaque allowance catches antialiasing.
function layerTransparentInsideCircle(doc, circle) {
    var bufferedDia = circle.diameter_px * MASK_INNER_BUFFER;
    var res = { passed: false, ratio: 1, opaqueArea: 0, innerArea: 0, fallback: false };
    try { selectInnerEllipse(doc, circle.cx_px, circle.cy_px, bufferedDia); }
    catch (e) { return res; }
    var m1 = measureOrApprox(doc);
    res.innerArea = m1.area;
    if (m1.fallback) res.fallback = true;
    if (res.innerArea <= 0) {
        try { doc.selection.deselect(); } catch (e1) {}
        return res;
    }
    try { selectInnerEllipse(doc, circle.cx_px, circle.cy_px, bufferedDia); }
    catch (e2) { try { doc.selection.deselect(); } catch (e3) {} return res; }
    var threwEmpty = false;
    try { intersectSelectionWithLayerTransparency(doc); }
    catch (e4) { threwEmpty = true; }
    if (!threwEmpty && !isSelectionEmpty(doc)) {
        var m2 = measureOrApprox(doc);
        res.opaqueArea = m2.area;
        if (m2.fallback) res.fallback = true;
    }
    try { doc.selection.deselect(); } catch (e6) {}
    res.ratio = res.opaqueArea / res.innerArea;
    res.passed = res.ratio <= MASK_INNER_OPAQUE_RATIO_MAX;
    return res;
}

// Per-layer cover detection — no global circle dependency. For each visible
// leaf: accept only an opaque square covering the canvas with a transparent
// centered circular hole. Each match carries its own inferred circle, so the
// caller can pick the largest to drive the export Ø.
// Returns array of [{ layer, name, path, pattern, circle, bbox }, ...]
// with a `.diagnostic` parallel list.
function detectMaskLayers(doc) {
    var result = [];
    var diagnostic = [];
    result.diagnostic = diagnostic;

    var prevActive = null;
    try { prevActive = doc.activeLayer; } catch (e) {}

    try {
        var leaves = [];
        collectVisibleLeaves(doc.layers, "", leaves);

        var docW = doc.width.as("px"), docH = doc.height.as("px");
        var minDocDim = Math.min(docW, docH);
        var dpi = doc.resolution;

        for (var i = 0; i < leaves.length; i++) {
            var entry = leaves[i];
            var L = entry.layer;
            var diag = { path: entry.path, name: L.name, kind: "?", passed: false, reason: "" };

            var k;
            try { k = L.kind; diag.kind = describeLayerKind(k); }
            catch (eK) { diag.reason = "kind unreadable"; diagnostic.push(diag); continue; }

            var kindOK = (k === LayerKind.NORMAL || k === LayerKind.SMARTOBJECT
                || k === LayerKind.SOLIDFILL || k === LayerKind.GRADIENTFILL
                || k === LayerKind.PATTERNFILL);
            if (!kindOK) {
                diag.reason = "kind not pixel/fill";
                diagnostic.push(diag);
                continue;
            }

            var step = "init";
            try {
                step = "set activeLayer";
                doc.activeLayer = L;

                step = "layerHasAnyTransparency";
                if (!layerHasAnyTransparency(doc)) {
                    diag.reason = "fully opaque (no transparency signal)";
                    try { doc.selection.deselect(); } catch (e0) {}
                    diagnostic.push(diag);
                    continue;
                }

                step = "getOpaqueAreaBounds";
                var ob = getOpaqueAreaBounds(doc);
                if (!ob) {
                    diag.reason = "no opaque pixels";
                    diagnostic.push(diag);
                    continue;
                }
                var ol = ob[0], ot = ob[1], or = ob[2], obot = ob[3];
                diag.opaqueBounds = [Math.round(ol), Math.round(ot), Math.round(or), Math.round(obot)];

                var w = or - ol, h = obot - ot;
                if (w <= 0 || h <= 0) {
                    diag.reason = "zero-size opaque bounds";
                    diagnostic.push(diag);
                    continue;
                }

                if (w < minDocDim * 0.1) {
                    diag.reason = "bbox too small (" + Math.round(w) + "×" + Math.round(h) + " px)";
                    diagnostic.push(diag);
                    continue;
                }

                var aspect = w / h;
                diag.aspect = aspect.toFixed(3);
                if (aspect < 0.95 || aspect > 1.05) {
                    diag.reason = "bbox not square (aspect " + diag.aspect + ")";
                    diagnostic.push(diag);
                    continue;
                }

                step = "measure opaque area";
                loadLayerTransparencyAsSelection(doc);
                var areaPx = 0;
                try { areaPx = measureSelectionPixelArea(doc); }
                catch (eA) { areaPx = approxSelectionPixelAreaByBounds(doc); }
                try { doc.selection.deselect(); } catch (eD) {}

                var fillRatio = areaPx / (w * h);
                diag.fillRatio = fillRatio.toFixed(3);

                var canvasW = doc.width.as("px"), canvasH = doc.height.as("px");
                var canvasArea = canvasW * canvasH;
                var bboxArea = w * h;
                var coversCanvas = bboxArea >= canvasArea * MASK_FRAME_BBOX_MIN_RATIO;
                if (!coversCanvas) {
                    diag.reason = "bbox does not cover canvas";
                    diagnostic.push(diag);
                    continue;
                }
                if (fillRatio < MASK_FRAME_FILL_MIN || fillRatio > MASK_FRAME_FILL_MAX) {
                    diag.reason = "fill " + diag.fillRatio
                        + " not frame-mask (" + MASK_FRAME_FILL_MIN + "–" + MASK_FRAME_FILL_MAX + ")";
                    diagnostic.push(diag);
                    continue;
                }

                var clippedW = Math.min(w, canvasW);
                var clippedH = Math.min(h, canvasH);
                var clippedArea = clippedW * clippedH;
                var holeArea = clippedArea - areaPx;
                var diaPx = holeArea > 0
                    ? 2 * Math.sqrt(holeArea / Math.PI)
                    : Math.min(w, h);
                var inferredCircle = {
                    cx_px: canvasW / 2,
                    cy_px: canvasH / 2,
                    r_px: diaPx / 2,
                    diameter_px: diaPx,
                    diameter_mm: diaPx / dpi * 25.4,
                    source: "frame-mask-bounds"
                };

                step = "verify transparent inside";
                var inner = layerTransparentInsideCircle(doc, inferredCircle);
                diag.innerOpaqueRatio = inner.ratio.toFixed(3);
                if (!inner.passed) {
                    diag.reason = "circle interior not transparent (opaque "
                        + diag.innerOpaqueRatio + ")";
                    diagnostic.push(diag);
                    continue;
                }

                step = "verify opaque outside";
                var outer = layerOpaqueOutsideCircle(doc, inferredCircle);
                diag.outerOpaqueRatio = outer.ratio.toFixed(3);
                if (!outer.passed) {
                    diag.reason = "outside circle not opaque enough (opaque "
                        + diag.outerOpaqueRatio + ")";
                    diagnostic.push(diag);
                    continue;
                }

                diag.pattern = "frame-mask";
                diag.passed = true;
                diag.reason = "PASS [frame-mask] aspect " + diag.aspect
                    + ", fill " + diag.fillRatio
                    + ", Ø " + Math.round(diaPx) + "px (" + inferredCircle.diameter_mm.toFixed(1) + " mm)";
                diagnostic.push(diag);
                result.push({
                    layer: L,
                    name: L.name,
                    path: entry.path,
                    pattern: "frame-mask",
                    circle: inferredCircle,
                    bbox: ob
                });
            } catch (loopErr) {
                diag.reason = "exception at step '" + step + "': " + loopErr.message;
                try { doc.selection.deselect(); } catch (e2) {}
                diagnostic.push(diag);
            }
        }
    } catch (outerErr) {
        try { doc.selection.deselect(); } catch (e3) {}
    }

    if (prevActive) {
        try { doc.activeLayer = prevActive; } catch (e) {}
    }
    return result;
}

// Map measured diameter (mm) to the nearest BC or MS catalog size.
// Ambiguous when measured falls between two catalog sizes and is within
// 15% of either — surface both so the user can pick.
function nearestCatalogDiameter(diameterMm, shape) {
    var list = (shape === "MS") ? MS_DIAMETERS_MM : BC_DIAMETERS_MM;
    var sorted = [];
    for (var i = 0; i < list.length; i++) sorted.push(list[i]);
    sorted.sort(function (a, b) { return a - b; });

    var nearest = sorted[0];
    var nearestDist = Math.abs(diameterMm - nearest);
    for (var j = 1; j < sorted.length; j++) {
        var d = Math.abs(diameterMm - sorted[j]);
        if (d < nearestDist) {
            nearestDist = d;
            nearest = sorted[j];
        }
    }

    var alternatives = [];
    for (var k = 0; k < sorted.length; k++) {
        if (sorted[k] === nearest) continue;
        var dist = Math.abs(diameterMm - sorted[k]);
        if (dist / sorted[k] < 0.15) alternatives.push(sorted[k]);
    }

    return {
        catalog_mm: nearest,
        alternatives_mm: alternatives,
        ambiguous: alternatives.length > 0
    };
}
