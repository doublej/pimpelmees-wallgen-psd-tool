// actions.jsx — Document modifications and system actions

function addWhiteBackground(doc) {
    var bgLayer = doc.artLayers.add();
    bgLayer.name = "White BG";
    bgLayer.move(doc.activeLayer, ElementPlacement.PLACEAFTER);
    doc.activeLayer = bgLayer;
    doc.selection.selectAll();
    var white = new SolidColor();
    white.rgb.red = 255;
    white.rgb.green = 255;
    white.rgb.blue = 255;
    doc.selection.fill(white);
    doc.selection.deselect();
}

function runAutoUpdate() {
    var appName = SCRIPT_NAME;

    // Resolve the .app bundle path from the script location
    var scriptDir = new File($.fileName).parent.fsName;
    var appDir = scriptDir;
    if (scriptDir.indexOf(".app/") !== -1) {
        appDir = scriptDir.replace(/\.app\/.*/, ".app/..");
    }

    var marker = "/tmp/pimpelmees-update-ok";
    var esc = function (s) { return s.replace(/'/g, "'\\''"); };
    var cmd = "rm -f '" + marker + "'"
        + " && TMPDIR=$(mktemp -d)"
        + " && curl -sfL --max-time 30 -o \"$TMPDIR/update.zip\""
        + " 'https://github.com/" + GITHUB_REPO + "/releases/latest/download/" + appName.replace(/ /g, ".") + ".zip'"
        + " && rm -rf '" + esc(appDir) + "/" + esc(appName) + ".app'"
        + " && ditto -x -k \"$TMPDIR/update.zip\" '" + esc(appDir) + "'"
        + " && rm -rf \"$TMPDIR\""
        + " && touch '" + marker + "'";

    app.system(cmd);

    var ok = new File(marker);
    if (ok.exists) {
        ok.remove();
        try {
            var f = new File("/tmp/pimpelmees-psd-tool-update.txt");
            if (f.exists) f.remove();
        } catch (e) {}
        alert("Update naar v" + UPDATE_VERSION + " gelukt!\n\nOpen de app opnieuw om de nieuwe versie te gebruiken.");
    } else {
        alert("Update mislukt.\n\nProbeer het later opnieuw of download handmatig:\nhttps://github.com/" + GITHUB_REPO + "/releases/latest");
    }
}

function addRectGuides(doc) {
    var docW = RECT_STROKES[RECT_STROKES.length - 1] / 10 * STROKE_W_MM + 2 * BLEED_RECT;
    var docH = RECT_HEIGHTS_MM[RECT_HEIGHTS_MM.length - 1];
    var cx = docW / 2;
    // Vertical guides: symmetric pair for each stroke width, centred
    for (var i = 0; i < RECT_STROKES.length; i++) {
        var halfW = RECT_STROKES[i] / 10 * STROKE_W_MM / 2;
        doc.guides.add(Direction.VERTICAL, UnitValue(mmToPx(cx - halfW), "px"));
        doc.guides.add(Direction.VERTICAL, UnitValue(mmToPx(cx + halfW), "px"));
    }
    // Horizontal guides: heights measured from bottom (skip max = canvas edge)
    for (var i = 0; i < RECT_HEIGHTS_MM.length - 1; i++) {
        doc.guides.add(Direction.HORIZONTAL, UnitValue(mmToPx(docH - RECT_HEIGHTS_MM[i]), "px"));
    }
}

// Fills the bleed annulus (outer disk minus inner disk) with translucent
// black on a fresh layer. Reads as one obvious "this strip gets trimmed off"
// band instead of two thin rings that visually collapse together.
function drawBleedAnnulus(doc, cxPx, cyPx, rOuterPx, rInnerPx, layerName) {
    var layer = doc.artLayers.add();
    layer.name = layerName;
    doc.activeLayer = layer;

    selectCircleAt(doc, cxPx, cyPx, rOuterPx);
    fillSelectionBlack();
    selectCircleAt(doc, cxPx, cyPx, rInnerPx);
    try { doc.selection.clear(); } catch (e) {}
    try { doc.selection.deselect(); } catch (e) {}

    try { layer.opacity = 50; } catch (e) {}
    try { app.refresh(); } catch (e) {}
    return layer;
}

// Thin solid ring on a fresh layer. Used to mark the cut line crisply on top
// of the annulus fill so the user sees exactly where the trim lands.
function drawCircleRing(doc, cxPx, cyPx, rPx, layerName, ringWPx) {
    var ringW = ringWPx || Math.max(6, Math.round(rPx / 250));
    var layer = doc.artLayers.add();
    layer.name = layerName;
    doc.activeLayer = layer;

    selectCircleAt(doc, cxPx, cyPx, rPx + ringW / 2);
    fillSelectionBlack();
    selectCircleAt(doc, cxPx, cyPx, rPx - ringW / 2);
    try { doc.selection.clear(); } catch (e) {}
    try { doc.selection.deselect(); } catch (e) {}
    try { app.refresh(); } catch (e) {}
    return layer;
}

// Rectangular marquee — used for the copy-merged crop preview.
function selectRectangleAt(doc, leftPx, topPx, rightPx, bottomPx) {
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
    desc.putReference(charIDToTypeID("null"), ref);
    var bounds = new ActionDescriptor();
    bounds.putUnitDouble(charIDToTypeID("Top "), charIDToTypeID("#Pxl"), topPx);
    bounds.putUnitDouble(charIDToTypeID("Left"), charIDToTypeID("#Pxl"), leftPx);
    bounds.putUnitDouble(charIDToTypeID("Btom"), charIDToTypeID("#Pxl"), bottomPx);
    bounds.putUnitDouble(charIDToTypeID("Rght"), charIDToTypeID("#Pxl"), rightPx);
    desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Rctn"), bounds);
    executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
}

// Copy-merge a region from `doc` into a new small doc, downsize, save as
// PNG. Used to embed live previews in the ScriptUI confirm dialog so the
// user can verify cut-line + annulus alignment without zooming the locked
// canvas.
function exportRegionPng(doc, leftPx, topPx, rightPx, bottomPx, maxDimPx, pngPath) {
    leftPx = Math.max(0, Math.round(leftPx));
    topPx = Math.max(0, Math.round(topPx));
    rightPx = Math.min(doc.width.as("px"), Math.round(rightPx));
    bottomPx = Math.min(doc.height.as("px"), Math.round(bottomPx));
    if (rightPx - leftPx < 2 || bottomPx - topPx < 2) return null;

    selectRectangleAt(doc, leftPx, topPx, rightPx, bottomPx);
    try {
        executeAction(charIDToTypeID("CpyM"), undefined, DialogModes.NO);
    } catch (e) {
        try { doc.selection.deselect(); } catch (er) {}
        return null;
    }
    try { doc.selection.deselect(); } catch (e) {}

    var w = rightPx - leftPx;
    var h = bottomPx - topPx;
    var mode = (doc.mode === DocumentMode.GRAYSCALE) ? NewDocumentMode.GRAYSCALE : NewDocumentMode.RGB;

    var newDoc;
    try {
        newDoc = app.documents.add(
            UnitValue(w, "px"), UnitValue(h, "px"),
            doc.resolution, "__cirkel_preview",
            mode, DocumentFill.WHITE, 1, BitsPerChannelType.EIGHT
        );
    } catch (e) { return null; }

    try { executeAction(charIDToTypeID("past"), undefined, DialogModes.NO); } catch (e) {}
    try { newDoc.flatten(); } catch (e) {}

    var scale = maxDimPx / Math.max(w, h);
    if (scale < 1) {
        try {
            newDoc.resizeImage(
                UnitValue(Math.round(w * scale), "px"),
                UnitValue(Math.round(h * scale), "px"),
                72, ResampleMethod.BICUBIC
            );
        } catch (e) {}
    }

    var pngFile = new File(pngPath);
    var opts = new PNGSaveOptions();
    opts.compression = 9;
    opts.interlaced = false;
    try { newDoc.saveAs(pngFile, opts, true); } catch (e) {}
    newDoc.close(SaveOptions.DONOTSAVECHANGES);

    app.activeDocument = doc;
    return pngFile;
}

// Returns array of { file, label } for embedding in the confirm dialog.
// Three previews: full circle thumbnail + two zoomed views on opposite
// edges of the cut line so user can spot off-centre detection.
function buildCirkelPreviews(doc, detection, cutRPx, tempDir) {
    var folder = new Folder(tempDir);
    if (!folder.exists) folder.create();
    var previews = [];

    var fullPng = exportRegionPng(
        doc, 0, 0,
        doc.width.as("px"), doc.height.as("px"),
        300, tempDir + "/cirkel_full.png"
    );
    if (fullPng && fullPng.exists) previews.push({ file: fullPng, label: "Volledig" });

    var bandW = detection.r_px - cutRPx;
    var size = Math.max(bandW * 10, 800);
    var midR = (detection.r_px + cutRPx) / 2;
    var halfSize = size / 2;

    // Right edge of cut line
    var rightPng = exportRegionPng(
        doc,
        detection.cx_px + midR - halfSize,
        detection.cy_px - halfSize,
        detection.cx_px + midR + halfSize,
        detection.cy_px + halfSize,
        420, tempDir + "/cirkel_right.png"
    );
    if (rightPng && rightPng.exists) previews.push({ file: rightPng, label: "Rechts ingezoomd" });

    // Top edge of cut line
    var topPng = exportRegionPng(
        doc,
        detection.cx_px - halfSize,
        detection.cy_px - midR - halfSize,
        detection.cx_px + halfSize,
        detection.cy_px - midR + halfSize,
        420, tempDir + "/cirkel_top.png"
    );
    if (topPng && topPng.exists) previews.push({ file: topPng, label: "Boven ingezoomd" });

    return previews;
}

function cleanupPreviews(previews) {
    if (!previews) return;
    for (var i = 0; i < previews.length; i++) {
        try { previews[i].file.remove(); } catch (e) {}
    }
}

function fillSelectionBlack() {
    try {
        var desc = new ActionDescriptor();
        desc.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("FlCn"), charIDToTypeID("Blck"));
        desc.putUnitDouble(charIDToTypeID("Opct"), charIDToTypeID("#Prc"), 100);
        desc.putEnumerated(charIDToTypeID("Md  "), charIDToTypeID("BlnM"), charIDToTypeID("Nrml"));
        executeAction(charIDToTypeID("Fl  "), desc, DialogModes.NO);
    } catch (e) {}
}

function removeOverlay(layer) {
    if (!layer) return;
    try { layer.remove(); } catch (e) {}
    try { app.refresh(); } catch (e) {}
}

// Elliptical marquee selection in px. Kept for internal use by drawCircleRing.
function selectCircleAt(doc, cxPx, cyPx, rPx) {
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
    desc.putReference(charIDToTypeID("null"), ref);
    var bounds = new ActionDescriptor();
    bounds.putUnitDouble(charIDToTypeID("Top "), charIDToTypeID("#Pxl"), cyPx - rPx);
    bounds.putUnitDouble(charIDToTypeID("Left"), charIDToTypeID("#Pxl"), cxPx - rPx);
    bounds.putUnitDouble(charIDToTypeID("Btom"), charIDToTypeID("#Pxl"), cyPx + rPx);
    bounds.putUnitDouble(charIDToTypeID("Rght"), charIDToTypeID("#Pxl"), cxPx + rPx);
    desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Elps"), bounds);
    executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
}

// Idempotent: no-op if already Grayscale. Bakes duotone composite into a
// real gray channel calibrated to Gray Gamma 1.0.
//
// Why convertToProfile instead of changeMode(GRAYSCALE):
// Duotone stores ONE underlying gray channel + per-ink curves applied at
// render time. changeMode(GRAYSCALE) discards the curves and exposes the
// raw channel — visibly lighter/flatter than what the artist designed.
// convertToProfile(Gray Gamma 1.0) renders the duotone composite (curves
// + ink colors + dot-gain working space) through the colour engine and
// writes the result back as a single gray channel in the target profile.
// Mode flips to GRAYSCALE as a side effect; tone survives.
function convertDuotoneToGrayscale(doc) {
    if (doc.mode === DocumentMode.GRAYSCALE) {
        assignGrayGamma(doc);
        return;
    }
    if (doc.mode !== DocumentMode.DUOTONE) return;
    unlockBackground(doc);
    convertToProfile(doc, NEW_DOC_GRAY_PROFILE);
    assignGrayGamma(doc);
}

function convertToProfile(doc, profileName) {
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    desc.putReference(charIDToTypeID("null"), ref);
    desc.putString(stringIDToTypeID("profile"), profileName);
    desc.putEnumerated(stringIDToTypeID("intent"), stringIDToTypeID("colorConversionType"), stringIDToTypeID("relativeColorimetric"));
    desc.putBoolean(stringIDToTypeID("mapBlack"), true);
    desc.putBoolean(stringIDToTypeID("dither"), true);
    desc.putBoolean(stringIDToTypeID("flatten"), true);
    executeAction(stringIDToTypeID("convertToProfile"), desc, DialogModes.NO);
}

function assignGrayGamma(doc) {
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    desc.putReference(charIDToTypeID("null"), ref);
    desc.putString(stringIDToTypeID("profile"), NEW_DOC_GRAY_PROFILE);
    executeAction(stringIDToTypeID("assignProfile"), desc, DialogModes.NO);
}

// Resample whole document so detectedDiameterPx becomes targetDiameterMm.
// Canvas resizes proportionally with the content.
function resizeContentToDiameter(doc, detectedDiameterPx, targetDiameterMm) {
    var dpi = doc.resolution;
    var targetDiameterPx = targetDiameterMm / 25.4 * dpi;
    var scale = targetDiameterPx / detectedDiameterPx;
    var newW = doc.width.as("px") * scale;
    var newH = doc.height.as("px") * scale;
    doc.resizeImage(UnitValue(newW, "px"), UnitValue(newH, "px"), dpi, ResampleMethod.BICUBIC);
}

// After content is scaled, force canvas to exactly finalMm square, centred.
// Source canvas may be larger (crop) or smaller (white fill) than the design
// circle — final canvas == detected-circle Ø + nothing, because bleed lives
// INSIDE that circle. Cut line will sit at finalMm − 2 × bleed (the catalog Ø).
function fitCanvasToFinal(doc, finalMm) {
    var finalPx = mmToPx(finalMm);
    var prevBg = app.backgroundColor;
    var white = new SolidColor();
    white.rgb.red = 255;
    white.rgb.green = 255;
    white.rgb.blue = 255;
    app.backgroundColor = white;
    try {
        doc.resizeCanvas(UnitValue(finalPx, "px"), UnitValue(finalPx, "px"), AnchorPosition.MIDDLECENTER);
    } catch (e) {}
    app.backgroundColor = prevBg;
    try { doc.flatten(); } catch (e) {}
}

// Strip suffixes like _color, _zwart, _bron, _DEF, _plat, _02 + extension.
function inferAbbreviation(fileName) {
    var base = fileName.replace(/\.[^.]+$/, "");
    // Repeatedly strip known suffix tokens.
    var changed = true;
    while (changed) {
        changed = false;
        var stripped = base.replace(
            /(_color|_colour|_zwart|_bron|_DEF|_def|_plat|_cirkel|_02|_01|_v2|_v1|[ ]*kopie[ \d]*)$/,
            ""
        );
        if (stripped !== base) {
            base = stripped;
            changed = true;
        }
    }
    return base;
}

// Per-target loop. Re-duplicates working doc per iteration so each export
// starts from the same source state.
//
// Bleed lives INSIDE the detected circle. Detected circle Ø → final canvas Ø
// (= catalog Ø + 2 × bleed). The cut line sits at catalog Ø, centred inside
// the canvas, leaving a bleed annulus that protects the cut.
//
// opts: { workingDoc, shape (BC|MS), abbreviation, outputDir,
//         detection: {diameter_px}, bleedMm }.
function exportTiffSet(diameterMmList, opts) {
    var outDir = new Folder(opts.outputDir);
    if (!outDir.exists) outDir.create();

    var savedNames = [];
    for (var i = 0; i < diameterMmList.length; i++) {
        var targetMm = diameterMmList[i];
        var finalMm = targetMm + 2 * opts.bleedMm;
        var iter = opts.workingDoc.duplicate(opts.abbreviation + "_iter_" + targetMm);
        try {
            resizeContentToDiameter(iter, opts.detection.diameter_px, finalMm);
            fitCanvasToFinal(iter, finalMm);
            assignGrayGamma(iter);

            var fname = opts.abbreviation + "_" + opts.shape + "_" + padZero4(targetMm) + ".tif";
            var outFile = new File(outDir.fsName + "/" + fname);
            saveTiff(iter, outFile);
            savedNames.push(fname);
        } catch (e) {
            iter.close(SaveOptions.DONOTSAVECHANGES);
            throw e;
        }
        iter.close(SaveOptions.DONOTSAVECHANGES);
    }
    return savedNames;
}

function createNewDocument(widthPx, heightPx, isMono, docName) {
    var mode = isMono ? NewDocumentMode.GRAYSCALE : NewDocumentMode.CMYK;
    var profile = isMono ? NEW_DOC_GRAY_PROFILE : NEW_DOC_CMYK_PROFILE;
    var doc = app.documents.add(
        UnitValue(widthPx, "px"), UnitValue(heightPx, "px"),
        EXPECTED_DPI, docName, mode,
        DocumentFill.WHITE, 1, BitsPerChannelType.EIGHT, profile
    );
    var expected = isMono ? EXPECTED_GRAY_ICC : EXPECTED_CMYK_ICC;
    if (doc.colorProfileName.indexOf(expected) === -1) {
        alert("Let op: ICC-profiel \"" + profile + "\" niet gevonden.\n\n"
            + "Huidig profiel: " + doc.colorProfileName + "\n"
            + "Wijs het juiste profiel handmatig toe via:\n"
            + "Bewerken > Profiel toewijzen...");
    }
    return doc;
}
