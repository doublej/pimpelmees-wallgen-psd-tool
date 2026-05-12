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
