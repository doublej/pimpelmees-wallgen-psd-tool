// io.jsx — File I/O, version reading, TIFF saving

function readVersionFile() {
    var dir = new File($.fileName).parent.fsName;
    var paths = [dir + "/version.txt", dir + "/../Resources/version.txt", dir + "/pimpelmees-resources/version.txt"];
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
        dir + "/../Resources/logo_dialog.png",
        dir + "/pimpelmees-resources/logo_dialog.png"
    ];
    for (var i = 0; i < paths.length; i++) {
        var f = new File(paths[i]);
        if (f.exists) return f;
    }
    return null;
}

function saveTiff(doc, file) {
    var opts = new TiffSaveOptions();
    opts.imageCompression = TIFFEncoding.TIFFLZW;
    opts.embedColorProfile = true;
    opts.alphaChannels = false;
    opts.layers = false;

    // Photoshop's saveAs writing a large TIFF straight into a
    // cloud-synced / network folder (Dropbox, external mounts) fails
    // intermittently with macOS error -120 (dirNFErr) — surfaced as a
    // bogus "functionality may not be available in this version of
    // Photoshop". Save to fast local temp first, then copy to the real
    // destination; a filesystem copy is far more robust than Photoshop
    // writing directly to the synced volume.
    var dest = file.parent;
    if (!dest.exists && !dest.create()) {
        throw new Error("kan uitvoermap niet aanmaken: " + dest.fsName);
    }
    var tmp = new File(Folder.temp.fsName + "/wallgen_" + (new Date()).getTime() + "_" + file.name);
    try { if (tmp.exists) tmp.remove(); } catch (eRm) {}
    doc.saveAs(tmp, opts, true);
    if (!tmp.copy(file)) {
        try { tmp.remove(); } catch (eRm2) {}
        throw new Error("opslaan lukte lokaal, maar kopieren naar bestemming faalde: " + file.fsName);
    }
    try { tmp.remove(); } catch (eRm3) {}
}
