import type { Info as ToolInfo } from "@opencode/plugin/promise/tool";
import { classifyPair } from "./engine/index.ts";
import { RelateError, type SourceRef } from "./engine/types.ts";

function toRef(o: unknown, fallbackKind: string): SourceRef {
  const r = (o ?? {}) as Record<string, unknown>;
  return {
    id: typeof r["id"] === "string" && (r["id"] as string).length > 0 ? (r["id"] as string) : `relate-anon-${Math.random().toString(36).slice(2, 8)}`,
    kind: typeof r["kind"] === "string" ? (r["kind"] as string) : fallbackKind,
  };
}

const pairInput = {
  type: "object",
  properties: {
    left_text: { type: "string", minLength: 1 },
    right_text: { type: "string", minLength: 1 },
    left: { type: "object", properties: { id: { type: "string" }, kind: { type: "string" } }, additionalProperties: false },
    right: { type: "object", properties: { id: { type: "string" }, kind: { type: "string" } }, additionalProperties: false },
  },
  required: ["left_text", "right_text"],
  additionalProperties: false,
} as const;

function run(input: unknown) {
  const args = input as { left_text: string; right_text: string; left?: unknown; right?: unknown };
  try {
    const observation = classifyPair(args.left_text, args.right_text, toRef(args.left, "text"), toRef(args.right, "text"));
    return { content: JSON.stringify({ observation }, null, 2) };
  } catch (error) {
    if (error instanceof RelateError) return { content: JSON.stringify({ error: error.code, message: error.message }) };
    throw error;
  }
}

export function RelatePair(): ToolInfo {
  return {
    name: "relate",
    description: "Judge the typed directional relationship between two texts. Returns RelationObservation with evidence or first-class UNKNOWN.",
    input: pairInput,
    async execute(input) {
      return run(input);
    },
  };
}

export function RelateMany(): ToolInfo {
  return {
    name: "relate_many",
    description: "Judge one focal text against up to 8 candidates. Returns one RelationObservation per candidate.",
    input: {
      type: "object",
      properties: {
        focal_text: { type: "string", minLength: 1 },
        candidates: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              text: { type: "string", minLength: 1 },
              id: { type: "string" },
              kind: { type: "string" },
            },
            required: ["text"],
            additionalProperties: false,
          },
        },
      },
      required: ["focal_text", "candidates"],
      additionalProperties: false,
    },
    async execute(input) {
      const args = input as { focal_text: string; candidates: Array<{ text: string; id?: string; kind?: string }> };
      const focal = toRef(undefined, "text");
      focal.id = "relate-focal";
      try {
        const observations = args.candidates.map((c, i) =>
          classifyPair(args.focal_text, c.text, focal, toRef({ id: c.id ?? `candidate-${i}`, kind: c.kind ?? "text" }, "text")),
        );
        return { content: JSON.stringify({ observations }, null, 2) };
      } catch (error) {
        if (error instanceof RelateError) return { content: JSON.stringify({ error: error.code, message: error.message }) };
        throw error;
      }
    },
  };
}

export function RelateHealth(): ToolInfo {
  return {
    name: "relate_health",
    description: "Report relate readiness and taxonomy without performing inference.",
    input: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      return { content: JSON.stringify({ ok: true, version: "0.1.0", taxonomy: ["SUPPORTS", "CONTRADICTS", "UPDATES", "IMPLEMENTS", "RELATED", "UNKNOWN"] }) };
    },
  };
}

export function relateTools(): ToolInfo[] {
  return [RelatePair(), RelateMany(), RelateHealth()];
}
