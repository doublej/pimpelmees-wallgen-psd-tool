// ui-picker.jsx — Document selection dialog

function pickDocument() {
    if (app.documents.length === 0) {
        var f = File.openDialog("Selecteer een PSD-bestand", "*.psd");
        if (!f) return null;
        var d = app.open(f);
        return { doc: d, file: f };
    }

    var docs = [];
    for (var i = 0; i < app.documents.length; i++) {
        var d = app.documents[i];
        var path = "";
        try { path = d.fullName.fsName; } catch (e) {}
        docs.push({ doc: d, name: d.name, path: path });
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
        var file;
        try { file = d.fullName; } catch (e) { file = new File(d.name); }
        return { doc: d, file: file };
    }
    return null;
}
