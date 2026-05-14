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
        ev_section(events, "open");
        ev_kv(events, "file", psdFile.name);
        working = app.open(psdFile);
        ev_kv(events, "doc", describeDocOpen(working));
        ev_kv(events, "profile", "\"" + (working.colorProfileName || "None") + "\"");
        result = automodeRunWorking(working, psdFile, opts, events);
    } catch (e) {
        ev_error(events, e.message);
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
    var mode = working.mode;

    if (mode !== DocumentMode.DUOTONE
        && mode !== DocumentMode.GRAYSCALE
        && mode !== DocumentMode.CMYK) {
        ev_section(events, "reject");
        ev_kv(events, "reason", "unsupported mode " + getColorModeName(mode));
        return { ok: false, reason: "mode niet ondersteund: " + getColorModeName(mode) };
    }

    if (mode === DocumentMode.CMYK || mode === DocumentMode.GRAYSCALE) {
        var iccCheck = checkIccProfile(working);
        ev_section(events, "icc-check");
        if (!iccCheck) {
            ev_kv(events, "verdict", "match");
        } else if (iccCheck.wrongMode) {
            ev_kv(events, "verdict", "wrong mode");
            ev_kv(events, "got", iccCheck.profile);
            return { ok: false, reason: "ICC verkeerde mode: " + iccCheck.profile };
        } else {
            ev_kv(events, "verdict", "differs (will convert)");
            ev_kv(events, "got", "\"" + iccCheck.profile + "\"");
            ev_kv(events, "expected", "\"" + iccCheck.expected + "\"");
        }
    }

    if (mode === DocumentMode.DUOTONE) {
        ev_section(events, "duotone → grayscale");
        ev_kv(events, "from", iccSnapshot(working));
        convertDuotoneToGrayscale(working);
        ev_kv(events, "to", iccSnapshot(working));
    }

    unlockBackground(working);
    app.activeDocument = working;

    // Per-layer cover detection — each match carries its own inferred circle.
    // Largest-radius match drives the export Ø. Duotone is post-flatten so
    // detection won't find anything; fall back to detectCircle there.
    var detection = null;
    if (mode !== DocumentMode.DUOTONE && working.layers.length > 1) {
        var maskCandidates = detectMaskLayers(working);
        var candCount = (maskCandidates && maskCandidates.length) || 0;
        ev_section(events, "detect mask layers");
        ev_kv(events, "candidates", String(candCount));
        if (candCount > 0) {
            maskCandidates.sort(function (a, b) { return b.circle.r_px - a.circle.r_px; });
            detection = maskCandidates[0].circle;
            for (var mi = 0; mi < maskCandidates.length; mi++) {
                var pName = "";
                try { pName = maskCandidates[mi].path || maskCandidates[mi].layer.name; } catch (eN) {}
                ev_kv(events, "  hide", pName + "  Ø=" + Math.round(maskCandidates[mi].circle.diameter_px) + " px");
                try { maskCandidates[mi].layer.visible = false; } catch (e) {}
            }
        }
        var beforeCount = countLayersDeep(working.layers);
        removeHiddenLayersDeep(working, working.layers);
        ev_kv(events, "removeHidden", beforeCount + " → " + countLayersDeep(working.layers) + " layers");
        discardLayerMasksDeep(working, working.layers);
        ev_kv(events, "discardMasks", "done");
    }

    ev_section(events, "circle");
    if (!detection) {
        detection = detectCircle(working);
        if (detection) {
            ev_kv(events, "source", "composite fallback (no mask candidates)");
        }
    } else {
        ev_kv(events, "source", "largest mask candidate");
    }
    if (!detection) {
        ev_kv(events, "result", "none — reject");
        return { ok: false, reason: "geen cirkel/cover gedetecteerd" };
    }
    ev_kv(events, "diameter", Math.round(detection.diameter_px) + " px · " + detection.diameter_mm.toFixed(1) + " mm");

    if (mode === DocumentMode.GRAYSCALE) {
        ev_section(events, "finish (grayscale)");
        ev_kv(events, "from", iccSnapshot(working));
        assignGrayGamma(working);
        ev_kv(events, "assign", "→ \"" + NEW_DOC_GRAY_PROFILE + "\"");
        ev_kv(events, "to", iccSnapshot(working));
    } else if (mode === DocumentMode.CMYK) {
        var iccCheck2 = checkIccProfile(working);
        ev_section(events, "finish (CMYK)");
        ev_kv(events, "state", iccSnapshot(working));
        if (iccCheck2 && !iccCheck2.wrongMode) {
            ev_kv(events, "convert", "\"" + (working.colorProfileName || "None") + "\" → \"" + NEW_DOC_CMYK_PROFILE + "\"");
            ev_kv(events, "params", "intent=relativeColorimetric · BPC=true · dither=true");
            convertToFogra39(working);
            ev_kv(events, "to", iccSnapshot(working));
        } else {
            ev_kv(events, "convert", "skipped — already FOGRA39");
        }
    }

    ev_section(events, "flatten");
    try {
        working.flatten();
        ev_kv(events, "result", working.layers.length + " layer" + (working.layers.length === 1 ? "" : "s"));
    } catch (e) {
        ev_error(events, "flatten failed: " + e.message);
    }

    var abbreviation = inferAbbreviation(psdFile.name);
    var masterDir = psdFile.parent.fsName;
    var masterBase = psdFile.name.replace(/\.[^.]+$/, "");
    var outputDir = masterDir + "/" + masterBase + "_export";

    ev_section(events, "export");
    ev_kv(events, "abbrev", abbreviation);
    ev_kv(events, "shape", opts.shape);
    ev_kv(events, "bleed", opts.bleedMm + " mm");
    ev_kv(events, "outdir", outputDir);

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

// Layout constants — kv columns align inside a section, sub-iters indent
// one extra level. Total line width caps at LINE_WIDTH for the file
// banner so logs read well in TextEdit's default window.
var LOG_LINE_WIDTH = 78;
var LOG_KEY_WIDTH = 12;
var LOG_INDENT = "    ";
var LOG_SUB_INDENT = "        ";

function writeAutomodeLog(folder, results) {
    var f = new File(folder.fsName + "/automode_log.txt");
    if (!f.open("w")) return;

    var bar = repeatChar("=", LOG_LINE_WIDTH);
    f.writeln(bar);
    f.writeln("  Pimpelmees Wallgen automode");
    f.writeln("  " + (new Date()).toString());
    f.writeln(bar);
    f.writeln("");

    var okCount = 0, skipCount = 0;
    for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (r.ok) okCount++; else skipCount++;
        writeFileSection(f, r);
    }

    f.writeln(bar);
    f.writeln("  Totaal: " + results.length
        + "  ·  OK: " + okCount
        + "  ·  overgeslagen: " + skipCount);
    f.writeln(bar);
    f.close();
}

function writeFileSection(f, r) {
    var bar = repeatChar("-", LOG_LINE_WIDTH);
    var status = r.ok
        ? "OK    " + r.file + "  →  " + r.savedCount + " TIFF" + (r.savedCount === 1 ? "" : "s")
        : "SKIP  " + r.file + "  ·  " + r.reason;
    f.writeln(bar);
    f.writeln("  " + status);
    f.writeln(bar);

    var ev = r.events || [];
    var inSubheader = false;
    for (var j = 0; j < ev.length; j++) {
        var e = ev[j];
        if (typeof e === "string") {
            // Backwards-compat: any stray string event renders as info.
            f.writeln(LOG_INDENT + e);
            continue;
        }
        if (e.kind === "section") {
            inSubheader = false;
            f.writeln("");
            f.writeln("  ▸ " + e.title);
        } else if (e.kind === "subheader") {
            inSubheader = true;
            f.writeln("");
            f.writeln(LOG_INDENT + "• " + e.title);
        } else if (e.kind === "kv") {
            var indent = inSubheader ? LOG_SUB_INDENT : LOG_INDENT;
            f.writeln(indent + padRight(e.key, LOG_KEY_WIDTH) + e.value);
        } else if (e.kind === "info") {
            var indent2 = inSubheader ? LOG_SUB_INDENT : LOG_INDENT;
            f.writeln(indent2 + e.text);
        } else if (e.kind === "error") {
            var indent3 = inSubheader ? LOG_SUB_INDENT : LOG_INDENT;
            f.writeln(indent3 + "ERROR  " + e.text);
        } else if (e.kind === "blank") {
            f.writeln("");
        }
    }
    f.writeln("");
}
