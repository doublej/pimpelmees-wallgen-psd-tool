// ui-preview.jsx — Preview and convert dialog

function showPreviewDialog(di, ooc, semiTransparent, iccIssue, dpiTooHigh) {
    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = [28, 24, 28, 20];
    dlg.spacing = 6;
    dlg.preferredSize = [DLG_W, -1];

    // --- Header ---
    var header = dlg.add("statictext", undefined, di.name);
    header.alignment = ["left", "top"];
    header.graphics.font = ScriptUI.newFont("dialog", "Bold", 15);

    var dimLine = di.widthPx + " \u00D7 " + di.heightPx + " px"
        + "    " + di.widthCm + " \u00D7 " + di.heightCm + " cm"
        + "    " + di.dpi + " DPI";
    var dims = dlg.add("statictext", undefined, dimLine);
    dims.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);

    addSpacer(dlg, 4);
    addDivider(dlg);
    addSpacer(dlg, 4);

    // --- Source details (compact two-column) ---
    var srcGrid = dlg.add("group");
    srcGrid.orientation = "row";
    srcGrid.alignment = ["fill", "top"];
    srcGrid.spacing = 20;

    var col1 = srcGrid.add("group");
    col1.orientation = "column";
    col1.alignChildren = ["fill", "top"];
    col1.spacing = 4;
    addCompactRow(col1, "Bestandsgrootte", formatBytes(di.psdSize));
    addCompactRow(col1, "Kleurmodus", di.colorMode + " / " + di.bitsPerChannel + "-bit");

    var col2 = srcGrid.add("group");
    col2.orientation = "column";
    col2.alignChildren = ["fill", "top"];
    col2.spacing = 4;
    addCompactRow(col2, "ICC-profiel", di.iccProfile);

    addSpacer(dlg, 6);

    // --- Issues ---
    var trimCb = null;
    var whiteCb = null;
    var downscaleCb = null;
    var hasIssues = ooc.hasExcess || semiTransparent || iccIssue || dpiTooHigh;

    if (hasIssues) {
        var issuesPnl = dlg.add("panel", undefined, undefined, { borderStyle: "none" });
        issuesPnl.alignment = ["fill", "top"];
        issuesPnl.alignChildren = ["fill", "top"];
        issuesPnl.margins = [14, 10, 14, 10];
        issuesPnl.spacing = 8;
        issuesPnl.graphics.backgroundColor = issuesPnl.graphics.newBrush(
            issuesPnl.graphics.BrushType.SOLID_COLOR, [0.35, 0.25, 0.12]
        );

        if (ooc.hasExcess) {
            addWarning(issuesPnl, "Beelddata buiten canvas gevonden");
            var oocDesc = issuesPnl.add("statictext", undefined,
                "Lagen bevatten pixels die buiten het zichtbare canvas vallen. "
                + "Dit heeft geen invloed op de TIFF (die wordt altijd op canvasformaat "
                + "opgeslagen), maar bijsnijden voorkomt onverwachte randen bij "
                + "bewerkingen achteraf.", { multiline: true });
            oocDesc.alignment = ["fill", "top"];
            oocDesc.preferredSize = [-1, 50];
            oocDesc.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);
            trimCb = issuesPnl.add("checkbox", undefined, "  Bijsnijden tot canvasgrenzen");
            trimCb.value = true;
        }
        if (semiTransparent) {
            if (ooc.hasExcess) addSpacer(issuesPnl, 4);
            addWarning(issuesPnl, "Semi-transparante pixels gevonden");
            var stDesc = issuesPnl.add("statictext", undefined,
                "Het ontwerp bevat deels doorzichtige pixels. Bij drukwerk "
                + "kan dit onverwachte kleuren opleveren. Een witte achtergrond "
                + "maakt alle pixels volledig dekkend.", { multiline: true });
            stDesc.alignment = ["fill", "top"];
            stDesc.preferredSize = [-1, 40];
            stDesc.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);
            whiteCb = issuesPnl.add("checkbox", undefined, "  Witte achtergrond erachter plaatsen");
            whiteCb.value = true;
        }
        if (iccIssue) {
            if (ooc.hasExcess || semiTransparent) addSpacer(issuesPnl, 4);
            var iccMsg, iccHint;
            if (iccIssue.wrongMode) {
                iccMsg = "Niet-ondersteunde kleurmodus: " + iccIssue.profile;
                iccHint = "Alleen Grayscale en CMYK worden ondersteund. "
                    + "Converteer via Bewerken \u2192 Omzetten naar profiel naar "
                    + "Grayscale (Dot Gain 20%) of CMYK (FOGRA39) en probeer opnieuw.";
            } else {
                iccMsg = "Verkeerd ICC-profiel: " + iccIssue.profile;
                iccHint = "Verwacht profiel: " + iccIssue.expected + ". "
                    + "Converteer het document via Bewerken \u2192 Omzetten naar profiel naar "
                    + iccIssue.expected + " en probeer opnieuw.";
            }
            addWarning(issuesPnl, iccMsg);
            var iccDesc = issuesPnl.add("statictext", undefined, iccHint, { multiline: true });
            iccDesc.alignment = ["fill", "top"];
            iccDesc.preferredSize = [-1, 40];
            iccDesc.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);
        }
        if (dpiTooHigh) {
            if (ooc.hasExcess || semiTransparent || iccIssue) addSpacer(issuesPnl, 4);
            addWarning(issuesPnl, "Resolutie te hoog: " + di.dpi + " DPI");
            var dpiDesc = issuesPnl.add("statictext", undefined,
                "Wallgen verwacht " + EXPECTED_DPI + " DPI. Het document wordt "
                + "gedownscaled naar " + EXPECTED_DPI + " DPI bij opslaan.", { multiline: true });
            dpiDesc.alignment = ["fill", "top"];
            dpiDesc.preferredSize = [-1, 30];
            dpiDesc.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);
            downscaleCb = issuesPnl.add("checkbox", undefined,
                "  Downscalen naar " + EXPECTED_DPI + " DPI");
            downscaleCb.value = true;
        }

        addSpacer(dlg, 4);
    } else {
        var okPnl = dlg.add("panel", undefined, undefined, { borderStyle: "none" });
        okPnl.alignment = ["fill", "top"];
        okPnl.margins = [14, 8, 14, 8];
        okPnl.graphics.backgroundColor = okPnl.graphics.newBrush(
            okPnl.graphics.BrushType.SOLID_COLOR, [0.15, 0.30, 0.18]
        );
        var okTxt = okPnl.add("statictext", undefined, "\u2713  Geen problemen \u2014 klaar om te converteren");
        okTxt.alignment = ["center", "center"];
        okTxt.graphics.font = ScriptUI.newFont("dialog", "Bold", 12);
        okTxt.graphics.foregroundColor = okTxt.graphics.newPen(
            okTxt.graphics.PenType.SOLID_COLOR, [0.75, 1, 0.8], 1
        );

        addSpacer(dlg, 4);
    }

    addDivider(dlg);
    addSpacer(dlg, 6);

    // --- Output settings ---
    var outHeader = dlg.add("statictext", undefined, "TIFF-uitvoer");
    outHeader.graphics.font = ScriptUI.newFont("dialog", "Bold", 13);

    addSpacer(dlg, 4);

    var nameRow = dlg.add("group");
    nameRow.alignment = ["fill", "top"];
    nameRow.spacing = 10;
    var nameLbl = nameRow.add("statictext", undefined, "Bestandsnaam");
    nameLbl.preferredSize = [LABEL_W, -1];
    nameLbl.graphics.font = ScriptUI.newFont("dialog", "Bold", 12);
    var defaultName = toSnakeCase(di.name.replace(/\.psd$/i, ""));
    var nameInput = nameRow.add("edittext", undefined, defaultName);
    nameInput.alignment = ["fill", "center"];
    nameInput.preferredSize = [-1, 26];
    nameInput.addEventListener("blur", function () {
        nameInput.text = toSnakeCase(nameInput.text);
    });

    addSpacer(dlg, 4);

    var specLine = "LZW  \u2022  Samengevoegd  \u2022  Geen alpha  \u2022  "
        + di.bitsPerChannel + "-bit  \u2022  ICC behouden";
    var specs = dlg.add("statictext", undefined, specLine);
    specs.graphics.font = ScriptUI.newFont("dialog", "Regular", 10);

    addSpacer(dlg, 12);

    // --- Buttons ---
    var btns = dlg.add("group");
    btns.alignment = ["fill", "bottom"];
    btns.spacing = 10;
    btns.add("button", undefined, "Annuleren", { name: "cancel" });
    var spacer = btns.add("group");
    spacer.alignment = ["fill", "center"];
    var saveBtn = btns.add("button", undefined, "Opslaan als TIFF", { name: "ok" });
    saveBtn.preferredSize = [160, 34];
    if (iccIssue) saveBtn.enabled = false;

    if (dlg.show() !== 1) return null;

    var outName = nameInput.text.replace(/^\s+|\s+$/g, "");
    if (!outName) outName = defaultName;

    return {
        trim: trimCb ? trimCb.value : false,
        whiteBg: whiteCb ? whiteCb.value : false,
        downscale: downscaleCb ? downscaleCb.value : false,
        filename: outName
    };
}
