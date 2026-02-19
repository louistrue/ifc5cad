// Part of the IFCstudio Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, Mesh, MeshNode, type IDocument, type INode } from "chili-core";
import type { IFCXDocument, IFCXNode } from "./IFCXDocument";

/**
 * IFC spatial container types. Nodes with these attributes become FolderNodes.
 * Geometry-bearing nodes (with usd::usdgeom::mesh) become MeshNodes instead.
 */
const SPATIAL_TYPES = new Set([
    "bsi::ifc::v5a::schema::IfcProjectType",
    "bsi::ifc::v5a::schema::IfcSiteType",
    "bsi::ifc::v5a::schema::IfcBuildingType",
    "bsi::ifc::v5a::schema::IfcBuildingStoreyType",
]);

/**
 * Imports an IFCXDocument into Chili3D's document model.
 *
 * Produces a FolderNode tree that mirrors the IFCX spatial hierarchy:
 * - Spatial containers (Project/Site/Building/Storey) → FolderNode
 * - Elements with usd::usdgeom::mesh data → MeshNode (display-only geometry)
 * - Other nodes without geometry → FolderNode placeholder
 *
 * Mesh geometry is reconstructed from the tessellated point+index data stored
 * in the IFCX file. Per-vertex normals are computed from triangle face data.
 */
export class IFCXImporter {
    /**
     * Converts an IFCXDocument to a FolderNode tree ready to be added to a document.
     * Returns the root FolderNode representing the imported model.
     */
    static import(ifcxDoc: IFCXDocument, document: IDocument): FolderNode {
        // Build path → IFCXNode lookup for O(1) child resolution
        const nodeMap = new Map<string, IFCXNode>();
        for (const node of ifcxDoc.data) {
            nodeMap.set(node.path, node);
        }

        // Root nodes are those not referenced as a child by any other node
        const referencedPaths = new Set<string>();
        for (const node of ifcxDoc.data) {
            for (const childPath of Object.values(node.children ?? {})) {
                if (childPath != null) referencedPaths.add(childPath);
            }
        }
        const rootIfcxNodes = ifcxDoc.data.filter((n) => !referencedPaths.has(n.path));

        // Wrap everything in a top-level folder named after the IFCX document
        const importRoot = new FolderNode(document, ifcxDoc.header.id || "Imported IFCX");
        for (const rootNode of rootIfcxNodes) {
            const child = IFCXImporter.convertNode(rootNode, nodeMap, document);
            if (child) importRoot.add(child);
        }

        return importRoot;
    }

    private static convertNode(
        ifcxNode: IFCXNode,
        nodeMap: Map<string, IFCXNode>,
        document: IDocument,
        displayName?: string,
    ): INode | undefined {
        const attrs = ifcxNode.attributes ?? {};
        const isSpatial = Object.keys(attrs).some((k) => SPATIAL_TYPES.has(k));
        const meshData = attrs["usd::usdgeom::mesh"];
        const name = displayName ?? IFCXImporter.getNodeName(ifcxNode, attrs);

        let chiliNode: INode;

        if (meshData && !isSpatial) {
            // Geometry element → reconstruct as a display mesh
            const mesh = IFCXImporter.convertMesh(meshData);
            chiliNode = mesh
                ? new MeshNode(document, mesh, name, undefined, ifcxNode.path)
                : new FolderNode(document, name, ifcxNode.path);
        } else {
            // Spatial container or generic group
            chiliNode = new FolderNode(document, name, ifcxNode.path);
        }

        // Recurse into children (only FolderNodes can hold children in Chili3D)
        if (chiliNode instanceof FolderNode && ifcxNode.children) {
            for (const [childKey, childPath] of Object.entries(ifcxNode.children)) {
                if (!childPath) continue;
                const childIfcxNode = nodeMap.get(childPath);
                if (!childIfcxNode) continue;
                const childChili = IFCXImporter.convertNode(
                    childIfcxNode,
                    nodeMap,
                    document,
                    childKey,
                );
                if (childChili) chiliNode.add(childChili);
            }
        }

        return chiliNode;
    }

    /**
     * Extracts a human-readable name from IFCX node attributes.
     * Falls back to the first 8 characters of the UUID path.
     */
    private static getNodeName(node: IFCXNode, attrs: Record<string, unknown>): string {
        for (const val of Object.values(attrs)) {
            if (val && typeof val === "object" && "Name" in (val as object)) {
                const n = (val as Record<string, unknown>)["Name"];
                if (typeof n === "string" && n.length > 0) return n;
            }
        }
        return node.path.substring(0, 8);
    }

    /**
     * Converts a usd::usdgeom::mesh attribute payload to a Chili3D Mesh.
     *
     * Input format (as written by IFCXSerializer):
     *   { points: [[x,y,z], ...], faceVertexIndices: [i0,i1,...], faceVertexCounts: [3,...] }
     *
     * Output: Chili3D surface Mesh with per-vertex normals computed from triangle faces.
     */
    private static convertMesh(meshData: unknown): Mesh | undefined {
        if (!meshData || typeof meshData !== "object") return undefined;
        const data = meshData as Record<string, unknown>;

        const points = data["points"];
        const faceVertexIndices = data["faceVertexIndices"];
        if (!Array.isArray(points) || !Array.isArray(faceVertexIndices)) return undefined;
        if (points.length === 0 || faceVertexIndices.length === 0) return undefined;

        const positionCount = points.length;
        const indexCount = faceVertexIndices.length;
        const mesh = Mesh.createSurface(positionCount, indexCount);

        // Flatten [[x,y,z], ...] → Float32Array [x,y,z, x,y,z, ...]
        const pos = mesh.position!;
        for (let i = 0; i < positionCount; i++) {
            const pt = points[i];
            if (!Array.isArray(pt) || pt.length < 3) continue;
            pos[i * 3] = Number(pt[0]);
            pos[i * 3 + 1] = Number(pt[1]);
            pos[i * 3 + 2] = Number(pt[2]);
        }

        // Fill index buffer
        const idx = mesh.index!;
        for (let i = 0; i < indexCount; i++) {
            idx[i] = Number(faceVertexIndices[i]);
        }

        // Compute per-vertex normals from triangle faces
        IFCXImporter.computeNormals(mesh.normal!, pos, idx, positionCount, indexCount);

        return mesh;
    }

    /**
     * Accumulates face normals into per-vertex normals and normalizes the result.
     * Uses the cross product of each triangle's edge vectors for face normal computation.
     */
    private static computeNormals(
        normal: Float32Array,
        pos: Float32Array,
        idx: Uint32Array,
        positionCount: number,
        indexCount: number,
    ): void {
        // Accumulate face normals at each vertex
        for (let t = 0; t < indexCount; t += 3) {
            const i0 = idx[t],
                i1 = idx[t + 1],
                i2 = idx[t + 2];

            const ax = pos[i0 * 3],
                ay = pos[i0 * 3 + 1],
                az = pos[i0 * 3 + 2];
            const bx = pos[i1 * 3],
                by = pos[i1 * 3 + 1],
                bz = pos[i1 * 3 + 2];
            const cx = pos[i2 * 3],
                cy = pos[i2 * 3 + 1],
                cz = pos[i2 * 3 + 2];

            // Edge vectors from vertex 0
            const ex = bx - ax,
                ey = by - ay,
                ez = bz - az;
            const fx = cx - ax,
                fy = cy - ay,
                fz = cz - az;

            // Cross product → unnormalized face normal
            const nx = ey * fz - ez * fy;
            const ny = ez * fx - ex * fz;
            const nz = ex * fy - ey * fx;

            for (const i of [i0, i1, i2]) {
                normal[i * 3] += nx;
                normal[i * 3 + 1] += ny;
                normal[i * 3 + 2] += nz;
            }
        }

        // Normalize each vertex normal
        for (let i = 0; i < positionCount; i++) {
            const x = normal[i * 3],
                y = normal[i * 3 + 1],
                z = normal[i * 3 + 2];
            const len = Math.sqrt(x * x + y * y + z * z);
            if (len > 0) {
                normal[i * 3] = x / len;
                normal[i * 3 + 1] = y / len;
                normal[i * 3 + 2] = z / len;
            }
        }
    }
}
