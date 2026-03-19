// ui-newdoc.jsx — New document dialog

function padZero(n, len) {
    var s = String(n);
    while (s.length < len) s = "0" + s;
    return s;
}

function sizeLabels(values, prefix, padLen, mmFn) {
    var labels = [];
    for (var i = 0; i < values.length; i++) {
        var mm = mmFn ? mmFn(values[i]) : values[i];
        labels.push(prefix + padZero(values[i], padLen) + " \u2014 " + (mm / 10).toFixed(1) + " cm");
    }
    return labels;
}

function showNewDocDialog() {
    var strokeMm = function (s) { return s / 10 * STROKE_W_MM; };
    var bcLabels = sizeLabels(BC_DIAMETERS_MM, "D_", 4, null);
    var msLabels = sizeLabels(MS_DIAMETERS_MM, "D_", 4, null);
    var dlWLabels = sizeLabels(DL_STROKES, "W_", 3, strokeMm);

    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "center"];
    dlg.margins = [36, 30, 36, 24];
    dlg.spacing = 4;
    dlg.preferredSize = [420, -1];

    addLogo(dlg);
    addSpacer(dlg, 6);

    var title = dlg.add("statictext", undefined, "Nieuw document aanmaken");
    title.alignment = ["center", "top"];
    title.graphics.font = ScriptUI.newFont("dialog", "Bold", 16);

    addSpacer(dlg, 8);
    addDivider(dlg);
    addSpacer(dlg, 8);

    // Color mode
    var colorLbl = dlg.add("statictext", undefined, "Kleurmodus");
    colorLbl.graphics.font = ScriptUI.newFont("dialog", "Bold", 12);
    var colorGrp = dlg.add("group");
    colorGrp.orientation = "column";
    colorGrp.alignChildren = ["left", "top"];
    colorGrp.spacing = 4;
    var monoRb = colorGrp.add("radiobutton", undefined, "Monotoon (grijswaarden)");
    var colorRb = colorGrp.add("radiobutton", undefined, "Kleur (CMYK)");
    monoRb.value = true;

    addSpacer(dlg, 6);

    // Shape
    var shapeLbl = dlg.add("statictext", undefined, "Vorm");
    shapeLbl.graphics.font = ScriptUI.newFont("dialog", "Bold", 12);
    var shapeNames = [
        "Behang \u2014 rechthoek",
        "Behangcirkel",
        "Muursticker \u2014 cirkel",
        "Behangboog",
        "Drieluik"
    ];
    var shapeDd = dlg.add("dropdownlist", undefined, shapeNames);
    shapeDd.selection = 0;

    addSpacer(dlg, 6);

    // Size groups (show/hide per shape)
    var sizeCt = dlg.add("group");
    sizeCt.orientation = "column";
    sizeCt.alignChildren = ["fill", "top"];
    sizeCt.spacing = 4;

    // 0: Rectangle — always max size with guides
    var rectGrp = sizeCt.add("group");
    rectGrp.orientation = "column";
    rectGrp.alignChildren = ["fill", "top"];
    rectGrp.spacing = 4;
    var rectInfo = rectGrp.add("statictext", undefined,
        "Maximaal formaat met hulplijnen op alle breedtes en hoogtes");
    rectInfo.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);

    // 1: Behangcirkel
    var bcGrp = sizeCt.add("group");
    bcGrp.orientation = "column";
    bcGrp.alignChildren = ["fill", "top"];
    bcGrp.spacing = 4;
    bcGrp.add("statictext", undefined, "Diameter").graphics.font = ScriptUI.newFont("dialog", "Bold", 11);
    var bcDd = bcGrp.add("dropdownlist", undefined, bcLabels);
    bcDd.selection = 0;
    bcGrp.visible = false;

    // 2: Muursticker
    var msGrp = sizeCt.add("group");
    msGrp.orientation = "column";
    msGrp.alignChildren = ["fill", "top"];
    msGrp.spacing = 4;
    msGrp.add("statictext", undefined, "Diameter").graphics.font = ScriptUI.newFont("dialog", "Bold", 11);
    var msDd = msGrp.add("dropdownlist", undefined, msLabels);
    msDd.selection = 0;
    msGrp.visible = false;

    // 3: Behangboog
    var arcGrp = sizeCt.add("group");
    arcGrp.orientation = "column";
    arcGrp.alignChildren = ["fill", "top"];
    arcGrp.spacing = 4;
    var arcTxt = arcGrp.add("statictext", undefined,
        "Vast formaat: 906 \u00D7 1756 mm (900 \u00D7 1750 + 3 mm afloop)");
    arcTxt.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);
    arcGrp.visible = false;

    // 4: Drieluik
    var dlGrp = sizeCt.add("group");
    dlGrp.orientation = "column";
    dlGrp.alignChildren = ["fill", "top"];
    dlGrp.spacing = 4;
    dlGrp.add("statictext", undefined, "Breedte").graphics.font = ScriptUI.newFont("dialog", "Bold", 11);
    var dlWDd = dlGrp.add("dropdownlist", undefined, dlWLabels);
    dlWDd.selection = 0;
    var dlHTxt = dlGrp.add("statictext", undefined, "Hoogte: 200 cm (vast)");
    dlHTxt.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);
    dlGrp.visible = false;

    var sizeGroups = [rectGrp, bcGrp, msGrp, arcGrp, dlGrp];

    addSpacer(dlg, 8);
    addDivider(dlg);
    addSpacer(dlg, 6);

    // Preview
    var prevPx = dlg.add("statictext", undefined, "");
    prevPx.graphics.font = ScriptUI.newFont("dialog", "Bold", 12);
    var prevCm = dlg.add("statictext", undefined, "");
    prevCm.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);
    var prevIcc = dlg.add("statictext", undefined, "");
    prevIcc.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);

    addSpacer(dlg, 8);
    addDivider(dlg);
    addSpacer(dlg, 8);

    // Buttons
    var btnRow = dlg.add("group");
    btnRow.alignment = ["fill", "top"];
    btnRow.spacing = 10;
    var createBtn = btnRow.add("button", undefined, "Aanmaken", { name: "ok" });
    createBtn.alignment = ["fill", "top"];
    createBtn.preferredSize = [-1, 36];
    var cancelBtn = btnRow.add("button", undefined, "Annuleren", { name: "cancel" });
    cancelBtn.preferredSize = [110, 36];

    // --- Update logic ---
    function ddIdx(dd) { return dd.selection ? dd.selection.index : 0; }

    function getDimsMm() {
        var si = ddIdx(shapeDd);
        var d;
        switch (si) {
            case 0: return {
                w: RECT_STROKES[RECT_STROKES.length - 1] / 10 * STROKE_W_MM + 2 * BLEED_RECT,
                h: RECT_HEIGHTS_MM[RECT_HEIGHTS_MM.length - 1]
            };
            case 1:
                d = BC_DIAMETERS_MM[ddIdx(bcDd)] + 2 * BLEED_BC;
                return { w: d, h: d };
            case 2:
                d = MS_DIAMETERS_MM[ddIdx(msDd)] + 2 * BLEED_MS;
                return { w: d, h: d };
            case 3: return {
                w: ARC_W_MM + 2 * BLEED_ARC,
                h: ARC_H_MM + 2 * BLEED_ARC
            };
            case 4: return {
                w: DL_STROKES[ddIdx(dlWDd)] / 10 * STROKE_W_MM + 2 * BLEED_DL,
                h: DL_HEIGHT_MM + 2 * BLEED_DL
            };
        }
    }

    function updatePreview() {
        var si = ddIdx(shapeDd);
        for (var i = 0; i < sizeGroups.length; i++) sizeGroups[i].visible = (i === si);
        var dims = getDimsMm();
        var wPx = mmToPx(dims.w);
        var hPx = mmToPx(dims.h);
        prevPx.text = wPx + " \u00D7 " + hPx + " px";
        prevCm.text = (dims.w / 10).toFixed(1) + " \u00D7 " + (dims.h / 10).toFixed(1)
            + " cm @ " + EXPECTED_DPI + " DPI";
        prevIcc.text = "Profiel: " + (monoRb.value ? NEW_DOC_GRAY_PROFILE : NEW_DOC_CMYK_PROFILE);
        dlg.layout.layout(true);
    }

    shapeDd.onChange = updatePreview;
    monoRb.onClick = updatePreview;
    colorRb.onClick = updatePreview;
    bcDd.onChange = updatePreview;
    msDd.onChange = updatePreview;
    dlWDd.onChange = updatePreview;

    updatePreview();

    if (dlg.show() !== 1) return;

    // Build document name
    var si = ddIdx(shapeDd);
    var shapeCodes = ["WP", "BC", "MS", "BB", "DL"];
    var docName = "pimpelmees_" + shapeCodes[si];
    if (si === 1) {
        docName += "_D" + padZero(BC_DIAMETERS_MM[ddIdx(bcDd)], 4);
    } else if (si === 2) {
        docName += "_D" + padZero(MS_DIAMETERS_MM[ddIdx(msDd)], 4);
    } else if (si === 4) {
        docName += "_W" + padZero(DL_STROKES[ddIdx(dlWDd)], 3);
    }

    var dims = getDimsMm();
    try {
        var doc = createNewDocument(mmToPx(dims.w), mmToPx(dims.h), monoRb.value, docName);
        if (si === 0) addRectGuides(doc);
    } catch (e) {
        alert("Document aanmaken mislukt:\n" + e.message);
    }
}
