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
        return { profile: profile || "None", expected: EXPECTED_GRAY_ICC };
    }
    if (mode === DocumentMode.CMYK) {
        if (profile.indexOf(EXPECTED_CMYK_ICC) !== -1) return null;
        return { profile: profile || "None", expected: EXPECTED_CMYK_ICC };
    }

    return { profile: profile || "None", expected: "Grayscale (Dot Gain 20%) of CMYK (FOGRA39)" };
}

function showAllLayers(layers) {
    for (var i = 0; i < layers.length; i++) {
        layers[i].visible = true;
        if (layers[i].typename === "LayerSet") {
            showAllLayers(layers[i].layers);
        }
    }
}

function unlockBackground(doc) {
    try {
        var last = doc.layers[doc.layers.length - 1];
        if (last.isBackgroundLayer) last.isBackgroundLayer = false;
    } catch (e) {}
}
