import Papa from "papaparse";
import yaml from "js-yaml";

export const detectFormat = (content) => {
  const trimmed = content.trim();

  if (!trimmed) return "Unknown";

  // 1. Check JSON
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return "JSON";
    } catch (e) {
      /* Not JSON */
    }
  }

  // 2. Check XML
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return "XML";
  }

  // 3. Check CSV/TSV (Heuristic: checks for delimiters in first line)
  const firstLine = trimmed.split("\n")[0];
  if (firstLine.includes(",") || firstLine.includes("\t")) {
    const parseResult = Papa.parse(trimmed.substring(0, 1000), {
      header: true,
    });
    if (parseResult.meta.delimiter === ",") return "CSV";
    if (parseResult.meta.delimiter === "\t") return "TSV";
  }

  // 4. Check YAML (Last resort usually, as it's very permissive)
  try {
    const res = yaml.load(trimmed);
    if (typeof res === "object" && res !== null) return "YAML";
  } catch (e) {
    /* Not YAML */
  }

  return "Plain Text";
};
