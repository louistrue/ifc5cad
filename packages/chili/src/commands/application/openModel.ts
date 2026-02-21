// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    I18n,
    PubSub,
    Transaction,
    command,
    readFileAsync,
    type IApplication,
    type ICommand,
} from "chili-core";
import { IFC_FILE_EXTENSIONS, IfcLiteService } from "ifc-lite-core";
import { IFCX_FILE_EXTENSION, IFCXImporter, IFCXSerializer } from "ifcx-core";

const OPEN_MODEL_EXTENSIONS = `${IFC_FILE_EXTENSIONS},${IFCX_FILE_EXTENSION}`;

@command({
    key: "file.openModel",
    icon: "icon-folder-open",
    isApplicationCommand: true,
})
export class OpenModel implements ICommand {
    async execute(app: IApplication): Promise<void> {
        PubSub.default.pub(
            "showPermanent",
            async () => {
                const files = await readFileAsync(OPEN_MODEL_EXTENSIONS, false);
                if (!files.isOk || files.value.length === 0) return;

                const fileData = files.value[0];
                const lowerName = fileData.fileName.toLowerCase();

                if (lowerName.endsWith(IFCX_FILE_EXTENSION)) {
                    await this.openIfcx(app, fileData.fileName, fileData.data);
                    return;
                }

                await this.openIfc(app, fileData.fileName, fileData.data);
            },
            "toast.excuting{0}",
            I18n.translate("command.file.openModel"),
        );
    }

    private async openIfc(app: IApplication, fileName: string, data: string): Promise<void> {
        const docName = fileName.replace(/\.(ifc|ifczip)$/i, "");
        const document = await app.newDocument(docName);

        await Transaction.executeAsync(document, "open IFC", async () => {
            const importRoot = IfcLiteService.import(data, document);
            document.modelManager.addNode(importRoot);
        });

        document.application.activeView?.cameraController.fitContent();
    }

    private async openIfcx(app: IApplication, fileName: string, data: string): Promise<void> {
        const ifcxDoc = IFCXSerializer.fromJSON(data);
        const docName = ifcxDoc.header.id || fileName.replace(IFCX_FILE_EXTENSION, "");
        const document = await app.newDocument(docName);

        await Transaction.executeAsync(document, "open IFCX", async () => {
            const importRoot = IFCXImporter.import(ifcxDoc, document);
            document.modelManager.addNode(importRoot);
        });

        document.application.activeView?.cameraController.fitContent();
    }
}
