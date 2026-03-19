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
