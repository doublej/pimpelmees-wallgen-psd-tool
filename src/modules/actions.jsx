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

// Idempotent: no-op if already Grayscale. Bakes duotone composite into a
// real gray channel.
//
// Path: Duotone → RGB → Grayscale.
//   Duotone → RGB renders the visible composite (curves + ink colors)
//     into actual RGB pixels. This step is always supported (older PS
//     blocks "Convert to Profile" on Duotone, but RGB mode flip works).
//   RGB → Grayscale collapses via luminance, so the rendered composite
//     survives the collapse.
// Direct Duotone → Grayscale would strip the curves and reveal the flat
// underlying channel — visibly lighter than the artist's composite.
function convertDuotoneToGrayscale(doc) {
    if (doc.mode === DocumentMode.GRAYSCALE) {
        assignGrayGamma(doc);
        return;
    }
    if (doc.mode !== DocumentMode.DUOTONE) return;
    unlockBackground(doc);
    doc.changeMode(ChangeMode.RGB);
    doc.changeMode(ChangeMode.GRAYSCALE);
    assignGrayGamma(doc);
}

function assignGrayGamma(doc) {
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    desc.putReference(charIDToTypeID("null"), ref);
    desc.putString(stringIDToTypeID("profile"), NEW_DOC_GRAY_PROFILE);
    executeAction(stringIDToTypeID("assignProfile"), desc, DialogModes.NO);
}

function assignCmykFogra39(doc) {
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    desc.putReference(charIDToTypeID("null"), ref);
    desc.putString(stringIDToTypeID("profile"), NEW_DOC_CMYK_PROFILE);
    executeAction(stringIDToTypeID("assignProfile"), desc, DialogModes.NO);
}

// Remap pixel values to FOGRA39. Used when a CMYK source carries a
// different working space (e.g. SWOP, ISO Coated v2) — collage prints
// must land in FOGRA39 numerically, not just be retagged.
function convertToFogra39(doc) {
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    desc.putReference(charIDToTypeID("null"), ref);
    // Destination key for convertToProfile is "T   " (T + 3 spaces),
    // NOT "profile" — that one is assignProfile's. Using the wrong key
    // makes Photoshop fail with "parameters for command 'Convert to
    // Profile' are not currently valid".
    desc.putString(charIDToTypeID("T   "), NEW_DOC_CMYK_PROFILE);
    desc.putEnumerated(charIDToTypeID("Inte"), charIDToTypeID("Inte"), charIDToTypeID("Rltv"));
    desc.putBoolean(charIDToTypeID("MpBl"), true);
    desc.putBoolean(charIDToTypeID("Dthr"), true);
    executeAction(stringIDToTypeID("convertToProfile"), desc, DialogModes.NO);
}

// Reassign the working profile per doc mode. Called per-iter in
// exportTiffSet so the saved TIFF carries the expected tag regardless
// of upstream resize/canvas operations.
function assignTargetProfile(doc) {
    if (doc.mode === DocumentMode.GRAYSCALE) {
        assignGrayGamma(doc);
    } else if (doc.mode === DocumentMode.CMYK) {
        assignCmykFogra39(doc);
    }
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

// MS drops 300 mm (sticker too small to need a dedicated input — wallgen
// scales from 1000 mm if needed). BC exports all four catalog diameters.
function batchDiameterList(shape) {
    var src = (shape === "MS") ? MS_DIAMETERS_MM : BC_DIAMETERS_MM;
    var out = [];
    for (var i = 0; i < src.length; i++) {
        if (shape === "MS" && src[i] === 300) continue;
        out.push(src[i]);
    }
    return out;
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
    var events = opts.events || null;

    var savedNames = [];
    for (var i = 0; i < diameterMmList.length; i++) {
        var targetMm = diameterMmList[i];
        var finalMm = targetMm + 2 * opts.bleedMm;
        if (events) events.push("iter target=" + targetMm + "mm final=" + finalMm + "mm (bleed " + opts.bleedMm + "mm)");
        var iter = opts.workingDoc.duplicate(opts.abbreviation + "_iter_" + targetMm);
        if (events) events.push("  duplicate → " + iter.name);
        try {
            resizeContentToDiameter(iter, opts.detection.diameter_px, finalMm);
            if (events) events.push("  resizeContentToDiameter detectedØ=" + Math.round(opts.detection.diameter_px) + "px → " + finalMm + "mm");
            fitCanvasToFinal(iter, finalMm);
            if (events) events.push("  fitCanvasToFinal " + finalMm + "×" + finalMm + "mm");
            assignTargetProfile(iter);
            if (events) events.push("  assignTargetProfile → " + (iter.colorProfileName || "None"));

            var fname = opts.abbreviation + "_" + opts.shape + "_" + padZero4(targetMm) + ".tif";
            var outFile = new File(outDir.fsName + "/" + fname);
            saveTiff(iter, outFile);
            if (events) events.push("  saveTiff → " + fname);
            savedNames.push(fname);
        } catch (e) {
            if (events) events.push("  ERROR iter " + targetMm + ": " + e.message);
            iter.close(SaveOptions.DONOTSAVECHANGES);
            throw e;
        }
        iter.close(SaveOptions.DONOTSAVECHANGES);
    }
    return savedNames;
}

// Walk the layer tree and delete every hidden layer (and any group that
// becomes empty as a result). Iterates in reverse so removal doesn't
// invalidate indices. Run pre-flatten to shrink the doc before resizes
// and per-iter duplicates — fewer layers = faster everything downstream.
function removeHiddenLayersDeep(doc, layers) {
    for (var i = layers.length - 1; i >= 0; i--) {
        var L = layers[i];
        if (L.typename === "LayerSet") {
            removeHiddenLayersDeep(doc, L.layers);
            if (!L.visible || L.layers.length === 0) {
                try { L.remove(); } catch (e) {}
            }
        } else if (!L.visible) {
            try { L.remove(); } catch (e) {}
        }
    }
}

// Delete (discard, don't apply) the active layer's pixel mask. Throws
// when there's no mask — caller's try/catch swallows that.
function discardActiveLayerMask() {
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), stringIDToTypeID("mask"));
    desc.putReference(charIDToTypeID("null"), ref);
    executeAction(charIDToTypeID("Dlt "), desc, DialogModes.NO);
}

// Walk visible layers/groups, discard any pixel layer mask. Skips hidden
// layers (they'll be dropped by flatten anyway) — important so the frame
// mask layer's own mask isn't touched on its way out. Called pre-flatten
// so design content under circular layer-masks survives. Wallgen applies
// the final cut mask downstream.
function discardLayerMasksDeep(doc, layers) {
    for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        if (!L.visible) continue;
        try {
            doc.activeLayer = L;
            discardActiveLayerMask();
        } catch (e) {}
        if (L.typename === "LayerSet") {
            discardLayerMasksDeep(doc, L.layers);
        }
    }
}

// Walk layer tree, hide every layer (groups + leaves). Background layers
// can't be hidden — they're caught by the try/catch and rely on the doc
// already being unlocked upstream.
function hideAllLayersDeep(layers) {
    for (var i = 0; i < layers.length; i++) {
        try { layers[i].visible = false; } catch (e) {}
        if (layers[i].typename === "LayerSet") {
            hideAllLayersDeep(layers[i].layers);
        }
    }
}

// Walk a "/"-split path through layer groups, set each ancestor + the
// target leaf to visible. Returns true on success.
function showLayerAndAncestors(layers, parts, depth) {
    for (var i = 0; i < layers.length; i++) {
        if (layers[i].name !== parts[depth]) continue;
        try { layers[i].visible = true; } catch (e) {}
        if (depth === parts.length - 1) return true;
        if (layers[i].typename !== "LayerSet") return false;
        return showLayerAndAncestors(layers[i].layers, parts, depth + 1);
    }
    return false;
}

// Per-candidate solo render: duplicate working doc once, downsize, then
// loop candidates toggling visibility + saving a PNG. Returns array of
// File objects parallel to candidates (or null entries on failure).
function renderMaskCandidateThumbnails(workingDoc, candidates) {
    if (!candidates || candidates.length === 0) return [];
    var result = [];
    var thumbDoc = null;
    var folder = null;
    var maxDim = 120;

    try {
        folder = new Folder(Folder.temp.fsName + "/wallgen_mask_thumbs_" + (new Date()).getTime());
        folder.create();

        thumbDoc = workingDoc.duplicate("__mask_thumb__");
        if (thumbDoc.mode === DocumentMode.CMYK) {
            thumbDoc.changeMode(ChangeMode.RGB);
        }

        var w = thumbDoc.width.as("px"), h = thumbDoc.height.as("px");
        var maxSide = w > h ? w : h;
        if (maxSide > maxDim) {
            var scale = maxDim / maxSide;
            thumbDoc.resizeImage(
                UnitValue(Math.round(w * scale), "px"),
                UnitValue(Math.round(h * scale), "px"),
                undefined, ResampleMethod.BICUBIC
            );
        }

        for (var ci = 0; ci < candidates.length; ci++) {
            var parts = candidates[ci].path.split("/");
            hideAllLayersDeep(thumbDoc.layers);
            var ok = showLayerAndAncestors(thumbDoc.layers, parts, 0);
            if (!ok) { result.push(null); continue; }

            var pngFile = new File(folder.fsName + "/cand_" + ci + ".png");
            try {
                var opts = new PNGSaveOptions();
                opts.compression = 9;
                opts.interlaced = false;
                thumbDoc.saveAs(pngFile, opts, true, Extension.LOWERCASE);
                result.push(pngFile);
            } catch (e) {
                result.push(null);
            }
        }
    } catch (outer) {
        while (result.length < candidates.length) result.push(null);
    }

    if (thumbDoc) {
        try { thumbDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
    }
    return result;
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
