// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import { MeshNode, NodeUtils } from "chili-core";
import { TestDocument } from "../../chili-core/test/testDocument";
import { IfcLiteService } from "../src/ifcLiteService";

const TRIANGULATED_IFC = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4X3_ADD2'));
ENDSEC;
DATA;
#1=IFCPROJECT('g',$,'Demo',$,$,$,$,(#2),#3);
#2=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#4,$);
#3=IFCUNITASSIGNMENT(());
#4=IFCAXIS2PLACEMENT3D(#5,$,$);
#5=IFCCARTESIANPOINT((0.,0.,0.));
#10=IFCBUILDINGELEMENTPROXY('id',$,'Proxy',$,$,$,#20,$);
#20=IFCPRODUCTDEFINITIONSHAPE($,$,(#30));
#30=IFCSHAPEREPRESENTATION(#2,'Body','Tessellation',(#40));
#40=IFCTRIANGULATEDFACESET(#50,$,.T.,((1,2,3)),$);
#50=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(1.,0.,0.),(0.,1.,0.)));
#60=IFCRELCONTAINEDINSPATIALSTRUCTURE('r',$,$,$,(#10),#1);
ENDSEC;
END-ISO-10303-21;`;

const EXTRUDED_IFC = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4X3_ADD2'));
ENDSEC;
DATA;
#1=IFCPROJECT('g',$,'Demo',$,$,$,$,(#2),#3);
#2=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#4,$);
#3=IFCUNITASSIGNMENT(());
#4=IFCAXIS2PLACEMENT3D(#5,$,$);
#5=IFCCARTESIANPOINT((0.,0.,0.));
#10=IFCBUILDINGELEMENTPROXY('id',$,'Wall',$,$,$,#20,$);
#20=IFCPRODUCTDEFINITIONSHAPE($,$,(#30));
#30=IFCSHAPEREPRESENTATION(#2,'Body','SweptSolid',(#40));
#40=IFCEXTRUDEDAREASOLID(#41,#42,#43,2.0);
#41=IFCRECTANGLEPROFILEDEF(.AREA.,'Rect',$,2.0,1.0);
#42=IFCAXIS2PLACEMENT3D(#5,$,$);
#43=IFCDIRECTION((0.,0.,1.));
#60=IFCRELCONTAINEDINSPATIALSTRUCTURE('r',$,$,$,(#10),#1);
ENDSEC;
END-ISO-10303-21;`;

describe("IfcLiteImporter", () => {
    test("should create mesh node from triangulated face set", () => {
        const doc = new TestDocument();
        const root = IfcLiteService.import(TRIANGULATED_IFC, doc);

        const nodes = NodeUtils.findNodes(root);
        const meshNode = nodes.find((x) => x instanceof MeshNode) as MeshNode | undefined;
        expect(meshNode).toBeDefined();
        expect(meshNode?.mesh.index?.length).toBe(3);
    });

    test("should create mesh node from extruded area solid", () => {
        const doc = new TestDocument();
        const root = IfcLiteService.import(EXTRUDED_IFC, doc);

        const nodes = NodeUtils.findNodes(root);
        const meshNode = nodes.find((x) => x instanceof MeshNode) as MeshNode | undefined;
        expect(meshNode).toBeDefined();
        expect((meshNode?.mesh.index?.length ?? 0) > 0).toBe(true);
    });
});
