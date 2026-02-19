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
import { IFCX_FILE_EXTENSION, IFCXImporter, IFCXSerializer } from "ifcx-core";

@command({
    key: "file.openIfcx",
    icon: "icon-open",
    isApplicationCommand: true,
})
export class OpenIfcx implements ICommand {
    async execute(app: IApplication): Promise<void> {
        PubSub.default.pub(
            "showPermanent",
            async () => {
                const files = await readFileAsync(IFCX_FILE_EXTENSION, false);
                if (!files.isOk || files.value.length === 0) return;

                const fileData = files.value[0];
                const ifcxDoc = IFCXSerializer.fromJSON(fileData.data);

                // Use the IFCX header id as the document name, falling back to the file name
                const docName =
                    ifcxDoc.header.id ||
                    fileData.fileName.replace(IFCX_FILE_EXTENSION, "");

                const document = await app.newDocument(docName);

                await Transaction.executeAsync(document, "open IFCX", async () => {
                    const importRoot = IFCXImporter.import(ifcxDoc, document);
                    document.modelManager.addNode(importRoot);
                });

                document.application.activeView?.cameraController.fitContent();
            },
            "toast.excuting{0}",
            I18n.translate("command.file.openIfcx"),
        );
    }
}
