// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IIfcLiteDocument, IIfcLiteEntity } from "./ifcLiteDocument";

const ENTITY_REGEX = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\((.*)\);/gis;
const FILE_SCHEMA_REGEX = /FILE_SCHEMA\s*\(\s*\(([^)]*)\)\s*\)\s*;/i;

export class IfcLiteParser {
    static parse(text: string): IIfcLiteDocument {
        const dataSection = IfcLiteParser.extractDataSection(text);
        const entities: IIfcLiteEntity[] = [];

        for (const match of dataSection.matchAll(ENTITY_REGEX)) {
            entities.push({
                id: Number.parseInt(match[1], 10),
                type: match[2],
                args: splitTopLevel(match[3]),
                raw: match[0],
            });
        }

        return {
            header: extractHeaderSection(text),
            schemas: extractSchemas(text),
            entities,
        };
    }

    static extractDataSection(text: string): string {
        const upper = text.toUpperCase();
        const start = upper.indexOf("DATA;");
        const end = upper.lastIndexOf("ENDSEC;");
        if (start < 0 || end < 0 || end <= start) {
            return "";
        }
        return text.slice(start + "DATA;".length, end);
    }
}

function extractHeaderSection(text: string): string {
    const upper = text.toUpperCase();
    const headerStart = upper.indexOf("HEADER;");
    const dataStart = upper.indexOf("DATA;");
    if (headerStart < 0 || dataStart < 0 || dataStart <= headerStart) {
        return "";
    }
    return text.slice(headerStart, dataStart).trim();
}

function extractSchemas(text: string): string[] {
    const match = text.match(FILE_SCHEMA_REGEX);
    if (!match) return [];
    return splitTopLevel(match[1]).map((x) => unquote(x.toUpperCase()));
}

function splitTopLevel(value: string): string[] {
    const result: string[] = [];
    let current = "";
    let depth = 0;
    let inString = false;

    for (let i = 0; i < value.length; i++) {
        const ch = value[i];

        if (ch === "'" && value[i - 1] !== "\\") {
            inString = !inString;
            current += ch;
            continue;
        }

        if (!inString) {
            if (ch === "(") depth++;
            if (ch === ")") depth--;
            if (ch === "," && depth === 0) {
                result.push(current.trim());
                current = "";
                continue;
            }
        }

        current += ch;
    }

    if (current.trim().length > 0) {
        result.push(current.trim());
    }

    return result;
}

export function parseEntityReference(value: string): number | undefined {
    const match = value.trim().match(/^#(\d+)$/);
    return match ? Number.parseInt(match[1], 10) : undefined;
}

export function parseReferenceList(value: string): number[] {
    const trimmed = value.trim();
    if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
        return [];
    }
    const values = splitTopLevel(trimmed.slice(1, -1));
    return values.map(parseEntityReference).filter((x): x is number => x !== undefined);
}

export function unquote(value: string): string {
    const trimmed = value.trim();
    if (trimmed === "$" || trimmed.length === 0) return "";
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        return trimmed.slice(1, -1).replace(/''/g, "'");
    }
    return trimmed;
}
