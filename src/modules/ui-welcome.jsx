// ui-welcome.jsx — Welcome / landing dialog

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
