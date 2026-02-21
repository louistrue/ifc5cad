// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import { IfcLiteParser, parseReferenceList, unquote } from "../src/ifcLiteParser";

const SAMPLE_IFC = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4X3_ADD2'));
ENDSEC;
DATA;
#1=IFCPROJECT('g',$,'Demo',$,$,$,$,(#2),#3);
#10=IFCRELAGGREGATES('r',$,$,$,#1,(#20,#30));
ENDSEC;
END-ISO-10303-21;`;

describe("IfcLiteParser", () => {
    test("should parse schemas and entities", () => {
        const result = IfcLiteParser.parse(SAMPLE_IFC);

        expect(result.schemas).toEqual(["IFC4X3_ADD2"]);
        expect(result.entities.length).toBe(2);
        expect(result.entities[0].id).toBe(1);
        expect(result.entities[0].type).toBe("IFCPROJECT");
    });

    test("should parse reference list and unquote values", () => {
        expect(parseReferenceList("(#1,#2,#3)")).toEqual([1, 2, 3]);
        expect(unquote("'Wall A'")).toBe("Wall A");
        expect(unquote("$")).toBe("");
    });
});
