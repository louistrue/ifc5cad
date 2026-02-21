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

@command({
    key: "file.openIfc",
    icon: "icon-folder-open",
    isApplicationCommand: true,
})
export class OpenIfc implements ICommand {
    async execute(app: IApplication): Promise<void> {
        PubSub.default.pub(
            "showPermanent",
            async () => {
                const files = await readFileAsync(IFC_FILE_EXTENSIONS, false);
                if (!files.isOk || files.value.length === 0) return;

                const fileData = files.value[0];
                const docName = fileData.fileName.replace(/\.(ifc|ifczip)$/i, "");
                const document = await app.newDocument(docName);

                await Transaction.executeAsync(document, "open IFC", async () => {
                    const importRoot = IfcLiteService.import(fileData.data, document);
                    document.modelManager.addNode(importRoot);
                });

                document.application.activeView?.cameraController.fitContent();
            },
            "toast.excuting{0}",
            I18n.translate("command.file.openIfc"),
        );
    }
}
