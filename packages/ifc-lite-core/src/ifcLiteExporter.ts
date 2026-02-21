// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    GeometryNode,
    Matrix4,
    MeshNode,
    NodeUtils,
    type IDocument,
    type INode,
    type INodeLinkedList,
} from "chili-core";

const IFC_SCHEMA = "IFC4X3_ADD2";

interface ITriangulatedMesh {
    points: number[];
    indices: number[];
}

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

        const proxyIds = exportModelNodes(
            writer,
            document.modelManager.rootNode,
            storeyPlacement,
            context,
            Matrix4.identity(),
        );

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

function exportModelNodes(
    writer: IfcStepWriter,
    rootNode: INodeLinkedList,
    placement: string,
    context: string,
    parentTransform: Matrix4,
): string[] {
    const ids: string[] = [];

    let child = rootNode.firstChild;
    while (child) {
        const childTransform = parentTransform.multiply(getNodeTransform(child));

        if (NodeUtils.isLinkedListNode(child) && child.firstChild) {
            ids.push(...exportModelNodes(writer, child, placement, context, childTransform));
        } else {
            ids.push(exportProxyNode(writer, child, placement, context, childTransform));
        }
        child = child.nextSibling;
    }

    return ids;
}

function exportProxyNode(
    writer: IfcStepWriter,
    node: INode,
    placement: string,
    context: string,
    transform: Matrix4,
): string {
    const representation = createRepresentation(writer, node, context, transform);

    return writer.entity("IFCBUILDINGELEMENTPROXY", [
        `'${safeGuid(node.id)}'`,
        "$",
        quote(node.name),
        "$",
        "$",
        placement,
        representation ?? "$",
        "$",
    ]);
}

function createRepresentation(
    writer: IfcStepWriter,
    node: INode,
    context: string,
    transform: Matrix4,
): string | undefined {
    const mesh = triangulatedMeshFromNode(node, transform);
    if (!mesh || mesh.points.length === 0 || mesh.indices.length === 0) {
        return undefined;
    }

    const pointList = writer.entity("IFCCARTESIANPOINTLIST3D", [toPointList(mesh.points)]);
    const triangulatedFaceSet = writer.entity("IFCTRIANGULATEDFACESET", [
        pointList,
        "$",
        ".T.",
        toCoordIndex(mesh.indices),
        "$",
    ]);

    const shapeRepresentation = writer.entity("IFCSHAPEREPRESENTATION", [
        context,
        "'Body'",
        "'Tessellation'",
        `(${triangulatedFaceSet})`,
    ]);

    return writer.entity("IFCPRODUCTDEFINITIONSHAPE", ["$", "$", `(${shapeRepresentation})`]);
}

function triangulatedMeshFromNode(node: INode, transform: Matrix4): ITriangulatedMesh | undefined {
    if (node instanceof GeometryNode) {
        const faces = node.mesh.faces;
        if (!faces || faces.position.length === 0 || faces.index.length === 0) {
            return undefined;
        }
        return {
            points: transform.ofPoints(faces.position),
            indices: Array.from(faces.index),
        };
    }

    if (node instanceof MeshNode) {
        const { mesh } = node;
        if (mesh.meshType !== "surface" || !mesh.position || !mesh.index) {
            return undefined;
        }

        return {
            points: transform.ofPoints(mesh.position),
            indices: Array.from(mesh.index),
        };
    }

    return undefined;
}


function getNodeTransform(node: INode): Matrix4 {
    const candidate = node as INode & { transform?: Matrix4 };
    return candidate.transform ?? Matrix4.identity();
}

function toPointList(points: number[]): string {
    const list: string[] = [];
    for (let i = 0; i < points.length; i += 3) {
        list.push(`(${toIfcNumber(points[i])},${toIfcNumber(points[i + 1])},${toIfcNumber(points[i + 2])})`);
    }
    return `(${list.join(",")})`;
}

function toCoordIndex(indices: number[]): string {
    const triangles: string[] = [];
    for (let i = 0; i < indices.length; i += 3) {
        triangles.push(`(${indices[i] + 1},${indices[i + 1] + 1},${indices[i + 2] + 1})`);
    }
    return `(${triangles.join(",")})`;
}

function toIfcNumber(value: number): string {
    if (!Number.isFinite(value)) {
        return "0.";
    }
    const fixed = value.toFixed(6);
    return `${Number.parseFloat(fixed)}`;
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
