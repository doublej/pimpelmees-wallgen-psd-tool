// ui-cirkel.jsx — Cirkel-flow dialogs

// First fork in the flow. "same" → only the largest catalog Ø is exported
// (wallgen scales down for smaller variants). "different" → batch all sizes
// of the picked shape.
function showLayoutSameDialog() {
    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = [28, 24, 28, 20];
    dlg.spacing = 6;
    dlg.preferredSize = [460, -1];

    var header = dlg.add("statictext", undefined, "Is de lay-out hetzelfde voor alle maten?");
    header.graphics.font = ScriptUI.newFont("dialog", "Bold", 15);

    var hint = dlg.add("statictext", undefined,
        "Wallgen kan automatisch schalen als het ontwerp identiek is voor alle maten. "
        + "Verschilt het ontwerp per maat (bv. fijnere details op kleine stickers), "
        + "kies dan 'Verschillend'.", { multiline: true });
    hint.preferredSize = [-1, 56];
    hint.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);

    addSpacer(dlg, 6);

    var grp = dlg.add("group");
    grp.orientation = "column";
    grp.alignChildren = ["left", "top"];
    grp.spacing = 4;
    var sameRb = grp.add("radiobutton", undefined,
        "Hetzelfde — exporteer alleen de grootste cirkel (BC 237,5 cm)");
    var diffRb = grp.add("radiobutton", undefined,
        "Verschillend — kies vorm en exporteer alle maten");
    sameRb.value = true;

    addSpacer(dlg, 8);

    var btns = dlg.add("group");
    btns.alignment = ["fill", "bottom"];
    btns.add("button", undefined, "Annuleren", { name: "cancel" });
    var spacer = btns.add("group");
    spacer.alignment = ["fill", "center"];
    btns.add("button", undefined, "Volgende", { name: "ok" });

    if (dlg.show() !== 1) return null;
    return sameRb.value ? "same" : "different";
}

// Visual confirm: detected-circle marquee is already drawn on canvas.
// Dialog is parked top-left so the canvas stays visible.
function showCircleConfirmDialog(detection) {
    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = [28, 24, 28, 20];
    dlg.spacing = 6;
    dlg.preferredSize = [440, -1];

    var header = dlg.add("statictext", undefined, "Klopt de gevonden cirkel?");
    header.graphics.font = ScriptUI.newFont("dialog", "Bold", 15);

    var hint = dlg.add("statictext", undefined,
        "Op het canvas zie je een ovaal-selectie rond de cirkel die ik heb "
        + "gedetecteerd. Klopt de positie en grootte? Zo nee, annuleer en "
        + "pas het bronbestand aan (zorg dat de cirkel het grootste "
        + "niet-witte gebied is en ongeveer gecentreerd staat).",
        { multiline: true });
    hint.preferredSize = [-1, 80];
    hint.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);

    addSpacer(dlg, 4);
    var col = dlg.add("group");
    col.orientation = "column";
    col.alignChildren = ["fill", "top"];
    col.spacing = 4;
    addCompactRow(col, "Gemeten Ø",
        (detection.diameter_mm / 10).toFixed(1) + " cm "
        + "(" + Math.round(detection.diameter_px) + " px)");
    addCompactRow(col, "Midden",
        Math.round(detection.cx_px) + " × " + Math.round(detection.cy_px) + " px");

    addSpacer(dlg, 10);

    var btns = dlg.add("group");
    btns.alignment = ["fill", "bottom"];
    btns.add("button", undefined, "Annuleren", { name: "cancel" });
    var spacer = btns.add("group");
    spacer.alignment = ["fill", "center"];
    btns.add("button", undefined, "Ja, klopt", { name: "ok" });

    try { dlg.location = [40, 80]; } catch (e) {}
    return dlg.show() === 1;
}

// Instruction step. User must manually toggle off any layer masks that
// constrain artwork to the circle so the underlying design extends past
// the cut line and produces real bleed content.
function showDisableMasksDialog() {
    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = [28, 24, 28, 20];
    dlg.spacing = 6;
    dlg.preferredSize = [460, -1];

    var header = dlg.add("statictext", undefined, "Schakel cirkelmaskers uit");
    header.graphics.font = ScriptUI.newFont("dialog", "Bold", 15);

    var hint = dlg.add("statictext", undefined,
        "Zet nu de laagmaskers uit die het ontwerp tot een cirkel bijsnijden "
        + "(Shift-klik op de mask-thumbnail in het Lagen-paneel). Zo komt "
        + "het onderliggende ontwerp tevoorschijn dat ik gebruik als afloop "
        + "rond de snijlijn. Klik daarna op Doorgaan.",
        { multiline: true });
    hint.preferredSize = [-1, 100];
    hint.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);

    addSpacer(dlg, 10);

    var btns = dlg.add("group");
    btns.alignment = ["fill", "bottom"];
    btns.add("button", undefined, "Annuleren", { name: "cancel" });
    var spacer = btns.add("group");
    spacer.alignment = ["fill", "center"];
    btns.add("button", undefined, "Doorgaan", { name: "ok" });

    try { dlg.location = [40, 80]; } catch (e) {}
    return dlg.show() === 1;
}

// Final confirm before save. Demo cut-line marquee already drawn on canvas
// at the catalog Ø radius (inside the detected outer circle). Carries the
// abbreviation field — last chance to edit before TIFFs land.
function showDemoMaskConfirmDialog(opts) {
    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = [28, 24, 28, 20];
    dlg.spacing = 6;
    dlg.preferredSize = [DLG_W, -1];

    var header = dlg.add("statictext", undefined, "Klopt de snijlijn?");
    header.graphics.font = ScriptUI.newFont("dialog", "Bold", 15);

    var hint = dlg.add("statictext", undefined,
        "De ovaal-selectie op het canvas is de snijlijn — daar wordt straks "
        + "het wallpaper gesneden. Buiten die lijn zit de afloop (" + opts.bleedMm
        + " mm) die het ontwerp moet blijven invullen.",
        { multiline: true });
    hint.preferredSize = [-1, 60];
    hint.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);

    addSpacer(dlg, 4);

    var col = dlg.add("group");
    col.orientation = "column";
    col.alignChildren = ["fill", "top"];
    col.spacing = 4;
    addCompactRow(col, "Vorm", opts.shape === "BC" ? "Behangcirkel" : "Muursticker");
    var sizesTxt = "";
    for (var i = 0; i < opts.diameterMmList.length; i++) {
        var mm = opts.diameterMmList[i];
        if (i > 0) sizesTxt += ", ";
        sizesTxt += (mm / 10).toFixed(1) + " cm";
    }
    addCompactRow(col, "Te exporteren", sizesTxt);

    addSpacer(dlg, 6);

    var abbrRow = dlg.add("group");
    abbrRow.alignment = ["fill", "top"];
    abbrRow.spacing = 10;
    var abbrLbl = abbrRow.add("statictext", undefined, "Afkorting");
    abbrLbl.preferredSize = [110, -1];
    abbrLbl.graphics.font = ScriptUI.newFont("dialog", "Bold", 11);
    var abbrInput = abbrRow.add("edittext", undefined, opts.abbreviation);
    abbrInput.alignment = ["fill", "center"];
    abbrInput.preferredSize = [-1, 24];

    addSpacer(dlg, 4);
    addCompactRow(dlg, "Uitvoermap", opts.outputDir);

    addSpacer(dlg, 12);

    var btns = dlg.add("group");
    btns.alignment = ["fill", "bottom"];
    btns.add("button", undefined, "Annuleren", { name: "cancel" });
    var spacer = btns.add("group");
    spacer.alignment = ["fill", "center"];
    var goBtn = btns.add("button", undefined, "Opslaan", { name: "ok" });
    goBtn.preferredSize = [160, 32];

    try { dlg.location = [40, 80]; } catch (e) {}
    if (dlg.show() !== 1) return null;

    var abbr = abbrInput.text.replace(/^\s+|\s+$/g, "");
    if (!abbr) abbr = opts.abbreviation;
    return { abbreviation: abbr };
}

function showShapePickerDialog() {
    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = [28, 24, 28, 20];
    dlg.spacing = 6;
    dlg.preferredSize = [420, -1];

    var header = dlg.add("statictext", undefined, "Welke vorm?");
    header.graphics.font = ScriptUI.newFont("dialog", "Bold", 15);

    var hint = dlg.add("statictext", undefined,
        "Kies of dit bestand een behangcirkel of muursticker wordt.");
    hint.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);

    addSpacer(dlg, 6);

    var grp = dlg.add("group");
    grp.orientation = "column";
    grp.alignChildren = ["left", "top"];
    grp.spacing = 4;
    var bcRb = grp.add("radiobutton", undefined, "Behangcirkel (BC) — afloop 10 mm");
    var msRb = grp.add("radiobutton", undefined, "Muursticker (MS) — afloop 3 mm");
    bcRb.value = true;

    addSpacer(dlg, 8);

    var btns = dlg.add("group");
    btns.alignment = ["fill", "bottom"];
    btns.add("button", undefined, "Annuleren", { name: "cancel" });
    var spacer = btns.add("group");
    spacer.alignment = ["fill", "center"];
    btns.add("button", undefined, "Volgende", { name: "ok" });

    if (dlg.show() !== 1) return null;
    return bcRb.value ? "BC" : "MS";
}

function showDuotoneNotice() {
    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = [28, 24, 28, 20];
    dlg.spacing = 6;
    dlg.preferredSize = [DLG_W, -1];

    var header = dlg.add("statictext", undefined, "Duotone-bestand");
    header.graphics.font = ScriptUI.newFont("dialog", "Bold", 15);

    addSpacer(dlg, 4);
    addWarning(dlg,
        "Dit bestand staat op Duotone. Ik converteer hem naar grijswaarden voor je.");

    var desc = dlg.add("statictext", undefined,
        "Wallgen verwacht Grayscale + Gray Gamma 1.0. Het origineel blijft "
        + "onaangetast — alle bewerkingen gebeuren op een kopie.",
        { multiline: true });
    desc.alignment = ["fill", "top"];
    desc.preferredSize = [-1, 40];
    desc.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);

    addSpacer(dlg, 8);

    var btns = dlg.add("group");
    btns.alignment = ["fill", "bottom"];
    btns.add("button", undefined, "Annuleren", { name: "cancel" });
    var spacer = btns.add("group");
    spacer.alignment = ["fill", "center"];
    btns.add("button", undefined, "Doorgaan", { name: "ok" });

    return dlg.show() === 1;
}

function showAmbiguousPickerDialog(detectedMm, candidatesMm) {
    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = [28, 24, 28, 20];
    dlg.spacing = 6;
    dlg.preferredSize = [420, -1];

    var header = dlg.add("statictext", undefined, "Welk formaat?");
    header.graphics.font = ScriptUI.newFont("dialog", "Bold", 15);

    var measuredCm = (detectedMm / 10).toFixed(1);
    var labelTxt = "Gemeten: " + measuredCm + " cm cirkel.";
    var question = "Bedoel je";
    for (var i = 0; i < candidatesMm.length; i++) {
        question += " " + (candidatesMm[i] / 10).toFixed(1) + " cm";
        if (i < candidatesMm.length - 2) question += ",";
        else if (i === candidatesMm.length - 2) question += " of";
    }
    question += "?";

    var lbl = dlg.add("statictext", undefined, labelTxt + " " + question, { multiline: true });
    lbl.preferredSize = [-1, 40];
    lbl.graphics.font = ScriptUI.newFont("dialog", "Regular", 12);

    addSpacer(dlg, 6);

    var grp = dlg.add("group");
    grp.orientation = "column";
    grp.alignChildren = ["left", "top"];
    grp.spacing = 4;
    var radios = [];
    for (var j = 0; j < candidatesMm.length; j++) {
        var rb = grp.add("radiobutton", undefined, (candidatesMm[j] / 10).toFixed(1) + " cm");
        radios.push(rb);
    }
    radios[0].value = true;

    addSpacer(dlg, 8);

    var btns = dlg.add("group");
    btns.alignment = ["fill", "bottom"];
    btns.add("button", undefined, "Annuleren", { name: "cancel" });
    var spacer = btns.add("group");
    spacer.alignment = ["fill", "center"];
    btns.add("button", undefined, "Kies", { name: "ok" });

    if (dlg.show() !== 1) return null;
    for (var k = 0; k < radios.length; k++) {
        if (radios[k].value) return candidatesMm[k];
    }
    return candidatesMm[0];
}

function promptManualDiameter(shape) {
    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = [28, 24, 28, 20];
    dlg.spacing = 6;
    dlg.preferredSize = [420, -1];

    var header = dlg.add("statictext", undefined, "Cirkel niet gevonden");
    header.graphics.font = ScriptUI.newFont("dialog", "Bold", 15);

    var hint = dlg.add("statictext", undefined,
        "Ik kon geen cirkel detecteren — vul handmatig in welk catalogusformaat je wilt.",
        { multiline: true });
    hint.preferredSize = [-1, 40];
    hint.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);

    addSpacer(dlg, 6);

    var list = batchDiameterList(shape);
    var grp = dlg.add("group");
    grp.orientation = "column";
    grp.alignChildren = ["left", "top"];
    grp.spacing = 4;
    var radios = [];
    for (var i = 0; i < list.length; i++) {
        var rb = grp.add("radiobutton", undefined, (list[i] / 10).toFixed(1) + " cm");
        radios.push(rb);
    }
    radios[0].value = true;

    addSpacer(dlg, 8);

    var btns = dlg.add("group");
    btns.alignment = ["fill", "bottom"];
    btns.add("button", undefined, "Annuleren", { name: "cancel" });
    var spacer = btns.add("group");
    spacer.alignment = ["fill", "center"];
    btns.add("button", undefined, "Volgende", { name: "ok" });

    if (dlg.show() !== 1) return null;
    for (var k = 0; k < radios.length; k++) {
        if (radios[k].value) return list[k];
    }
    return list[0];
}
