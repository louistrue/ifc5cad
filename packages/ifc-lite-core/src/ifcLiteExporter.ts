// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { NodeUtils, type IDocument, type INodeLinkedList } from "chili-core";

const IFC_SCHEMA = "IFC4X3_ADD2";

export class IfcLiteExporter {
    static export(document: IDocument): string {
        const writer = new IfcStepWriter();

        const origin = writer.entity("IFCCARTESIANPOINT", ["(0.,0.,0.)"]);
        const worldAxis = writer.entity("IFCAXIS2PLACEMENT3D", [origin, "$", "$"]);
        const context = writer.entity("IFCGEOMETRICREPRESENTATIONCONTEXT", [
            "$",
            "'Model'",
            "3",
            "1.E-5",
            worldAxis,
            "$",
        ]);
        const units = writer.entity("IFCUNITASSIGNMENT", ["()"]);

        const sitePlacement = writer.entity("IFCLOCALPLACEMENT", ["$", worldAxis]);
        const buildingPlacement = writer.entity("IFCLOCALPLACEMENT", [sitePlacement, worldAxis]);
        const storeyPlacement = writer.entity("IFCLOCALPLACEMENT", [buildingPlacement, worldAxis]);

        const project = writer.entity("IFCPROJECT", [
            "'2Q$nYn96f5xhkg5f9JAF7q'",
            "$",
            quote(document.name),
            "$",
            "$",
            "$",
            "$",
            `(${context})`,
            units,
        ]);

        const site = writer.entity("IFCSITE", [
            "'0$SITE000000000000000000'",
            "$",
            quote(`${document.name} Site`),
            "$",
            "$",
            sitePlacement,
            "$",
            "$",
            ".ELEMENT.",
            "$",
            "$",
            "$",
            "$",
            "$",
        ]);

        const building = writer.entity("IFCBUILDING", [
            "'0$BLDG000000000000000000'",
            "$",
            quote(`${document.name} Building`),
            "$",
            "$",
            buildingPlacement,
            "$",
            "$",
            ".ELEMENT.",
            "$",
            "$",
            "$",
        ]);

        const storey = writer.entity("IFCBUILDINGSTOREY", [
            "'0$STRY000000000000000000'",
            "$",
            quote(`${document.name} Storey`),
            "$",
            "$",
            storeyPlacement,
            "$",
            "$",
            ".ELEMENT.",
            "0.",
        ]);

        const proxyIds = exportModelNodes(writer, document.modelManager.rootNode, storeyPlacement);

        writer.entity("IFCRELAGGREGATES", [
            "'0$REL000000000000000000'",
            "$",
            quote("Project Aggregates"),
            "$",
            project,
            `(${site})`,
        ]);
        writer.entity("IFCRELAGGREGATES", [
            "'0$REL000000000000000001'",
            "$",
            quote("Site Aggregates"),
            "$",
            site,
            `(${building})`,
        ]);
        writer.entity("IFCRELAGGREGATES", [
            "'0$REL000000000000000002'",
            "$",
            quote("Building Aggregates"),
            "$",
            building,
            `(${storey})`,
        ]);

        if (proxyIds.length > 0) {
            writer.entity("IFCRELCONTAINEDINSPATIALSTRUCTURE", [
                "'0$REL000000000000000003'",
                "$",
                quote("Storey Containment"),
                "$",
                `(${proxyIds.join(",")})`,
                storey,
            ]);
        }

        return [
            "ISO-10303-21;",
            "HEADER;",
            `FILE_DESCRIPTION(('ViewDefinition [${IFC_SCHEMA}]'),'2;1');`,
            `FILE_NAME('${document.name}.ifc','${new Date().toISOString()}',('Chili3D'),('Chili3D'),'Chili3D','Chili3D','');`,
            `FILE_SCHEMA(('${IFC_SCHEMA}'));`,
            "ENDSEC;",
            "DATA;",
            ...writer.lines,
            "ENDSEC;",
            "END-ISO-10303-21;",
        ].join("\n");
    }
}

function exportModelNodes(writer: IfcStepWriter, rootNode: INodeLinkedList, placement: string): string[] {
    const ids: string[] = [];

    let child = rootNode.firstChild;
    while (child) {
        if (NodeUtils.isLinkedListNode(child) && child.count > 0) {
            ids.push(...exportModelNodes(writer, child, placement));
        } else {
            ids.push(
                writer.entity("IFCBUILDINGELEMENTPROXY", [
                    `'${safeGuid(child.id)}'`,
                    "$",
                    quote(child.name),
                    "$",
                    "$",
                    placement,
                    "$",
                    "$",
                ]),
            );
        }
        child = child.nextSibling;
    }

    return ids;
}

function quote(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

function safeGuid(value: string): string {
    const normalized = value.replace(/[^a-zA-Z0-9_$]/g, "").slice(0, 22);
    return normalized.padEnd(22, "0");
}

class IfcStepWriter {
    private _id = 1;
    readonly lines: string[] = [];

    entity(type: string, args: string[]): string {
        const ref = `#${this._id++}`;
        this.lines.push(`${ref}=${type}(${args.join(",")});`);
        return ref;
    }
}
