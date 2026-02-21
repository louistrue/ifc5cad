// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, download, I18n, PubSub, type IApplication, type ICommand } from "chili-core";
import { IFC_PRIMARY_FILE_EXTENSION, IfcLiteService } from "ifc-lite-core";
import { IFCX_FILE_EXTENSION, IFCXSerializer } from "ifcx-core";

@command({
    key: "file.exportModel",
    icon: "icon-download",
})
export class ExportModel implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const activeDocument = app.activeView?.document;
        if (!activeDocument) {
            PubSub.default.pub("showToast", "error.ifc.noDocument");
            return;
        }

        const format = await selectExportFormat(app.mainWindow ?? document.body);
        if (!format) {
            return;
        }

        if (format === "IFCX") {
            const ifcxDoc = IFCXSerializer.serialize(activeDocument, "IFCstudio");
            const json = IFCXSerializer.toJSON(ifcxDoc);
            download([json], `${activeDocument.name}${IFCX_FILE_EXTENSION}`);
            return;
        }

        const ifcText = IfcLiteService.export(activeDocument);
        download([ifcText], `${activeDocument.name}${IFC_PRIMARY_FILE_EXTENSION}`);
        PubSub.default.pub("showToast", "toast.downloading");
    }
}

function selectExportFormat(host: HTMLElement): Promise<"IFC" | "IFCX" | undefined> {
    return new Promise((resolve) => {
        const wrapper = document.createElement("div");
        wrapper.style.position = "fixed";
        wrapper.style.inset = "0";
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.justifyContent = "center";
        wrapper.style.background = "rgba(0,0,0,0.2)";
        wrapper.style.zIndex = "9999";

        const panel = document.createElement("div");
        panel.style.background = "#fff";
        panel.style.padding = "12px";
        panel.style.borderRadius = "8px";
        panel.style.display = "flex";
        panel.style.gap = "8px";
        panel.style.alignItems = "center";

        const select = document.createElement("select");
        select.innerHTML = "<option value=\"IFC\">IFC</option><option value=\"IFCX\">IFCX</option>";

        const ok = document.createElement("button");
        ok.textContent = I18n.translate("common.confirm");

        const cancel = document.createElement("button");
        cancel.textContent = I18n.translate("common.cancel");

        const cleanup = (value: "IFC" | "IFCX" | undefined) => {
            wrapper.remove();
            resolve(value);
        };

        ok.onclick = () => cleanup(select.value === "IFCX" ? "IFCX" : "IFC");
        cancel.onclick = () => cleanup(undefined);
        wrapper.onclick = (e) => {
            if (e.target === wrapper) cleanup(undefined);
        };

        panel.append(select, ok, cancel);
        wrapper.append(panel);
        host.append(wrapper);
    });
}
