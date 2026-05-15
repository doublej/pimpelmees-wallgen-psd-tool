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

    // Single collective output dir per batch run — every TIFF + the log
    // land here, instead of leaving _export folders littered next to each
    // source PSD.
    var outputRoot = new Folder(folder.fsName + "/output");
    if (!outputRoot.exists) outputRoot.create();

    var results = [];
    for (var i = 0; i < psdFiles.length; i++) {
        var psdFile = psdFiles[i];
        var res = automodeProcessOne(psdFile, {
            shape: shape,
            diameterList: diameterList,
            bleedMm: bleedMm,
            outputRoot: outputRoot
        });
        res.file = psdFile.name;
        results.push(res);
    }

    writeAutomodeLog(outputRoot, results);

    var okCount = 0, skipCount = 0;
    for (var j = 0; j < results.length; j++) {
        if (results[j].ok) okCount++; else skipCount++;
    }
    alert("Automode klaar. OK: " + okCount + ", overgeslagen: " + skipCount
        + "\nOutput: " + outputRoot.fsName);
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
        ev_kv(events, "profile", "\"" + safeProfileName(working) + "\"");
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

    ev_section(events, "unlock");
    unlockAllLayersDeep(working.layers, events);
    app.activeDocument = working;

    // Canonical pipeline (shared with cirkelFlow + stepperFlow):
    //   detect → cover-cleanup (auto-hide all candidates here) → mode-finish → flatten.
    var sel = selectCirkelDetection(working, events);
    var detection = sel.detection;
    var maskCandidates = sel.maskCandidates;
    if (!detection) {
        ev_kv(events, "result", "none — reject");
        return { ok: false, reason: "geen cirkel/cover gedetecteerd" };
    }

    // Only auto-hide candidates close in size to the largest. Smaller
    // circular shapes (decorative medallions, badges, dots) are design
    // content the designer wants kept; auto-hiding everything circular
    // would silently delete them in batch runs. Threshold lives in
    // config.jsx so cirkel/stepper (interactive) flows keep showing all
    // candidates and the user opts in per-checkbox.
    var hideLayers = [];
    if (maskCandidates && maskCandidates.length > 0) {
        var largestPx = maskCandidates[0].circle.diameter_px;
        var minPx = largestPx * AUTO_HIDE_NEAR_LARGEST;
        for (var mi = 0; mi < maskCandidates.length; mi++) {
            var c = maskCandidates[mi];
            if (c.circle.diameter_px >= minPx) {
                hideLayers.push(c.layer);
            } else {
                ev_kv(events, "  keep", (c.path || c.layer.name)
                    + "  Ø=" + Math.round(c.circle.diameter_px) + " px"
                    + "  (< " + Math.round(minPx) + " px threshold — kept as design)");
            }
        }
    }
    applyCoverCleanup(working, hideLayers, events);
    applyModeFinishing(working, mode, events);
    applyFlatten(working, events);

    var abbreviation = inferAbbreviation(psdFile.name);
    // Collective output dir for the whole batch — supplied by
    // automodeFolder. Falls back to per-file _export dir for callers
    // that didn't pass one (e.g. future single-file invocations).
    var outputDir = opts.outputRoot
        ? opts.outputRoot.fsName
        : (psdFile.parent.fsName + "/" + psdFile.name.replace(/\.[^.]+$/, "") + "_export");

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
            "Mode: " + getColorModeName(working.mode) + "\nProfile: " + safeProfileName(working),
            dumpLayerVisibility(working.layers, ""))) return;

        var unlockedN = unlockAllLayersDeep(working.layers, null);
        app.activeDocument = working;
        if (!pauseStep("3. All layers unlocked",
            "Cleared lock flags on " + unlockedN + " layer(s).",
            dumpLayerVisibility(working.layers, ""))) return;

        // Same pipeline as cirkelFlow + automodeRunWorking — pauseStep
        // dialogs wrap each helper call so the designer can inspect state
        // between actions. Detection diagnostic is dumped from the
        // candidates' .diagnostic field for the per-leaf rejection trail.
        var sel = selectCirkelDetection(working, null);
        var maskCandidates = sel.maskCandidates;
        var detection = sel.detection;
        var diag = (maskCandidates && maskCandidates.diagnostic) ? maskCandidates.diagnostic : [];
        var candMsg = "Found " + (maskCandidates ? maskCandidates.length : 0) + " cover candidate(s).";
        if (maskCandidates && maskCandidates.length > 0) {
            candMsg += "\nCandidates (largest first):";
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

        applyCoverCleanup(working, confirm.hideLayers, null);
        if (!pauseStep("7. Cover cleanup (hide + removeHidden + discardMasks)",
            "Cover candidates hidden, hidden layers deleted, layer masks discarded.",
            dumpLayerVisibility(working.layers, ""))) return;

        applyModeFinishing(working, mode, null);
        if (!pauseStep("8. Profile finishing",
            "Mode: " + getColorModeName(working.mode) + "  Profile: " + safeProfileName(working),
            dumpLayerVisibility(working.layers, ""))) return;

        applyFlatten(working, null);
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
            "Profile: " + safeProfileName(iter),
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
var LOG_KEY_WIDTH = 14;
var LOG_INDENT = "    ";
var LOG_SUB_INDENT = "        ";

function writeAutomodeLog(folder, results) {
    var f = new File(folder.fsName + "/automode_log.txt");
    // ExtendScript File defaults to platform legacy on macOS:
    // ISO-8859 encoding + CR line terminators. That mangles ▸ / → / · in
    // log content and makes the file open as one giant line in modern
    // editors. Force UTF-8 + LF before opening.
    f.encoding = "UTF-8";
    f.lineFeed = "Unix";
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
