// main.jsx — Entry point and main conversion flow

var LOGO_FILE = findLogo();
var CURRENT_VERSION = readVersionFile();
var UPDATE_VERSION = readUpdateFile();

app.bringToFront();
showWelcome();

function main() {
    var result = pickDocument();
    if (!result) return;
    var originalDoc = result.doc;
    var psdFile = result.file;
    var doc = originalDoc.duplicate(psdFile.name.replace(/\.[^.]+$/, "") + " (export)");

    var bpc = getBitsPerChannel(doc.bitsPerChannel);

    var docInfo = {
        name: psdFile.name,
        psdSize: psdFile.length,
        widthPx: Math.round(doc.width.as("px")),
        heightPx: Math.round(doc.height.as("px")),
        dpi: Math.round(doc.resolution),
        bitsPerChannel: bpc,
        colorMode: getColorModeName(doc.mode),
        channels: doc.componentChannels.length,
        iccProfile: safeProfileName(doc)
    };
    docInfo.widthCm = (docInfo.widthPx / docInfo.dpi * 2.54).toFixed(1);
    docInfo.heightCm = (docInfo.heightPx / docInfo.dpi * 2.54).toFixed(1);

    var hiddenCount = countHiddenLayers(doc.layers);
    unlockBackground(doc);
    if (doc.layers.length > 1) {
        doc.mergeVisibleLayers();
    }

    var ooc = measureOutOfCanvas(doc);
    var semiTransparent = hasSemiTransparentPixels(doc);
    var iccIssue = checkIccProfile(doc);
    var dpiTooHigh = docInfo.dpi > EXPECTED_DPI;

    var choices = showPreviewDialog(docInfo, ooc, semiTransparent, iccIssue, dpiTooHigh, hiddenCount);
    if (!choices) {
        doc.close(SaveOptions.DONOTSAVECHANGES);
        return;
    }

    if (choices.trim && ooc.hasExcess) {
        doc.crop([UnitValue(0, "px"), UnitValue(0, "px"), doc.width, doc.height]);
    }
    if (choices.whiteBg) {
        addWhiteBackground(doc);
    }
    if (choices.downscale) {
        doc.resizeImage(undefined, undefined, EXPECTED_DPI, ResampleMethod.BICUBIC);
    }
    doc.flatten();

    var tiffDir = psdFile.parent.fsName;
    var tiffFile = new File(tiffDir + "/" + choices.filename + ".tif");
    saveTiff(doc, tiffFile);
    doc.close(SaveOptions.DONOTSAVECHANGES);

    alert("Opgeslagen: " + decodeURI(tiffFile.name));
}

function cirkelFlow() {
    var picked = pickDocument();
    if (!picked) return;
    var originalDoc = picked.doc;
    var psdFile = picked.file;

    var layoutChoice = showLayoutSameDialog();
    if (!layoutChoice) return;

    var shape;
    var diameterList;
    if (layoutChoice === "same") {
        // Single largest output. Wallgen scales down for smaller variants.
        shape = "BC";
        diameterList = [BC_DIAMETERS_MM[BC_DIAMETERS_MM.length - 1]];
    } else {
        shape = showShapePickerDialog();
        if (!shape) return;
        diameterList = batchDiameterList(shape);
    }
    var bleedMm = (shape === "MS") ? BLEED_MS : BLEED_BC;

    // Work in place on the picked doc. Original on disk is never written
    // (we close with DONOTSAVECHANGES) so a duplicate just costs time.
    var working = originalDoc;

    // Tracks the pipeline stage so the catch can name where it broke.
    // The bare "e.message" alert used to collapse generic Photoshop
    // errors to "<no additional information available>".
    var step = "valideer kleurmodus";
    try {
        var mode = working.mode;
        if (mode !== DocumentMode.DUOTONE
            && mode !== DocumentMode.GRAYSCALE
            && mode !== DocumentMode.CMYK) {
            alert("Dit bestand is niet Duotone, Grijswaarden of CMYK ("
                + getColorModeName(mode)
                + ").\nConverteer eerst naar Grayscale, Duotone of CMYK en probeer opnieuw.");
            working.close(SaveOptions.DONOTSAVECHANGES);
            return;
        }

        var cmykIssueAtStart = null;
        if (mode === DocumentMode.CMYK) {
            cmykIssueAtStart = checkIccProfile(working);
            if (cmykIssueAtStart && cmykIssueAtStart.wrongMode) {
                alert("ICC verkeerde mode: " + cmykIssueAtStart.profile);
                working.close(SaveOptions.DONOTSAVECHANGES);
                return;
            }
            if (cmykIssueAtStart) {
                if (!showCmykProfileNotice(cmykIssueAtStart.profile)) {
                    working.close(SaveOptions.DONOTSAVECHANGES);
                    return;
                }
            }
        }

        // Duotone changeMode flattens the doc, so the conversion must run
        // before mask detection (those files lose per-layer detection).
        if (mode === DocumentMode.DUOTONE) {
            if (!showDuotoneNotice()) {
                working.close(SaveOptions.DONOTSAVECHANGES);
                return;
            }
            step = "Duotone → grijswaarden";
            convertDuotoneToGrayscale(working);
        }

        step = "ontgrendel lagen";
        unlockAllLayersDeep(working.layers, null);
        app.activeDocument = working;

        // Canonical pipeline (shared with automodeRunWorking + stepperFlow).
        // cirkelFlow's only divergence: the user picks which candidates to
        // hide via showDemoMaskConfirmDialog, plus a manual-diameter
        // fallback when detection finds nothing.
        step = "detecteer cirkel / masker";
        var sel = selectCirkelDetection(working, null);
        var detection = sel.detection;
        var maskCandidates = sel.maskCandidates;
        var diameterPx;
        if (!detection) {
            var fallbackMm = promptManualDiameter(shape);
            if (!fallbackMm) { working.close(SaveOptions.DONOTSAVECHANGES); return; }
            diameterPx = Math.min(working.width.as("px"), working.height.as("px"));
            detection = {
                cx_px: working.width.as("px") / 2,
                cy_px: working.height.as("px") / 2,
                r_px: diameterPx / 2,
                diameter_px: diameterPx,
                diameter_mm: fallbackMm,
                source: "manual"
            };
        } else {
            diameterPx = detection.diameter_px;
        }

        step = "render maskervoorbeelden";
        var maskThumbnails = renderMaskCandidateThumbnails(working, maskCandidates);

        var abbreviation = inferAbbreviation(psdFile.name);
        var masterDir = psdFile.parent.fsName;
        var masterBase = psdFile.name.replace(/\.[^.]+$/, "");
        var outputDir = masterDir + "/" + masterBase + "_export";

        // Dialog is type "dialog" (app-modal) — Photoshop blocks all canvas
        // input while it's open, so the user cannot poke the working doc.
        // That's why we no longer draw overlay rings or embed cropped PNG
        // previews: there's nothing the user can verify-against by clicking,
        // and the values shown in the dialog already describe the cut.
        step = "bevestigingsdialoog";
        var confirm = showDemoMaskConfirmDialog({
            shape: shape,
            bleedMm: bleedMm,
            abbreviation: abbreviation,
            diameterMmList: diameterList,
            outputDir: outputDir,
            detection: detection,
            maskCandidates: maskCandidates,
            maskThumbnails: maskThumbnails
        });
        if (!confirm) { working.close(SaveOptions.DONOTSAVECHANGES); return; }

        step = "verwijder cover-lagen";
        applyCoverCleanup(working, confirm.hideLayers, null);
        step = "kleurmodus afronden";
        applyModeFinishing(working, mode, null);
        step = "platslaan";
        applyFlatten(working, null);

        step = "TIFF('s) exporteren";
        var saved = exportTiffSet(diameterList, {
            workingDoc: working,
            shape: shape,
            abbreviation: confirm.abbreviation,
            outputDir: outputDir,
            detection: { diameter_px: diameterPx },
            bleedMm: bleedMm
        });

        alert("Klaar — " + saved.length + " TIFF(s) opgeslagen in:\n" + outputDir);
    } catch (e) {
        alert("Fout tijdens cirkelverwerking (stap: " + step + "):\n" + formatError(e));
    }

    try { working.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
}
