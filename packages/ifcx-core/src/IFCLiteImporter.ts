// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, type IDocument, type INode, type INodeLinkedList } from "chili-core";
import type { IFCDocument, IFCEntity } from "./IFCLiteDocument";
import { IFCLiteSerializer } from "./IFCLiteSerializer";

const SPATIAL_TYPES = new Set(["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY", "IFCSPACE"]);

export class IFCLiteImporter {
    static import(ifc: IFCDocument, document: IDocument): FolderNode {
        const entityMap = new Map<number, IFCEntity>(ifc.entities.map((x) => [x.id, x]));
        const byParent = new Map<number, number[]>();
        const usedAsChild = new Set<number>();

        for (const rel of ifc.entities) {
            if (rel.type === "IFCRELAGGREGATES") {
                const parent = IFCLiteSerializer.firstRef(rel.args[4]);
                const children = IFCLiteSerializer.listRefs(rel.args[5]);
                if (parent) {
                    byParent.set(parent, [...(byParent.get(parent) ?? []), ...children]);
                    for (const child of children) usedAsChild.add(child);
                }
            }
            if (rel.type === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
                const children = IFCLiteSerializer.listRefs(rel.args[4]);
                const parent = IFCLiteSerializer.firstRef(rel.args[5]);
                if (parent) {
                    byParent.set(parent, [...(byParent.get(parent) ?? []), ...children]);
                    for (const child of children) usedAsChild.add(child);
                }
            }
        }

        const importRoot = new FolderNode(document, `Imported ${ifc.schema}`);
        const rootEntities = ifc.entities.filter((x) => SPATIAL_TYPES.has(x.type) && !usedAsChild.has(x.id));
        const seeds = rootEntities.length > 0 ? rootEntities : ifc.entities.filter((x) => SPATIAL_TYPES.has(x.type));
        const seen = new Set<number>();

        for (const seed of seeds) {
            const node = IFCLiteImporter.toNode(seed.id, entityMap, byParent, document, seen);
            if (node) importRoot.add(node);
        }

        return importRoot;
    }

    private static toNode(
        id: number,
        entityMap: Map<number, IFCEntity>,
        byParent: Map<number, number[]>,
        document: IDocument,
        seen: Set<number>,
    ): INode | undefined {
        if (seen.has(id)) return undefined;
        const entity = entityMap.get(id);
        if (!entity) return undefined;
        seen.add(id);

        const name = IFCLiteSerializer.decodeString(entity.args[2], `${entity.type}_${entity.id}`);
        const container = new FolderNode(document, name, `ifc-${entity.id}`);

        const children = byParent.get(id) ?? [];
        for (const childId of children) {
            const childNode = IFCLiteImporter.toNode(childId, entityMap, byParent, document, seen);
            if (childNode && IFCLiteImporter.isLinkedList(container)) {
                container.add(childNode);
            }
        }

        return container;
    }

    private static isLinkedList(node: INode): node is INodeLinkedList {
        return (node as INodeLinkedList).add !== undefined;
    }
}
