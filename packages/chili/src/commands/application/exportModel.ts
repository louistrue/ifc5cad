// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, download, PubSub, type IApplication, type ICommand } from "chili-core";
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

        PubSub.default.pub("showToast", "toast.downloading");

        if (format === "IFCX") {
            const ifcxDoc = IFCXSerializer.serialize(activeDocument, "IFCstudio");
            const json = IFCXSerializer.toJSON(ifcxDoc);
            download([json], `${activeDocument.name}${IFCX_FILE_EXTENSION}`);
            return;
        }

        const ifcText = IfcLiteService.export(activeDocument);
        download([ifcText], `${activeDocument.name}${IFC_PRIMARY_FILE_EXTENSION}`);
    }
}

function selectExportFormat(host: HTMLElement): Promise<"IFC" | "IFCX" | undefined> {
    return new Promise((resolve) => {
        const select = document.createElement("select");
        select.style.position = "fixed";
        select.style.top = "56px";
        select.style.left = "200px";
        select.style.zIndex = "9999";
        select.innerHTML = '<option value="">Export as…</option><option value="IFC">IFC</option><option value="IFCX">IFCX</option>';

        let done = false;
        const cleanup = (value: "IFC" | "IFCX" | undefined) => {
            if (done) return;
            done = true;
            select.remove();
            resolve(value);
        };

        select.onchange = () => {
            const value = select.value;
            cleanup(value === "IFCX" ? "IFCX" : value === "IFC" ? "IFC" : undefined);
        };
        select.onblur = () => cleanup(undefined);
        select.onkeydown = (e) => {
            if (e.key === "Escape") {
                cleanup(undefined);
            }
        };

        host.append(select);
        select.focus();
        const picker = select as HTMLSelectElement & { showPicker?: () => void };
        picker.showPicker?.();
    });
}
