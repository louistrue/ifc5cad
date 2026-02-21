// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IDocument } from "chili-core";
import { IfcLiteExporter } from "./ifcLiteExporter";
import { IfcLiteImporter } from "./ifcLiteImporter";
import { IfcLiteParser } from "./ifcLiteParser";

export class IfcLiteService {
    static import(text: string, document: IDocument) {
        const parsed = IfcLiteParser.parse(text);
        return IfcLiteImporter.import(parsed, document);
    }

    static export(document: IDocument): string {
        return IfcLiteExporter.export(document);
    }
}
