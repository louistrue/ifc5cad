// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import { IFCLiteSerializer } from "../src/IFCLiteSerializer";

describe("IFCLiteSerializer", () => {
    test("parses IFC schema and entities", () => {
        const content = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4X3'));
ENDSEC;
DATA;
#1=IFCPROJECT('g',$,'Demo',$,$,$,$,$);
#2=IFCRELAGGREGATES('r',$,'Agg',$,#1,(#3,#4));
#3=IFCSITE('s',$,'Site',$,$,$,$,$,$,$,$,$,$);
#4=IFCBUILDING('b',$,'Building',$,$,$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;

        const parsed = IFCLiteSerializer.parse(content);

        expect(parsed.schema).toBe("IFC4X3");
        expect(parsed.entities.length).toBe(4);
        expect(parsed.entities[1].type).toBe("IFCRELAGGREGATES");
        expect(IFCLiteSerializer.listRefs(parsed.entities[1].args[5])).toEqual([3, 4]);
    });

    test("round-trips generated IFC data", () => {
        const source = {
            schema: "IFC4" as const,
            entities: [
                IFCLiteSerializer.makeEntity(1, "IFCPROJECT", "'g'", "$", "'Demo'", "$", "$", "$", "$", "$"),
            ],
        };

        const output = IFCLiteSerializer.stringify(source);
        const parsed = IFCLiteSerializer.parse(output);

        expect(parsed.schema).toBe("IFC4");
        expect(parsed.entities[0].type).toBe("IFCPROJECT");
        expect(IFCLiteSerializer.decodeString(parsed.entities[0].args[2], "")).toBe("Demo");
    });
});
