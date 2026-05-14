// utils.jsx — Pure utility functions

function formatBytes(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
}

function padZero4(mm) {
    var s = String(Math.round(mm));
    while (s.length < 4) s = "0" + s;
    return s;
}

function toSnakeCase(str) {
    return str
        .replace(/\.(psd|psb)$/i, "")
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[\s\-\.]+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .toLowerCase();
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

// Indented tree dump of layer visibility. [v] visible, [ ] hidden.
function dumpLayerVisibility(layers, prefix) {
    var out = "";
    for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        var v = L.visible ? "[v]" : "[ ]";
        out += prefix + v + " " + L.name + "\n";
        if (L.typename === "LayerSet") {
            out += dumpLayerVisibility(L.layers, prefix + "    ");
        }
    }
    return out;
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
