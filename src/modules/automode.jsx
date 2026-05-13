// automode.jsx — Batch (silent) cirkel-flow runner
//
// Designer picks folder + shape + layout ONCE; every PSD walks through
// the cirkel pipeline without dialogs. Files that need a human decision
// are skipped and listed in automode_log.txt + an end-of-run alert.

function automodeFolder() {
    var folder = Folder.selectDialog("Kies map met cirkel-PSDs");
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

    var psdFiles = folder.getFiles(automodeIsPsd);
    if (!psdFiles || psdFiles.length === 0) {
        alert("Geen PSD-bestanden gevonden in:\n" + folder.fsName);
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

function automodeIsPsd(f) {
    if (f instanceof Folder) return false;
    return /\.psd$/i.test(f.name);
}

// Open + duplicate + dispatch. Always closes both docs on exit. Returns
// {ok: true, savedCount: N} or {ok: false, reason: "..."}.
function automodeProcessOne(psdFile, opts) {
    var originalDoc = null;
    var working = null;
    var result;
    try {
        originalDoc = app.open(psdFile);
        working = originalDoc.duplicate(
            psdFile.name.replace(/\.[^.]+$/, "") + " (cirkel werkkopie)"
        );
        result = automodeRunWorking(working, psdFile, opts);
    } catch (e) {
        result = { ok: false, reason: "fout: " + e.message };
    }
    if (working) {
        try { working.close(SaveOptions.DONOTSAVECHANGES); } catch (e1) {}
    }
    if (originalDoc) {
        try { originalDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
    }
    return result;
}

// Silent equivalent of cirkelFlow's per-doc body. Every prompt in the
// interactive flow becomes either an auto-action (Duotone → Grayscale,
// non-FOGRA39 CMYK → convert, mask candidates → hide) or a skip.
function automodeRunWorking(working, psdFile, opts) {
    if (working.mode === DocumentMode.DUOTONE
        || working.mode === DocumentMode.GRAYSCALE) {
        convertDuotoneToGrayscale(working);
    } else if (working.mode === DocumentMode.CMYK) {
        var iccIssue = checkIccProfile(working);
        if (iccIssue && iccIssue.wrongMode) {
            return { ok: false, reason: "ICC verkeerde mode: " + iccIssue.profile };
        }
        if (iccIssue) {
            convertToFogra39(working);
        }
    } else {
        return {
            ok: false,
            reason: "mode niet ondersteund: " + getColorModeName(working.mode)
        };
    }

    unlockBackground(working);
    app.activeDocument = working;

    var detection = detectCircle(working);
    if (!detection) {
        return { ok: false, reason: "geen cirkel gedetecteerd" };
    }
    var diameterPx = detection.diameter_px;

    var maskCandidates = detectFrameMaskLayers(working, detection);
    if (maskCandidates && maskCandidates.length > 0) {
        for (var mi = 0; mi < maskCandidates.length; mi++) {
            try { maskCandidates[mi].layer.visible = false; } catch (e) {}
        }
    }

    // flatten() handles single-visible-layer case (mergeVisible errors
    // with <2 visible). Mirrors cirkelFlow().
    try { working.flatten(); } catch (e) {}

    var abbreviation = inferAbbreviation(psdFile.name);
    var masterDir = psdFile.parent.fsName;
    var masterBase = psdFile.name.replace(/\.[^.]+$/, "");
    var outputDir = masterDir + "/" + masterBase + "_export";

    var saved = exportTiffSet(opts.diameterList, {
        workingDoc: working,
        shape: opts.shape,
        abbreviation: abbreviation,
        outputDir: outputDir,
        detection: { diameter_px: diameterPx },
        bleedMm: opts.bleedMm
    });

    return { ok: true, savedCount: saved.length };
}

function writeAutomodeLog(folder, results) {
    var f = new File(folder.fsName + "/automode_log.txt");
    if (!f.open("w")) return;
    f.writeln("Pimpelmees Wallgen automode — " + (new Date()).toString());
    f.writeln("---");
    var okCount = 0, skipCount = 0;
    for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (r.ok) {
            okCount++;
            f.writeln("OK   " + r.file + " — " + r.savedCount + " TIFF(s)");
        } else {
            skipCount++;
            f.writeln("SKIP " + r.file + " — " + r.reason);
        }
    }
    f.writeln("---");
    f.writeln("Totaal: " + results.length
        + " | OK: " + okCount
        + " | overgeslagen: " + skipCount);
    f.close();
}
