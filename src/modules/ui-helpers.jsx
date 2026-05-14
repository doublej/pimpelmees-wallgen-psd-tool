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

// Modal pause dialog for the debug stepper. Returns true to continue, false
// to abort. detail can be multiline; layerDump is shown in a scrollable area.
function pauseStep(title, detail, layerDump) {
    var dlg = new Window("dialog", "Stepper");
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = [20, 16, 20, 16];
    dlg.spacing = 8;
    dlg.preferredSize = [520, -1];

    var t = dlg.add("statictext", undefined, title);
    t.graphics.font = ScriptUI.newFont("dialog", "Bold", 14);

    if (detail) {
        var d = dlg.add("statictext", undefined, detail, { multiline: true });
        d.preferredSize = [480, -1];
        d.graphics.font = ScriptUI.newFont("dialog", "Regular", 11);
    }

    if (layerDump) {
        var et = dlg.add("edittext", undefined, layerDump, { multiline: true, readonly: true, scrolling: true });
        et.preferredSize = [480, 220];
        et.graphics.font = ScriptUI.newFont("Monaco", "Regular", 10);
    }

    var btns = dlg.add("group");
    btns.alignment = ["fill", "bottom"];
    btns.spacing = 10;
    var stopBtn = btns.add("button", undefined, "Stop", { name: "cancel" });
    var spacer = btns.add("group");
    spacer.alignment = ["fill", "center"];
    var contBtn = btns.add("button", undefined, "Continue", { name: "ok" });
    contBtn.preferredSize = [140, 30];

    var action = "stop";
    contBtn.onClick = function () { action = "continue"; dlg.close(); };
    stopBtn.onClick = function () { action = "stop"; dlg.close(); };

    dlg.show();
    return action === "continue";
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
