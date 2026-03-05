// psd-to-tiff.jsx — Pimpelmees Wallgen PSD tool
// Run: osascript -e 'tell application "Adobe Photoshop 2026" to do javascript file "/abs/path/psd-to-tiff.jsx"'
#target photoshop

var SCRIPT_NAME = "Pimpelmees Wallgen PSD tool";
var LABEL_W = 130;
var DLG_W = 520;
var LOGO_FILE = findLogo();
var CURRENT_VERSION = readVersionFile();
var UPDATE_VERSION = readUpdateFile();

app.bringToFront();
showWelcome();

function showWelcome() {
    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "center"];
    dlg.margins = [36, 30, 36, 24];
    dlg.spacing = 4;
    dlg.preferredSize = [420, -1];

    addLogo(dlg);

    addSpacer(dlg, 6);

    var title = dlg.add("statictext", undefined, SCRIPT_NAME);
    title.alignment = ["center", "top"];
    title.graphics.font = ScriptUI.newFont("dialog", "Bold", 18);

    var sub = dlg.add("statictext", undefined, "Controleert specs  \u2022  Converteert naar TIFF");
    sub.alignment = ["center", "top"];
    sub.graphics.font = ScriptUI.newFont("dialog", "Regular", 12);

    if (CURRENT_VERSION) {
        addSpacer(dlg, 2);
        var ver = dlg.add("statictext", undefined, "versie " + CURRENT_VERSION);
        ver.alignment = ["center", "top"];
        ver.graphics.font = ScriptUI.newFont("dialog", "Regular", 10);
    }

    if (UPDATE_VERSION) {
        addSpacer(dlg, 8);
        var updatePnl = dlg.add("panel", undefined, undefined, { borderStyle: "none" });
        updatePnl.alignment = ["fill", "top"];
        updatePnl.margins = [12, 8, 12, 8];
        updatePnl.graphics.backgroundColor = updatePnl.graphics.newBrush(
            updatePnl.graphics.BrushType.SOLID_COLOR, [0.18, 0.55, 0.34]
        );
        var updateRow = updatePnl.add("group");
        updateRow.alignment = ["center", "center"];
        updateRow.spacing = 12;
        var updateTxt = updateRow.add("statictext", undefined,
            "\u2B06  v" + UPDATE_VERSION + " beschikbaar");
        updateTxt.graphics.font = ScriptUI.newFont("dialog", "Bold", 12);
        updateTxt.graphics.foregroundColor = updateTxt.graphics.newPen(
            updateTxt.graphics.PenType.SOLID_COLOR, [1, 1, 1], 1
        );
        var updateBtn = updateRow.add("button", undefined, "Nu updaten");
        updateBtn.preferredSize = [110, 26];
        updateBtn.onClick = function () { dlg.close(); runAutoUpdate(); };
    }

    addSpacer(dlg, 12);
    addDivider(dlg);
    addSpacer(dlg, 12);

    var btnRow = dlg.add("group");
    btnRow.alignment = ["fill", "top"];
    btnRow.spacing = 10;
    var openBtn = btnRow.add("button", undefined, "Open bestand\u2026", { name: "ok" });
    openBtn.alignment = ["fill", "top"];
    openBtn.preferredSize = [-1, 36];
    var cancelBtn = btnRow.add("button", undefined, "Annuleren", { name: "cancel" });
    cancelBtn.preferredSize = [110, 36];

    var action = "cancel";
    openBtn.onClick = function () { action = "open"; dlg.close(); };
    cancelBtn.onClick = function () { action = "cancel"; dlg.close(); };

    dlg.show();

    if (action === "open") {
        main();
    }
}

function runAutoUpdate() {
    var repo = "doublej/pimpelmees-wallgen-psd-tool";
    var appName = "Pimpelmees Wallgen PSD tool";

    // Resolve the .app bundle path from the script location
    var scriptDir = new File($.fileName).parent.fsName;
    var appDir = scriptDir;
    // If running from inside .app/Contents/Resources, go up to the .app parent
    if (scriptDir.indexOf(".app/") !== -1) {
        appDir = scriptDir.replace(/\.app\/.*/, ".app/..");
    }

    var marker = "/tmp/pimpelmees-update-ok";
    var esc = function (s) { return s.replace(/'/g, "'\\''"); };
    var cmd = "rm -f '" + marker + "'"
        + " && TMPDIR=$(mktemp -d)"
        + " && curl -sfL --max-time 30 -o \"$TMPDIR/update.zip\""
        + " 'https://github.com/" + repo + "/releases/latest/download/" + appName.replace(/ /g, ".") + ".zip'"
        + " && rm -rf '" + esc(appDir) + "/" + esc(appName) + ".app'"
        + " && ditto -x -k \"$TMPDIR/update.zip\" '" + esc(appDir) + "'"
        + " && rm -rf \"$TMPDIR\""
        + " && touch '" + marker + "'";

    app.system(cmd);

    var ok = new File(marker);
    if (ok.exists) {
        ok.remove();
        // Update the temp file so the banner disappears next launch
        try {
            var f = new File("/tmp/pimpelmees-psd-tool-update.txt");
            if (f.exists) f.remove();
        } catch (e) {}
        alert("Update naar v" + UPDATE_VERSION + " gelukt!\n\nOpen de app opnieuw om de nieuwe versie te gebruiken.");
    } else {
        alert("Update mislukt.\n\nProbeer het later opnieuw of download handmatig:\nhttps://github.com/" + repo + "/releases/latest");
    }
}

function pickDocument() {
    // No open documents — go straight to file picker
    if (app.documents.length === 0) {
        var f = File.openDialog("Selecteer een PSD-bestand", "*.psd");
        if (!f) return null;
        var d = app.open(f);
        return { doc: d, file: f };
    }

    // Build list of open PSD documents
    var docs = [];
    for (var i = 0; i < app.documents.length; i++) {
        var d = app.documents[i];
        docs.push({ doc: d, name: d.name, path: d.fullName ? d.fullName.fsName : "" });
    }

    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = [28, 24, 28, 20];
    dlg.spacing = 6;
    dlg.preferredSize = [DLG_W, -1];

    var header = dlg.add("statictext", undefined, "Selecteer document");
    header.alignment = ["left", "top"];
    header.graphics.font = ScriptUI.newFont("dialog", "Bold", 15);

    var hint = dlg.add("statictext", undefined, "Kies een geopend document of open een nieuw bestand.");
    hint.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);

    addSpacer(dlg, 6);

    var list = dlg.add("listbox", [0, 0, DLG_W - 56, Math.min(docs.length * 26 + 10, 180)], [],
        { multiselect: false });
    for (var i = 0; i < docs.length; i++) {
        var item = list.add("item", docs[i].name);
        if (docs[i].path) item.subItems[0] = docs[i].path;
    }
    list.selection = 0;

    addSpacer(dlg, 4);
    addDivider(dlg);
    addSpacer(dlg, 4);

    var browseBtn = dlg.add("button", undefined, "Open bestand van schijf\u2026");
    browseBtn.alignment = ["fill", "top"];
    browseBtn.preferredSize = [-1, 32];

    addSpacer(dlg, 8);

    var btns = dlg.add("group");
    btns.alignment = ["fill", "bottom"];
    btns.spacing = 10;
    btns.add("button", undefined, "Annuleren", { name: "cancel" });
    var spacer = btns.add("group");
    spacer.alignment = ["fill", "center"];
    var useBtn = btns.add("button", undefined, "Gebruik selectie", { name: "ok" });
    useBtn.preferredSize = [160, 32];

    var action = "cancel";
    var browsedFile = null;

    browseBtn.onClick = function () {
        var f = File.openDialog("Selecteer een PSD-bestand", "*.psd");
        if (f) { browsedFile = f; action = "browse"; dlg.close(); }
    };
    useBtn.onClick = function () { action = "select"; dlg.close(); };

    dlg.show();

    if (action === "browse" && browsedFile) {
        var d = app.open(browsedFile);
        return { doc: d, file: browsedFile };
    }
    if (action === "select" && list.selection) {
        var idx = list.selection.index;
        var d = docs[idx].doc;
        app.activeDocument = d;
        return { doc: d, file: d.fullName || new File(d.name) };
    }
    return null;
}

function main() {
    var result = pickDocument();
    if (!result) return;
    var doc = result.doc;
    var psdFile = result.file;

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

    // Flatten to single layer, preserve transparency for analysis
    showAllLayers(doc.layers);
    unlockBackground(doc);
    if (doc.layers.length > 1) {
        doc.mergeVisibleLayers();
    }

    var ooc = measureOutOfCanvas(doc);
    var semiTransparent = hasSemiTransparentPixels(doc);

    var choices = showPreviewDialog(docInfo, ooc, semiTransparent);
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
    doc.flatten();

    var tiffDir = psdFile.parent.fsName;
    var tiffFile = new File(tiffDir + "/" + choices.filename + ".tif");
    saveTiff(doc, tiffFile);
    doc.close(SaveOptions.DONOTSAVECHANGES);

    alert("Opgeslagen: " + decodeURI(tiffFile.name));
}

// === Analysis ===

function measureOutOfCanvas(doc) {
    var w = doc.width.as("px");
    var h = doc.height.as("px");
    var b = doc.activeLayer.bounds;
    var l = b[0].as("px"), t = b[1].as("px");
    var r = b[2].as("px"), bt = b[3].as("px");

    var hasExcess = (l < 0 || t < 0 || r > w || bt > h);
    if (!hasExcess) return { hasExcess: false, savedBytes: 0 };

    var layerArea = (r - l) * (bt - t);
    var canvasArea = w * h;
    var excessArea = layerArea - canvasArea;
    if (excessArea < 0) excessArea = 0;

    var bpc = getBitsPerChannel(doc.bitsPerChannel);
    var bytesPerPixel = doc.componentChannels.length * (bpc / 8);
    var savedBytes = excessArea * bytesPerPixel;

    return { hasExcess: true, savedBytes: savedBytes };
}

function hasSemiTransparentPixels(doc) {
    if (doc.activeLayer.isBackgroundLayer) return false;

    var origFg = app.foregroundColor;

    try {
        var desc = new ActionDescriptor();
        var ref1 = new ActionReference();
        ref1.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
        desc.putReference(charIDToTypeID("null"), ref1);
        var ref2 = new ActionReference();
        ref2.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Trsp"));
        desc.putReference(charIDToTypeID("T   "), ref2);
        executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
    } catch (e) {
        return false;
    }

    var tempCh = doc.channels.add();
    tempCh.name = "__alpha_check";
    tempCh.kind = ChannelType.MASKEDAREA;
    doc.activeChannels = [tempCh];

    var white = new SolidColor();
    white.rgb.red = 255;
    white.rgb.green = 255;
    white.rgb.blue = 255;
    app.foregroundColor = white;

    try { doc.selection.fill(app.foregroundColor); } catch (e) {}
    try { doc.selection.deselect(); } catch (e) {}

    var hist = tempCh.histogram;
    var hasSemi = false;
    for (var v = 1; v < 255; v++) {
        if (hist[v] > 0) { hasSemi = true; break; }
    }

    tempCh.remove();
    app.foregroundColor = origFg;
    doc.activeChannels = doc.componentChannels;

    return hasSemi;
}

// === UI ===

function showPreviewDialog(di, ooc, semiTransparent) {
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
    var hasIssues = ooc.hasExcess || semiTransparent;

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
            addWarning(issuesPnl, "Beelddata buiten canvas \u2014 ~" + formatBytes(ooc.savedBytes) + " verspild");
            trimCb = issuesPnl.add("checkbox", undefined, "  Bijsnijden tot canvasgrenzen");
            trimCb.value = true;
        }
        if (semiTransparent) {
            addWarning(issuesPnl, "Semi-transparante pixels gevonden");
            whiteCb = issuesPnl.add("checkbox", undefined, "  Witte achtergrond erachter plaatsen");
            whiteCb.value = true;
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

    if (dlg.show() !== 1) return null;

    var outName = nameInput.text.replace(/^\s+|\s+$/g, "");
    if (!outName) outName = defaultName;

    return {
        trim: trimCb ? trimCb.value : false,
        whiteBg: whiteCb ? whiteCb.value : false,
        filename: outName
    };
}

function addCompactRow(parent, label, value) {
    var row = parent.add("group");
    row.alignment = ["fill", "top"];
    row.spacing = 6;
    var lbl = row.add("statictext", undefined, label);
    lbl.graphics.font = ScriptUI.newFont("dialog", "Bold", 11);
    lbl.preferredSize = [110, -1];
    var val = row.add("statictext", undefined, value, { truncate: "end" });
    val.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);
    return row;
}

function addWarning(parent, text) {
    var row = parent.add("group");
    row.alignment = ["fill", "top"];
    var txt = row.add("statictext", undefined, "\u26A0  " + text);
    txt.graphics.font = ScriptUI.newFont("dialog", "Bold", 11);
    txt.graphics.foregroundColor = txt.graphics.newPen(
        txt.graphics.PenType.SOLID_COLOR, [1, 0.85, 0.5], 1
    );
}

function addDivider(parent) {
    var d = parent.add("panel", undefined, undefined, { borderStyle: "etched" });
    d.alignment = ["fill", "top"];
    d.preferredSize = [-1, 2];
}

function addSpacer(parent, h) {
    var s = parent.add("group");
    s.preferredSize = [-1, h];
}

// === Actions ===

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

function saveTiff(doc, file) {
    var opts = new TiffSaveOptions();
    opts.imageCompression = TIFFEncoding.TIFFLZW;
    opts.embedColorProfile = true;
    opts.alphaChannels = false;
    opts.layers = false;
    doc.saveAs(file, opts, true);
}

// === Logo ===

function readVersionFile() {
    var dir = new File($.fileName).parent.fsName;
    var paths = [dir + "/version.txt", dir + "/../Resources/version.txt"];
    for (var i = 0; i < paths.length; i++) {
        var f = new File(paths[i]);
        if (f.exists && f.open("r")) {
            var v = f.read().replace(/[\r\n\s]/g, "");
            f.close();
            return v || null;
        }
    }
    return null;
}

function readUpdateFile() {
    var f = new File("/tmp/pimpelmees-psd-tool-update.txt");
    if (!f.exists) return null;
    if (!f.open("r")) return null;
    var v = f.read().replace(/[\r\n\s]/g, "");
    f.close();
    return v || null;
}

function findLogo() {
    var dir = new File($.fileName).parent.fsName;
    var paths = [
        dir + "/logo_dialog.png",
        dir + "/../Resources/logo_dialog.png"
    ];
    for (var i = 0; i < paths.length; i++) {
        var f = new File(paths[i]);
        if (f.exists) return f;
    }
    return null;
}

function addLogo(parent) {
    if (!LOGO_FILE) return;
    var pnl = parent.add("panel", undefined, undefined, { borderStyle: "none" });
    pnl.alignment = ["fill", "top"];
    pnl.margins = [0, 0, 0, 0];
    pnl.graphics.backgroundColor = pnl.graphics.newBrush(
        pnl.graphics.BrushType.SOLID_COLOR, [1, 1, 1]
    );
    var img = pnl.add("image", undefined, LOGO_FILE);
    img.alignment = ["center", "center"];
}

// === Utilities ===

function showAllLayers(layers) {
    for (var i = 0; i < layers.length; i++) {
        layers[i].visible = true;
        if (layers[i].typename === "LayerSet") {
            showAllLayers(layers[i].layers);
        }
    }
}

function unlockBackground(doc) {
    try {
        var last = doc.layers[doc.layers.length - 1];
        if (last.isBackgroundLayer) last.isBackgroundLayer = false;
    } catch (e) {}
}

function getBitsPerChannel(bpc) {
    switch (bpc) {
        case BitsPerChannelType.ONE: return 1;
        case BitsPerChannelType.EIGHT: return 8;
        case BitsPerChannelType.SIXTEEN: return 16;
        case BitsPerChannelType.THIRTYTWO: return 32;
        default: return 8;
    }
}

function getColorModeName(mode) {
    switch (mode) {
        case DocumentMode.RGB: return "RGB";
        case DocumentMode.CMYK: return "CMYK";
        case DocumentMode.GRAYSCALE: return "Grayscale";
        case DocumentMode.LAB: return "Lab";
        case DocumentMode.BITMAP: return "Bitmap";
        case DocumentMode.DUOTONE: return "Duotone";
        case DocumentMode.INDEXEDCOLOR: return "Indexed";
        case DocumentMode.MULTICHANNEL: return "Multichannel";
        default: return "Unknown";
    }
}

function toSnakeCase(str) {
    return str
        .replace(/\.psd$/i, "")
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[\s\-\.]+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .toLowerCase();
}

function formatBytes(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
}
