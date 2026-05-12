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

// Idempotent: no-op if already Grayscale. Assigns Gray Gamma 1.0 to satisfy
// the tool's ICC contract (wallgen ignores the profile but the tool insists).
function convertDuotoneToGrayscale(doc) {
    if (doc.mode !== DocumentMode.DUOTONE) {
        if (doc.mode === DocumentMode.GRAYSCALE) {
            assignGrayGamma(doc);
        }
        return;
    }
    doc.changeMode(ChangeMode.GRAYSCALE);
    assignGrayGamma(doc);
}

function assignGrayGamma(doc) {
    try {
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("null"), ref);
        desc.putString(stringIDToTypeID("profile"), NEW_DOC_GRAY_PROFILE);
        executeAction(stringIDToTypeID("assignProfile"), desc, DialogModes.NO);
    } catch (e) {}
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
