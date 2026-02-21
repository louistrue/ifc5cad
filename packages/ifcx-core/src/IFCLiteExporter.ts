// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IDocument, NodeUtils, type INode } from "chili-core";
import type { IFCDocument, IFCSchemaVersion } from "./IFCLiteDocument";
import { IFCLiteSerializer } from "./IFCLiteSerializer";

export class IFCLiteExporter {
    static export(document: IDocument, schema: IFCSchemaVersion = "IFC4X3"): IFCDocument {
        let nextId = 1;
        const entities = [] as ReturnType<typeof IFCLiteSerializer.makeEntity>[];
        const root = document.modelManager.rootNode;

        const projectId = nextId++;
        entities.push(
            IFCLiteSerializer.makeEntity(
                projectId,
                "IFCPROJECT",
                IFCLiteExporter.globalId(projectId),
                "$",
                IFCLiteSerializer.quote(document.name || "Project"),
                "$",
                "$",
                "$",
                "$",
                "$",
            ),
        );

        const roots: INode[] = [];
        let cursor = root.firstChild;
        while (cursor) {
            roots.push(cursor);
            cursor = cursor.nextSibling;
        }

        const topSpatialId = nextId++;
        entities.push(
            IFCLiteSerializer.makeEntity(
                topSpatialId,
                "IFCBUILDING",
                IFCLiteExporter.globalId(topSpatialId),
                "$",
                IFCLiteSerializer.quote("Building"),
                "$",
                "$",
                "$",
                "$",
                "$",
                "$",
                "$",
            ),
        );
        const projectRelId = nextId++;
        entities.push(
            IFCLiteSerializer.makeEntity(
                projectRelId,
                "IFCRELAGGREGATES",
                IFCLiteExporter.globalId(projectRelId),
                "$",
                IFCLiteSerializer.quote("Project Aggregation"),
                "$",
                `#${projectId}`,
                `(#${topSpatialId})`,
            ),
        );

        const childrenIds: number[] = [];
        for (const child of roots) {
            const id = IFCLiteExporter.appendNode(entities, child, () => nextId++);
            childrenIds.push(id);
        }

        if (childrenIds.length > 0) {
            const buildingRelId = nextId++;
            entities.push(
                IFCLiteSerializer.makeEntity(
                    buildingRelId,
                    "IFCRELAGGREGATES",
                    IFCLiteExporter.globalId(buildingRelId),
                    "$",
                    IFCLiteSerializer.quote("Building Aggregation"),
                    "$",
                    `#${topSpatialId}`,
                    `(${childrenIds.map((x) => `#${x}`).join(",")})`,
                ),
            );
        }

        return { schema, entities };
    }

    private static appendNode(
        entities: ReturnType<typeof IFCLiteSerializer.makeEntity>[],
        node: INode,
        allocateId: () => number,
    ): number {
        const id = allocateId();
        const type = NodeUtils.isLinkedListNode(node) ? "IFCBUILDINGSTOREY" : "IFCBUILDINGELEMENTPROXY";
        const args =
            type === "IFCBUILDINGSTOREY"
                ? [
                      IFCLiteExporter.globalId(id),
                      "$",
                      IFCLiteSerializer.quote(node.name),
                      "$",
                      "$",
                      "$",
                      "$",
                      "$",
                      "$",
                      "$",
                      "$",
                  ]
                : [
                      IFCLiteExporter.globalId(id),
                      "$",
                      IFCLiteSerializer.quote(node.name),
                      "$",
                      "$",
                      "$",
                      "$",
                      "$",
                      "$",
                  ];
        entities.push(IFCLiteSerializer.makeEntity(id, type, ...args));

        if (NodeUtils.isLinkedListNode(node)) {
            const children: INode[] = [];
            let cursor = node.firstChild;
            while (cursor) {
                children.push(cursor);
                cursor = cursor.nextSibling;
            }

            const spatialChildren: number[] = [];
            const elements: number[] = [];

            for (const child of children) {
                const childId = IFCLiteExporter.appendNode(entities, child, allocateId);
                if (NodeUtils.isLinkedListNode(child)) {
                    spatialChildren.push(childId);
                } else {
                    elements.push(childId);
                }
            }

            if (spatialChildren.length > 0) {
                const relId = allocateId();
                entities.push(
                    IFCLiteSerializer.makeEntity(
                        relId,
                        "IFCRELAGGREGATES",
                        IFCLiteExporter.globalId(relId),
                        "$",
                        IFCLiteSerializer.quote("Spatial Aggregation"),
                        "$",
                        `#${id}`,
                        `(${spatialChildren.map((x) => `#${x}`).join(",")})`,
                    ),
                );
            }

            if (elements.length > 0) {
                const relId = allocateId();
                entities.push(
                    IFCLiteSerializer.makeEntity(
                        relId,
                        "IFCRELCONTAINEDINSPATIALSTRUCTURE",
                        IFCLiteExporter.globalId(relId),
                        "$",
                        IFCLiteSerializer.quote("Contained Elements"),
                        "$",
                        `(${elements.map((x) => `#${x}`).join(",")})`,
                        `#${id}`,
                    ),
                );
            }
        }

        return id;
    }

    private static globalId(seed: number): string {
        const value = `IFC5CAD${seed.toString(36).toUpperCase().padStart(15, "0")}`;
        return IFCLiteSerializer.quote(value.slice(0, 22));
    }
}
