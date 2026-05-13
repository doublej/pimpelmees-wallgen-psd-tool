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
    var profile = doc.colorProfileName || "";
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

function unlockBackground(doc) {
    try {
        var last = doc.layers[doc.layers.length - 1];
        if (last.isBackgroundLayer) last.isBackgroundLayer = false;
    } catch (e) {}
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

// Walk doc.layers recursively, collect visible leaf ArtLayers that could
// be a frame-mask candidate. Skip invisible layers/groups, background, and
// adjustment/text layers (only NORMAL + SMARTOBJECT pixel layers qualify).
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
        var k;
        try { k = L.kind; } catch (e) { continue; }
        if (k !== LayerKind.NORMAL && k !== LayerKind.SMARTOBJECT) continue;
        out.push({ layer: L, path: thisPath });
    }
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

// Find layers that look like a circle-frame mask: full-canvas bounds AND
// fully transparent inside a centred ellipse at 98% of the detected circle Ø.
// Returns [{ layer, name, path }, ...]. Empty when no candidates.
// Restores active layer + clears selection on every exit path.
function detectFrameMaskLayers(doc, circle) {
    var result = [];
    var prevActive = null;
    try { prevActive = doc.activeLayer; } catch (e) {}

    try {
        var leaves = [];
        collectVisibleLeaves(doc.layers, "", leaves);
        if (leaves.length === 0) return result;

        var tolPx = 2;
        var insetDia = circle.diameter_px * 0.98;

        for (var i = 0; i < leaves.length; i++) {
            var entry = leaves[i];
            var L = entry.layer;
            if (!layerCoversDoc(L, doc, tolPx)) continue;
            try {
                doc.activeLayer = L;

                // Filter out fully-opaque layers (mountain artwork, white
                // background fills). Without this, Intr against a no-transparency
                // layer behaves as if the result were empty and produces false
                // positives.
                if (!layerHasAnyTransparency(doc)) {
                    try { doc.selection.deselect(); } catch (e0) {}
                    continue;
                }

                selectInnerEllipse(doc, circle.cx_px, circle.cy_px, insetDia);
                var empty = false;
                try {
                    intersectSelectionWithLayerTransparency(doc);
                } catch (intersectErr) {
                    // Photoshop throws when the intersected result would be empty.
                    empty = true;
                }
                if (!empty) empty = isSelectionEmpty(doc);
                if (empty) {
                    result.push({ layer: L, name: L.name, path: entry.path });
                }
                try { doc.selection.deselect(); } catch (e1) {}
            } catch (loopErr) {
                try { doc.selection.deselect(); } catch (e2) {}
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
