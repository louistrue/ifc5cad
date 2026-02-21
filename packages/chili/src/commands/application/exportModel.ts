// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, download, PubSub, type IApplication, type ICommand } from "chili-core";
import { IFC_PRIMARY_FILE_EXTENSION, IfcLiteService } from "ifc-lite-core";
import { IFCX_FILE_EXTENSION, IFCXSerializer } from "ifcx-core";

type ExportFormat = "IFC" | "IFCX";

interface IExportTarget {
    fileName: string;
    format: ExportFormat;
    saveHandle?: FileSystemFileHandle;
}

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

        const target = await selectExportTarget(activeDocument.name);
        if (!target) {
            return;
        }

        if (target.format === "IFCX") {
            const ifcxDoc = IFCXSerializer.serialize(activeDocument, "IFCstudio");
            const json = IFCXSerializer.toJSON(ifcxDoc);
            await writeOrDownload(target, json, `${activeDocument.name}${IFCX_FILE_EXTENSION}`);
            PubSub.default.pub("showToast", "toast.downloading");
            return;
        }

        const ifcText = IfcLiteService.export(activeDocument);
        await writeOrDownload(target, ifcText, `${activeDocument.name}${IFC_PRIMARY_FILE_EXTENSION}`);
        PubSub.default.pub("showToast", "toast.downloading");
    }
}

async function selectExportTarget(documentName: string): Promise<IExportTarget | undefined> {
    const picker = getSaveFilePicker();
    if (picker) {
        try {
            const handle = await picker({
                suggestedName: `${documentName}${IFC_PRIMARY_FILE_EXTENSION}`,
                types: [
                    {
                        description: "IFC",
                        accept: { "application/x-step": [".ifc", ".ifczip"] },
                    },
                    {
                        description: "IFCX",
                        accept: { "application/json": [".ifcx"] },
                    },
                ],
            });
            const file = await handle.getFile();
            const fileName = file.name;
            const format = fileName.toLowerCase().endsWith(IFCX_FILE_EXTENSION) ? "IFCX" : "IFC";
            return { fileName, format, saveHandle: handle };
        } catch {
            return undefined;
        }
    }

    return {
        fileName: `${documentName}${IFC_PRIMARY_FILE_EXTENSION}`,
        format: "IFC",
    };
}

function getSaveFilePicker():
    | ((options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>)
    | undefined {
    const maybeWindow = window as Window & {
        showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
    };
    return maybeWindow.showSaveFilePicker;
}

async function writeOrDownload(target: IExportTarget, content: string, fallbackName: string): Promise<void> {
    if (target.saveHandle) {
        const writable = await target.saveHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return;
    }

    download([content], fallbackName);
}
