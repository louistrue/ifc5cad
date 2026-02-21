// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import { MeshNode, NodeUtils } from "chili-core";
import { TestDocument } from "../../chili-core/test/testDocument";
import { IfcLiteImporter } from "../src/ifcLiteImporter";
import { IfcLiteParser } from "../src/ifcLiteParser";

const IFC_WITH_TESSELLATION = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4X3_ADD2'));
ENDSEC;
DATA;
#1=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(1.,0.,0.),(0.,1.,0.)));
#2=IFCTRIANGULATEDFACESET(#1,$,.T.,((1,2,3)),$);
#3=IFCSHAPEREPRESENTATION(#100,'Body','Tessellation',(#2));
#4=IFCPRODUCTDEFINITIONSHAPE($,$,(#3));
#10=IFCPROJECT('g',$,'Demo',$,$,$,$,(#100),#200);
#20=IFCSITE('s',$,'Site',$,$,#300,$,$,.ELEMENT.,$,$,$,$,$);
#21=IFCBUILDING('b',$,'Building',$,$,#300,$,$,.ELEMENT.,$,$,$);
#22=IFCBUILDINGSTOREY('t',$,'Storey',$,$,#300,$,$,.ELEMENT.,0.);
#30=IFCBUILDINGELEMENTPROXY('p',$,'Box',$,$,#300,#4,$);
#40=IFCRELAGGREGATES('ra',$,$,$,#10,(#20));
#41=IFCRELAGGREGATES('rb',$,$,$,#20,(#21));
#42=IFCRELAGGREGATES('rc',$,$,$,#21,(#22));
#43=IFCRELCONTAINEDINSPATIALSTRUCTURE('rd',$,$,$,(#30),#22);
ENDSEC;
END-ISO-10303-21;`;

describe("IfcLiteImporter", () => {
    test("should create mesh node from IFC triangulated face set", () => {
        const parsed = IfcLiteParser.parse(IFC_WITH_TESSELLATION);
        const doc = new TestDocument();

        const root = IfcLiteImporter.import(parsed, doc);
        const project = root.children()[0];
        expect(NodeUtils.isLinkedListNode(project)).toBeTruthy();
        const site = NodeUtils.isLinkedListNode(project) ? project.children()[0] : undefined;
        expect(site && NodeUtils.isLinkedListNode(site)).toBeTruthy();
        const building = site && NodeUtils.isLinkedListNode(site) ? site.children()[0] : undefined;
        expect(building && NodeUtils.isLinkedListNode(building)).toBeTruthy();
        const storey = building && NodeUtils.isLinkedListNode(building) ? building.children()[0] : undefined;
        expect(storey && NodeUtils.isLinkedListNode(storey)).toBeTruthy();
        const box = storey && NodeUtils.isLinkedListNode(storey) ? storey.children()[0] : undefined;

        expect(box instanceof MeshNode).toBeTruthy();
        if (!(box instanceof MeshNode)) {
            throw new Error("Expected MeshNode");
        }
        expect(box.mesh.index?.length).toBe(3);
        expect(box.mesh.position?.length).toBe(9);
    });
});
