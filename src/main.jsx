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
        iccProfile: doc.colorProfileName || "None"
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

    var shape = showShapePickerDialog();
    if (!shape) return;

    var working = originalDoc.duplicate(
        psdFile.name.replace(/\.[^.]+$/, "") + " (cirkel werkkopie)"
    );

    try {
        if (working.mode === DocumentMode.DUOTONE) {
            if (!showDuotoneNotice()) {
                working.close(SaveOptions.DONOTSAVECHANGES);
                return;
            }
            convertDuotoneToGrayscale(working);
        } else if (working.mode !== DocumentMode.GRAYSCALE) {
            alert("Dit bestand is niet Duotone of Grijswaarden (" + getColorModeName(working.mode)
                + ").\nConverteer eerst naar Grayscale of Duotone en probeer opnieuw.");
            working.close(SaveOptions.DONOTSAVECHANGES);
            return;
        } else {
            convertDuotoneToGrayscale(working); // ensures Gray Gamma 1.0 assigned
        }

        unlockBackground(working);
        if (working.layers.length > 1) working.mergeVisibleLayers();

        var detection = detectCircle(working);
        var detectedMm = detection ? detection.diameter_mm : null;
        var diameterPx = detection ? detection.diameter_px : null;

        var bleedMm = (shape === "MS") ? BLEED_MS : BLEED_BC;
        var diameterList = (shape === "MS") ? MS_DIAMETERS_MM : BC_DIAMETERS_MM;
        var chosenMm;

        if (!detection) {
            chosenMm = promptManualDiameter(shape);
            if (!chosenMm) { working.close(SaveOptions.DONOTSAVECHANGES); return; }
            // No detection → assume current canvas is sized to chosen Ø.
            diameterPx = Math.min(working.width.as("px"), working.height.as("px"));
        } else {
            var match = nearestCatalogDiameter(detectedMm, shape);
            if (match.ambiguous) {
                var candidates = [match.catalog_mm];
                for (var ai = 0; ai < match.alternatives_mm.length; ai++) {
                    candidates.push(match.alternatives_mm[ai]);
                }
                candidates.sort(function (a, b) { return a - b; });
                chosenMm = showAmbiguousPickerDialog(detectedMm, candidates);
                if (!chosenMm) { working.close(SaveOptions.DONOTSAVECHANGES); return; }
            } else {
                chosenMm = match.catalog_mm;
            }
        }

        var abbreviation = inferAbbreviation(psdFile.name);
        var masterDir = psdFile.parent.fsName;
        var masterBase = psdFile.name.replace(/\.[^.]+$/, "");
        var outputDir = masterDir + "/" + masterBase + "_export";

        var confirm = showCirkelConfirmDialog({
            fileName: psdFile.name,
            shape: shape,
            detectedMm: detectedMm != null ? detectedMm : chosenMm,
            bleedMm: bleedMm,
            abbreviation: abbreviation,
            diameterMmList: diameterList,
            outputDir: outputDir
        });
        if (!confirm) { working.close(SaveOptions.DONOTSAVECHANGES); return; }

        // Pre-scale working doc so detected Ø equals chosen catalog size.
        // Each export iteration then resizes from this baseline to its target.
        // Keep working doc at chosen Ø so detection.diameter_px maps cleanly.
        resizeContentToDiameter(working, diameterPx, chosenMm);
        var baselinePx = chosenMm / 25.4 * working.resolution;

        var saved = exportTiffSet(diameterList, {
            workingDoc: working,
            shape: shape,
            abbreviation: confirm.abbreviation,
            outputDir: outputDir,
            detection: { diameter_px: baselinePx },
            bleedMm: bleedMm
        });

        alert("Klaar — " + saved.length + " TIFF(s) opgeslagen in:\n" + outputDir);
    } catch (e) {
        alert("Fout tijdens cirkelverwerking:\n" + e.message);
    }

    try { working.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
}
