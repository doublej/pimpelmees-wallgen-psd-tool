// psd-to-tiff.jsx — Pimpelmees Wallgen PSD tool
// Run: osascript -e 'tell application "Adobe Photoshop 2026" to do javascript file "/abs/path/psd-to-tiff.jsx"'
#target photoshop

var SCRIPT_NAME = "Pimpelmees Wallgen PSD tool";
var LABEL_W = 110;
var LOGO_FILE = findLogo();
var CURRENT_VERSION = readVersionFile();
var UPDATE_VERSION = readUpdateFile();

app.bringToFront();
showWelcome();

function showWelcome() {
    var dlg = new Window("dialog", SCRIPT_NAME);
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "center"];
    dlg.margins = [30, 25, 30, 20];

    addLogo(dlg);

    var title = dlg.add("statictext", undefined, SCRIPT_NAME);
    title.alignment = ["center", "top"];
    title.graphics.font = ScriptUI.newFont("dialog", "Bold", 16);

    var sub = dlg.add("statictext", undefined, "Controleert specs  \u2022  Converteert naar TIFF");
    sub.alignment = ["center", "top"];

    if (CURRENT_VERSION) {
        var ver = dlg.add("statictext", undefined, "v" + CURRENT_VERSION);
        ver.alignment = ["center", "top"];
    }

    if (UPDATE_VERSION) {
        var updateBar = dlg.add("group");
        updateBar.alignment = ["fill", "top"];
        updateBar.margins = [10, 6, 10, 6];
        updateBar.alignment = ["center", "top"];
        var updateTxt = updateBar.add("statictext", undefined,
            "\u2B06  Update beschikbaar: v" + UPDATE_VERSION + "  \u2014  voer autoupdate.sh uit");
        updateTxt.graphics.font = ScriptUI.newFont("dialog", "Bold", 11);
    }

    dlg.add("statictext", undefined, "");

    var btns = dlg.add("group");
    btns.alignment = ["center", "bottom"];
    btns.spacing = 15;
    var openBtn = btns.add("button", undefined, "Open bestand\u2026", { name: "ok" });
    var installBtn = btns.add("button", undefined, "Installeer in Scripts-menu");
    var cancelBtn = btns.add("button", undefined, "Annuleren", { name: "cancel" });

    var action = "cancel";
    openBtn.onClick = function () { action = "open"; dlg.close(); };
    installBtn.onClick = function () { action = "install"; dlg.close(); };
    cancelBtn.onClick = function () { action = "cancel"; dlg.close(); };

    dlg.show();

    if (action === "open") {
        main();
    } else if (action === "install") {
        installToPlugins();
    }
}

function installToPlugins() {
    var scriptFile = new File($.fileName);
    var psApp = new Folder("/Applications").getFiles("Adobe Photoshop*");
    if (psApp.length === 0) {
        alert("Kan Photoshop niet vinden in /Applications.");
        return;
    }
    var scriptsDir = new Folder(psApp[psApp.length - 1].fsName + "/Presets/Scripts");
    if (!scriptsDir.exists) {
        alert("Scripts-map niet gevonden:\n" + scriptsDir.fsName);
        return;
    }
    var dest = scriptsDir.fsName + "/" + SCRIPT_NAME + ".jsx";
    var src = scriptFile.fsName;

    var installed = scriptFile.copy(new File(dest));
    if (!installed) {
        var esc = function (s) { return s.replace(/'/g, "'\\''"); };
        var cmd = "osascript -e 'do shell script \"cp \\\"" + esc(src) + "\\\" \\\"" + esc(dest) + "\\\"\" with administrator privileges'";
        installed = (app.system(cmd) === 0);
    }

    if (!installed) {
        alert("Installatie geannuleerd of mislukt.\n\nJe kunt handmatig kopi\u00EBren:\n" + src + "\n\u2192 " + scriptsDir.fsName);
        return;
    }

    var msg = "Script succesvol ge\u00EFnstalleerd!\n\n"
        + "Na herstart vind je het bij:\n"
        + "Bestand \u2192 Scripts \u2192 " + SCRIPT_NAME + "\n\n"
        + "Photoshop nu herstarten?";

    if (confirm(msg)) {
        var psName = psApp[psApp.length - 1].name;
        app.system("osascript -e 'tell application \"" + psName + "\" to quit' && sleep 2 && open -a \"" + psName + "\" &");
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

    var dlg = new Window("dialog", SCRIPT_NAME + " \u2014 Selecteer document");
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = [20, 20, 20, 15];
    dlg.spacing = 10;

    dlg.add("statictext", undefined, "Geopende documenten:");

    var list = dlg.add("listbox", [0, 0, 450, Math.min(docs.length * 24 + 8, 200)], [],
        { multiselect: false });
    for (var i = 0; i < docs.length; i++) {
        var item = list.add("item", docs[i].name);
        if (docs[i].path) item.subItems[0] = docs[i].path;
    }
    list.selection = 0;

    var sep = dlg.add("statictext", undefined, "\u2014  of  \u2014");
    sep.alignment = ["center", "top"];

    var browseBtn = dlg.add("button", undefined, "Open bestand van schijf\u2026");
    browseBtn.alignment = ["center", "top"];

    var btns = dlg.add("group");
    btns.alignment = ["right", "bottom"];
    btns.spacing = 10;
    btns.add("button", undefined, "Annuleren", { name: "cancel" });
    var useBtn = btns.add("button", undefined, "Gebruik selectie", { name: "ok" });

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
    dlg.margins = [20, 20, 20, 15];
    dlg.spacing = 12;

    addLogo(dlg);

    // --- Source ---
    var src = dlg.add("panel", undefined, "Bron-PSD");
    src.alignChildren = ["fill", "top"];
    src.margins = [15, 18, 15, 12];
    src.spacing = 6;

    addRow(src, "Bestand", di.name);
    addRow(src, "Bestandsgrootte", formatBytes(di.psdSize));
    addRow(src, "Afmetingen", di.widthPx + " \u00D7 " + di.heightPx + " px");
    addRow(src, "Fysiek", di.widthCm + " \u00D7 " + di.heightCm + " cm");
    addRow(src, "Resolutie", di.dpi + " DPI");
    addRow(src, "Kleur", di.colorMode + " / " + di.bitsPerChannel + "-bit");
    addRow(src, "ICC-profiel", di.iccProfile);

    // --- Issues ---
    var trimCb = null;
    var whiteCb = null;
    var hasIssues = ooc.hasExcess || semiTransparent;

    if (hasIssues) {
        var issues = dlg.add("panel", undefined, "Problemen");
        issues.alignChildren = ["fill", "top"];
        issues.margins = [15, 18, 15, 12];
        issues.spacing = 8;

        if (ooc.hasExcess) {
            addWarning(issues, "Beelddata buiten canvas \u2014 ~" + formatBytes(ooc.savedBytes) + " verspild");
            trimCb = issues.add("checkbox", undefined, "  Bijsnijden tot canvasgrenzen");
            trimCb.value = true;
        }
        if (semiTransparent) {
            if (ooc.hasExcess) issues.add("statictext", undefined, "");
            addWarning(issues, "Semi-transparante pixels gevonden");
            whiteCb = issues.add("checkbox", undefined, "  Witte achtergrond erachter plaatsen");
            whiteCb.value = true;
        }
    }

    // --- Output specs ---
    var out = dlg.add("panel", undefined, "TIFF-uitvoerinstellingen");
    out.alignChildren = ["fill", "top"];
    out.margins = [15, 18, 15, 12];
    out.spacing = 6;

    var nameRow = out.add("group");
    nameRow.alignment = ["fill", "top"];
    nameRow.spacing = 8;
    var nameLbl = nameRow.add("statictext", undefined, "Bestandsnaam");
    nameLbl.preferredSize = [LABEL_W, -1];
    nameLbl.graphics.font = ScriptUI.newFont("dialog", "Bold", 12);
    var defaultName = toSnakeCase(di.name.replace(/\.psd$/i, ""));
    var nameInput = nameRow.add("edittext", [0, 0, 350, 24], defaultName);
    nameInput.addEventListener("blur", function () {
        nameInput.text = toSnakeCase(nameInput.text);
    });

    addRow(out, "Formaat", "TIFF");
    addRow(out, "Compressie", "LZW (lossless)");
    addRow(out, "Lagen", "Samengevoegd tot 1");
    addRow(out, "Alpha", "Verwijderd");
    addRow(out, "Bitdiepte", di.bitsPerChannel + "-bit / kanaal");
    addRow(out, "ICC-profiel", di.iccProfile + "  \u2713 behouden");

    // --- No issues badge ---
    if (!hasIssues) {
        var ok = dlg.add("group");
        ok.alignment = ["center", "top"];
        var okTxt = ok.add("statictext", undefined, "\u2713  Geen problemen gevonden \u2014 klaar om te converteren");
        okTxt.graphics.font = ScriptUI.newFont("dialog", "Bold", 12);
    }

    // --- Buttons ---
    var btns = dlg.add("group");
    btns.alignment = ["right", "bottom"];
    btns.spacing = 10;
    btns.add("button", undefined, "Annuleren", { name: "cancel" });
    btns.add("button", undefined, "Opslaan als TIFF", { name: "ok" });

    if (dlg.show() !== 1) return null;

    var outName = nameInput.text.replace(/^\s+|\s+$/g, "");
    if (!outName) outName = defaultName;

    return {
        trim: trimCb ? trimCb.value : false,
        whiteBg: whiteCb ? whiteCb.value : false,
        filename: outName
    };
}

function addRow(parent, label, value) {
    var row = parent.add("group");
    row.alignment = ["fill", "top"];
    row.spacing = 8;
    var lbl = row.add("statictext", undefined, label);
    lbl.preferredSize = [LABEL_W, -1];
    lbl.graphics.font = ScriptUI.newFont("dialog", "Bold", 12);
    var val = row.add("statictext", [0, 0, 350, 20], value, { truncate: "end" });
    return row;
}

function addWarning(parent, text) {
    var row = parent.add("group");
    row.alignment = ["fill", "top"];
    var txt = row.add("statictext", undefined, "\u26A0  " + text);
    txt.graphics.font = ScriptUI.newFont("dialog", "Bold", 12);
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
