// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, download, I18n, type IApplication, type ICommand, PubSub } from "chili-core";
import { IFCX_FILE_EXTENSION, IFCXSerializer } from "ifcx-core";

/**
 * Exports the active Chili3D document as an IFCX (IFC5) file.
 *
 * The exported file follows the IFCX alpha format:
 * - Standard IFC spatial hierarchy (Project → Site → Building → Storey)
 * - All scene nodes preserved with their hierarchy
 * - USD Xform components for positioning (geometry tessellation in Phase 1)
 * - Swiss schema references bundled for offline use
 *
 * The file can be opened in the buildingSMART IFCX viewer at:
 * https://ifc5.technical.buildingsmart.org/viewer/
 */
@command({
    key: "file.exportIfcx",
    icon: "icon-download",
})
export class ExportIfcx implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const document = app.activeView?.document;

        if (!document) {
            PubSub.default.pub("showToast", "error.ifcx.noDocument");
            return;
        }

        PubSub.default.pub(
            "showPermanent",
            async () => {
                const ifcxDoc = IFCXSerializer.serialize(document, "IFCstudio");
                const json = IFCXSerializer.toJSON(ifcxDoc);

                PubSub.default.pub("showToast", "toast.downloading");
                download([json], `${document.name}${IFCX_FILE_EXTENSION}`);
            },
            "toast.excuting{0}",
            I18n.translate("command.file.exportIfcx"),
        );
    }
}
