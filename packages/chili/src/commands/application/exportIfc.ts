// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, download, I18n, type IApplication, type ICommand, PubSub } from "chili-core";
import { IFC_FILE_EXTENSION, IFCLiteExporter, IFCLiteSerializer } from "ifcx-core";

@command({
    key: "file.exportIfc",
    icon: "icon-download",
})
export class ExportIfc implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const document = app.activeView?.document;

        if (!document) {
            PubSub.default.pub("showToast", "error.ifcx.noDocument");
            return;
        }

        PubSub.default.pub(
            "showPermanent",
            async () => {
                const ifc = IFCLiteExporter.export(document, "IFC4X3");
                const step = IFCLiteSerializer.stringify(ifc);

                PubSub.default.pub("showToast", "toast.downloading");
                download([step], `${document.name}${IFC_FILE_EXTENSION}`);
            },
            "toast.excuting{0}",
            I18n.translate("command.file.exportIfc"),
        );
    }
}
