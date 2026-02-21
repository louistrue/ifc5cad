// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, download, I18n, type IApplication, type ICommand, PubSub } from "chili-core";
import { IFC_PRIMARY_FILE_EXTENSION, IfcLiteService } from "ifc-lite-core";

@command({
    key: "file.exportIfc",
    icon: "icon-download",
})
export class ExportIfc implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const document = app.activeView?.document;

        if (!document) {
            PubSub.default.pub("showToast", "error.ifc.noDocument");
            return;
        }

        PubSub.default.pub(
            "showPermanent",
            async () => {
                const ifcText = IfcLiteService.export(document);

                PubSub.default.pub("showToast", "toast.downloading");
                download([ifcText], `${document.name}${IFC_PRIMARY_FILE_EXTENSION}`);
            },
            "toast.excuting{0}",
            I18n.translate("command.file.exportIfc"),
        );
    }
}
