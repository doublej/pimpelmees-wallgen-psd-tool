// ui-helpers.jsx — Reusable ScriptUI components

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

function addSpacer(parent, h) {
    var s = parent.add("group");
    s.preferredSize = [-1, h];
}

function addDivider(parent) {
    var d = parent.add("panel", undefined, undefined, { borderStyle: "etched" });
    d.alignment = ["fill", "top"];
    d.preferredSize = [-1, 2];
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
