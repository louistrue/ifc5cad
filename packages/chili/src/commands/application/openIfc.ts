// Part of the IFCstudio Project, under the AGPL-3.0 License.
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
import { IFC_FILE_EXTENSION, IFCLiteImporter, IFCLiteSerializer } from "ifcx-core";

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
                const files = await readFileAsync(IFC_FILE_EXTENSION, false);
                if (!files.isOk || files.value.length === 0) return;

                const fileData = files.value[0];
                const ifcDoc = IFCLiteSerializer.parse(fileData.data);
                const document = await app.newDocument(fileData.fileName.replace(IFC_FILE_EXTENSION, ""));

                await Transaction.executeAsync(document, "open IFC", async () => {
                    const importRoot = IFCLiteImporter.import(ifcDoc, document);
                    document.modelManager.addNode(importRoot);
                });

                document.application.activeView?.cameraController.fitContent();
            },
            "toast.excuting{0}",
            I18n.translate("command.file.openIfc"),
        );
    }
}
