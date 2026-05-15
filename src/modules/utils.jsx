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

// Reading colorProfileName on Duotone docs throws "No such element" —
// Duotone uses ink curves rather than an ICC profile, so the property
// has nothing to return. Wrap reads everywhere via this helper.
function safeProfileName(doc) {
    try { return doc.colorProfileName || "None"; }
    catch (e) { return "None"; }
}

// Compact ICC/mode snapshot for log lines. Surfaces enough state to
// distinguish a no-op assign from a real remap when reading the log.
function iccSnapshot(doc) {
    return "mode=" + getColorModeName(doc.mode)
        + " profile=\"" + safeProfileName(doc) + "\""
        + " bits=" + getBitsPerChannel(doc.bitsPerChannel);
}

// Plain-language summary of checkIccProfile's verdict so the log
// captures the decision (match / wrong-profile / wrong-mode) and
// the exact strings compared, not just the eventual mutation.
function describeIccCheck(check, mode) {
    if (!check) return "icc-check: match";
    if (check.wrongMode) return "icc-check: wrong mode (" + check.profile + ")";
    return "icc-check: differs (got=\"" + check.profile + "\" expected=\"" + check.expected + "\")";
}

// --- Structured log event helpers ---
// Events are objects (not strings) so writeAutomodeLog can render
// sections, key/value alignment, and indentation consistently.
// Kinds: "section" (top-level header), "subheader" (e.g. per-iter),
// "kv" (aligned key/value), "info" (free text under current section),
// "blank" (vertical breathing room).
function ev_section(events, title) {
    if (events) events.push({ kind: "section", title: title });
}
function ev_subheader(events, title) {
    if (events) events.push({ kind: "subheader", title: title });
}
function ev_kv(events, key, value) {
    if (events) events.push({ kind: "kv", key: key, value: value });
}
function ev_info(events, text) {
    if (events) events.push({ kind: "info", text: text });
}
function ev_error(events, text) {
    if (events) events.push({ kind: "error", text: text });
}
function ev_blank(events) {
    if (events) events.push({ kind: "blank" });
}

function repeatChar(c, n) {
    var s = "";
    for (var i = 0; i < n; i++) s += c;
    return s;
}

function padRight(s, n) {
    s = String(s);
    if (s.length >= n) return s;
    return s + repeatChar(" ", n - s.length);
}

// Compact "mode + bits + size" string without the redundant key=value
// noise. Used for the "open" line where space matters.
function describeDocOpen(doc) {
    return getColorModeName(doc.mode)
        + " · " + getBitsPerChannel(doc.bitsPerChannel) + "-bit"
        + " · " + Math.round(doc.width.as("px")) + "×" + Math.round(doc.height.as("px")) + " px"
        + " · " + Math.round(doc.resolution) + " DPI"
        + " · " + doc.layers.length + " layer" + (doc.layers.length === 1 ? "" : "s");
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
