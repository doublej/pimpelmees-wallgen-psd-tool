// automode.jsx — Batch (silent) cirkel-flow runner
//
// Designer picks folder + shape + layout ONCE; every PSD/PSB walks
// through the cirkel pipeline without dialogs. Files that need a human
// decision are skipped and listed in automode_log.txt + an end-of-run alert.

function automodeFolder() {
    var folder = Folder.selectDialog("Kies map met cirkel-PSD/PSBs");
    if (!folder) return;

    var shape = showShapePickerDialog();
    if (!shape) return;

    var layoutChoice = showLayoutSameDialog();
    if (!layoutChoice) return;

    var diameterList;
    if (layoutChoice === "same") {
        diameterList = [BC_DIAMETERS_MM[BC_DIAMETERS_MM.length - 1]];
    } else {
        diameterList = batchDiameterList(shape);
    }
    var bleedMm = (shape === "MS") ? BLEED_MS : BLEED_BC;

    var psdFiles = folder.getFiles(automodeIsPsdOrPsb);
    if (!psdFiles || psdFiles.length === 0) {
        alert("Geen PSD/PSB-bestanden gevonden in:\n" + folder.fsName);
        return;
    }

    var results = [];
    for (var i = 0; i < psdFiles.length; i++) {
        var psdFile = psdFiles[i];
        var res = automodeProcessOne(psdFile, {
            shape: shape,
            diameterList: diameterList,
            bleedMm: bleedMm
        });
        res.file = psdFile.name;
        results.push(res);
    }

    writeAutomodeLog(folder, results);

    var okCount = 0, skipCount = 0;
    for (var j = 0; j < results.length; j++) {
        if (results[j].ok) okCount++; else skipCount++;
    }
    alert("Automode klaar. OK: " + okCount + ", overgeslagen: " + skipCount
        + "\nLog: automode_log.txt");
}

function automodeIsPsdOrPsb(f) {
    if (f instanceof Folder) return false;
    return /\.(psd|psb)$/i.test(f.name);
}

// Open + dispatch + always close without saving. No duplicate of the source
// — the original on disk is never written, so working in place is safe.
// Every mutation gets pushed onto `events` so the log captures the full
// per-file pipeline, not just the final outcome.
function automodeProcessOne(psdFile, opts) {
    var working = null;
    var events = [];
    var result;
    try {
        events.push("open " + psdFile.name);
        working = app.open(psdFile);
        events.push("opened mode=" + getColorModeName(working.mode)
            + " profile=\"" + (working.colorProfileName || "None") + "\""
            + " size=" + Math.round(working.width.as("px")) + "×" + Math.round(working.height.as("px")) + "px"
            + " dpi=" + Math.round(working.resolution)
            + " bits=" + working.bitsPerChannel
            + " layers=" + working.layers.length);
        result = automodeRunWorking(working, psdFile, opts, events);
    } catch (e) {
        events.push("ERROR " + e.message);
        result = { ok: false, reason: "fout: " + e.message };
    }
    if (working) {
        try { working.close(SaveOptions.DONOTSAVECHANGES); } catch (e1) {}
    }
    result.events = events;
    return result;
}

// Silent equivalent of cirkelFlow's per-doc body. Pipeline (efficiency
// order — mask removal first so subsequent flatten / resize / per-iter
// duplicates work on a slimmer doc):
//   1. detect mask + hide
//   2. delete all hidden layers
//   3. discard layer masks on remaining
//   4. mode finishing (profile / FOGRA39 convert) — deferred so detection
//      and white-sample checks run unaffected by color remap
//   5. flatten
//   6. exportTiffSet
// Duotone is the exception: changeMode flattens the doc, so its conversion
// must run before mask detection — those files lose per-layer detection.
function automodeRunWorking(working, psdFile, opts, events) {
    function log(s) { if (events) events.push(s); }
    var mode = working.mode;

    if (mode !== DocumentMode.DUOTONE
        && mode !== DocumentMode.GRAYSCALE
        && mode !== DocumentMode.CMYK) {
        log("reject mode=" + getColorModeName(mode));
        return { ok: false, reason: "mode niet ondersteund: " + getColorModeName(mode) };
    }

    if (mode === DocumentMode.CMYK) {
        var iccCheck = checkIccProfile(working);
        if (iccCheck && iccCheck.wrongMode) {
            log("reject ICC verkeerde mode: " + iccCheck.profile);
            return { ok: false, reason: "ICC verkeerde mode: " + iccCheck.profile };
        }
    }

    if (mode === DocumentMode.DUOTONE) {
        convertDuotoneToGrayscale(working);
        log("convertDuotoneToGrayscale → mode=" + getColorModeName(working.mode));
    }

    unlockBackground(working);
    log("unlockBackground");
    app.activeDocument = working;

    // Per-layer cover detection — each match carries its own inferred circle.
    // Largest-radius match drives the export Ø. Duotone is post-flatten so
    // detection won't find anything; fall back to detectCircle there.
    var detection = null;
    if (mode !== DocumentMode.DUOTONE && working.layers.length > 1) {
        var maskCandidates = detectMaskLayers(working);
        var candCount = (maskCandidates && maskCandidates.length) || 0;
        log("detectMaskLayers candidates=" + candCount);
        if (candCount > 0) {
            maskCandidates.sort(function (a, b) { return b.circle.r_px - a.circle.r_px; });
            detection = maskCandidates[0].circle;
            for (var mi = 0; mi < maskCandidates.length; mi++) {
                var pName = "";
                try { pName = maskCandidates[mi].path || maskCandidates[mi].layer.name; } catch (eN) {}
                log("  hide cover: " + pName + " Ø=" + Math.round(maskCandidates[mi].circle.diameter_px) + "px");
                try { maskCandidates[mi].layer.visible = false; } catch (e) {}
            }
        }
        var beforeCount = countLayersDeep(working.layers);
        removeHiddenLayersDeep(working, working.layers);
        log("removeHiddenLayersDeep " + beforeCount + " → " + countLayersDeep(working.layers) + " layers");
        discardLayerMasksDeep(working, working.layers);
        log("discardLayerMasksDeep");
    }
    if (!detection) {
        detection = detectCircle(working);
        if (detection) log("detectCircle fallback Ø=" + Math.round(detection.diameter_px) + "px (" + detection.diameter_mm.toFixed(1) + "mm)");
    } else {
        log("circle source=mask Ø=" + Math.round(detection.diameter_px) + "px (" + detection.diameter_mm.toFixed(1) + "mm)");
    }
    if (!detection) {
        log("reject geen cirkel/cover gedetecteerd");
        return { ok: false, reason: "geen cirkel/cover gedetecteerd" };
    }

    if (mode === DocumentMode.GRAYSCALE) {
        assignGrayGamma(working);
        log("assignGrayGamma → " + (working.colorProfileName || "None"));
    } else if (mode === DocumentMode.CMYK) {
        var iccCheck2 = checkIccProfile(working);
        if (iccCheck2 && !iccCheck2.wrongMode) {
            var fromProfile = working.colorProfileName || "None";
            convertToFogra39(working);
            log("convertToFogra39 from \"" + fromProfile + "\" → \"" + (working.colorProfileName || "None") + "\"");
        } else {
            log("ICC already FOGRA39 — no convert");
        }
    }

    try { working.flatten(); log("working.flatten layers=" + working.layers.length); } catch (e) { log("flatten ERROR: " + e.message); }

    var abbreviation = inferAbbreviation(psdFile.name);
    var masterDir = psdFile.parent.fsName;
    var masterBase = psdFile.name.replace(/\.[^.]+$/, "");
    var outputDir = masterDir + "/" + masterBase + "_export";
    log("abbreviation=" + abbreviation + " outputDir=" + outputDir);

    var saved = exportTiffSet(opts.diameterList, {
        workingDoc: working,
        shape: opts.shape,
        abbreviation: abbreviation,
        outputDir: outputDir,
        detection: { diameter_px: detection.diameter_px },
        bleedMm: opts.bleedMm,
        events: events
    });

    return { ok: true, savedCount: saved.length };
}

// Counts every layer in the tree (groups + leaves). Used purely for log
// before/after diffs so designers can see what removeHiddenLayersDeep ate.
function countLayersDeep(layers) {
    var n = 0;
    for (var i = 0; i < layers.length; i++) {
        n++;
        if (layers[i].typename === "LayerSet") {
            n += countLayersDeep(layers[i].layers);
        }
    }
    return n;
}

// Single-file debug runner. Pauses between every action with a dialog
// showing what just happened + current layer visibility tree. Pick "Stop"
// at any pause to bail. Uses BC + largest catalog Ø to keep it to one TIFF.
function stepperFlow() {
    var f = File.openDialog("Stepper — selecteer PSD/PSB", "*.psd;*.psb");
    if (!f) return;

    var shape = "BC";
    var targetMm = BC_DIAMETERS_MM[BC_DIAMETERS_MM.length - 1];
    var bleedMm = BLEED_BC;

    var working = null;
    var iter = null;

    try {
        working = app.open(f);
        if (!pauseStep("1. Source opened (working in place — no duplicate)",
            "File: " + f.name + "\nMode: " + getColorModeName(working.mode),
            dumpLayerVisibility(working.layers, ""))) return;

        var mode = working.mode;
        if (mode !== DocumentMode.DUOTONE && mode !== DocumentMode.GRAYSCALE && mode !== DocumentMode.CMYK) {
            alert("Mode niet ondersteund: " + getColorModeName(mode));
            return;
        }
        if (mode === DocumentMode.CMYK) {
            var iccCheck = checkIccProfile(working);
            if (iccCheck && iccCheck.wrongMode) {
                alert("ICC verkeerde mode: " + iccCheck.profile);
                return;
            }
        }
        if (mode === DocumentMode.DUOTONE) {
            convertDuotoneToGrayscale(working);
        }
        if (!pauseStep("2. Mode validated (conversion deferred to step 8)",
            "Mode: " + getColorModeName(working.mode) + "\nProfile: " + (working.colorProfileName || "None"),
            dumpLayerVisibility(working.layers, ""))) return;

        unlockBackground(working);
        app.activeDocument = working;
        if (!pauseStep("3. Background unlocked", "", dumpLayerVisibility(working.layers, ""))) return;

        var maskCandidates = detectMaskLayers(working);
        var diag = (maskCandidates && maskCandidates.diagnostic) ? maskCandidates.diagnostic : [];
        var candMsg = "Found " + (maskCandidates ? maskCandidates.length : 0) + " cover candidate(s).";
        if (maskCandidates && maskCandidates.length > 0) {
            candMsg += "\nCandidates (largest first):";
            maskCandidates.sort(function (a, b) { return b.circle.r_px - a.circle.r_px; });
            for (var ci = 0; ci < maskCandidates.length; ci++) {
                var c = maskCandidates[ci];
                candMsg += "\n  ✓ " + c.path + "  Ø=" + Math.round(c.circle.diameter_px) + "px";
            }
        }
        var diagDump = "Per-leaf detection result (" + diag.length + " visible leaves checked):\n";
        for (var di = 0; di < diag.length; di++) {
            var e = diag[di];
            diagDump += (e.passed ? "[PASS] " : "[skip] ")
                + "[" + e.kind + "] " + e.path
                + (e.reason ? "  — " + e.reason : "") + "\n";
        }
        if (!pauseStep("4. detectMaskLayers", candMsg, diagDump)) return;

        var detection = (maskCandidates && maskCandidates.length > 0)
            ? maskCandidates[0].circle : null;
        if (!detection) detection = detectCircle(working);
        if (!detection) {
            alert("Geen cirkel/cover gedetecteerd — stoppen.");
            return;
        }
        if (!pauseStep("5. Circle inferred",
            "Doc: " + Math.round(working.width.as("px")) + " × " + Math.round(working.height.as("px")) + " px @ " + Math.round(working.resolution) + " DPI"
            + "\nSource: " + (detection.source || "auto")
            + "\nØ=" + Math.round(detection.diameter_px) + "px  (" + detection.diameter_mm.toFixed(1) + " mm)"
            + "\ncx=" + Math.round(detection.cx_px) + "  cy=" + Math.round(detection.cy_px),
            dumpLayerVisibility(working.layers, ""))) return;

        var maskThumbnails = renderMaskCandidateThumbnails(working, maskCandidates);
        var abbreviation = inferAbbreviation(f.name);
        var masterDir = f.parent.fsName;
        var masterBase = f.name.replace(/\.[^.]+$/, "");
        var outputDir = masterDir + "/" + masterBase + "_stepper";

        var confirm = showDemoMaskConfirmDialog({
            shape: shape,
            bleedMm: bleedMm,
            abbreviation: abbreviation,
            diameterMmList: [targetMm],
            outputDir: outputDir,
            detection: detection,
            maskCandidates: maskCandidates,
            maskThumbnails: maskThumbnails
        });
        if (!confirm) return;
        abbreviation = confirm.abbreviation || abbreviation;
        var hideMsg = "User chose to hide " + (confirm.hideLayers ? confirm.hideLayers.length : 0) + " layer(s).";
        if (!pauseStep("6. Mask confirm dialog", hideMsg,
            dumpLayerVisibility(working.layers, ""))) return;

        if (confirm.hideLayers && confirm.hideLayers.length > 0) {
            for (var mi = 0; mi < confirm.hideLayers.length; mi++) {
                var hideName = "";
                try { hideName = confirm.hideLayers[mi].name; } catch (eN) {}
                try { confirm.hideLayers[mi].visible = false; } catch (e) {}
                if (!pauseStep("7." + (mi + 1) + " Layer hidden",
                    "Hidden: " + hideName,
                    dumpLayerVisibility(working.layers, ""))) return;
            }
        }

        removeHiddenLayersDeep(working, working.layers);
        if (!pauseStep("7b. Hidden layers removed",
            "All hidden layers (masks + artist-hidden) deleted.",
            dumpLayerVisibility(working.layers, ""))) return;

        discardLayerMasksDeep(working, working.layers);
        if (!pauseStep("7c. Layer masks discarded",
            "discardLayerMasksDeep ran on all visible layers/groups.",
            dumpLayerVisibility(working.layers, ""))) return;

        if (mode === DocumentMode.GRAYSCALE) {
            assignGrayGamma(working);
        } else if (mode === DocumentMode.CMYK) {
            var iccCheck2 = checkIccProfile(working);
            if (iccCheck2 && !iccCheck2.wrongMode) {
                convertToFogra39(working);
            }
        }
        if (!pauseStep("8. Profile finishing",
            "Mode: " + getColorModeName(working.mode) + "  Profile: " + (working.colorProfileName || "None"),
            dumpLayerVisibility(working.layers, ""))) return;

        try { working.flatten(); } catch (e) {}
        if (!pauseStep("9. working.flatten()",
            "Layers after flatten: " + working.layers.length,
            dumpLayerVisibility(working.layers, ""))) return;

        var finalMm = targetMm + 2 * bleedMm;
        var outDir = new Folder(outputDir);
        if (!outDir.exists) outDir.create();

        iter = working.duplicate(abbreviation + "_iter_" + targetMm);
        if (!pauseStep("10. iter duplicated (only the export copy — not the source)",
            "iter from flattened working.",
            dumpLayerVisibility(iter.layers, ""))) return;

        resizeContentToDiameter(iter, detection.diameter_px, finalMm);
        if (!pauseStep("11. resizeContentToDiameter",
            "Scaled so detected Ø → " + finalMm + " mm.",
            dumpLayerVisibility(iter.layers, ""))) return;

        fitCanvasToFinal(iter, finalMm);
        if (!pauseStep("12. fitCanvasToFinal",
            "Canvas: " + finalMm + " × " + finalMm + " mm (square).",
            dumpLayerVisibility(iter.layers, ""))) return;

        assignTargetProfile(iter);
        if (!pauseStep("13. assignTargetProfile",
            "Profile: " + (iter.colorProfileName || "None"),
            dumpLayerVisibility(iter.layers, ""))) return;

        var fname = abbreviation + "_" + shape + "_" + padZero4(targetMm) + ".tif";
        var outFile = new File(outDir.fsName + "/" + fname);
        saveTiff(iter, outFile);
        pauseStep("14. TIFF saved",
            "Saved: " + outFile.fsName,
            dumpLayerVisibility(iter.layers, ""));
    } catch (e) {
        alert("Stepper fout: " + e.message);
    }

    if (iter) try { iter.close(SaveOptions.DONOTSAVECHANGES); } catch (e1) {}
    if (working) try { working.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
}

function writeAutomodeLog(folder, results) {
    var f = new File(folder.fsName + "/automode_log.txt");
    if (!f.open("w")) return;
    f.writeln("Pimpelmees Wallgen automode — " + (new Date()).toString());
    f.writeln("");

    var okCount = 0, skipCount = 0;
    for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var status = r.ok
            ? "OK   " + r.file + " — " + r.savedCount + " TIFF(s)"
            : "SKIP " + r.file + " — " + r.reason;
        f.writeln("=== " + status + " ===");
        var ev = r.events || [];
        for (var j = 0; j < ev.length; j++) {
            f.writeln("  " + ev[j]);
        }
        f.writeln("");
        if (r.ok) okCount++; else skipCount++;
    }

    f.writeln("---");
    f.writeln("Totaal: " + results.length
        + " | OK: " + okCount
        + " | overgeslagen: " + skipCount);
    f.close();
}
