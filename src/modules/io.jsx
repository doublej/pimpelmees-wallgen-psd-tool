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
    doc.saveAs(file, opts, true);
}
