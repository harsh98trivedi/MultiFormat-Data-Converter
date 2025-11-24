import Papa from "papaparse";
import yaml from "js-yaml";
import * as xml from "xml-js";

// Helper to flatten nested JSON for CSV/Table conversion
const flattenJSON = (data) => {
  if (Array.isArray(data)) {
    return data.map((item) => flattenObject(item));
  }
  return [flattenObject(data)];
};

const flattenObject = (obj, prefix = "", res = {}) => {
  for (const key in obj) {
    const val = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && val !== null) {
      flattenObject(val, newKey, res);
    } else {
      res[newKey] = val;
    }
  }
  return res;
};

export const convertData = (data, targetFormat) => {
  if (!data) return "";

  // Ensure data is an object/array for processing
  let jsObj = typeof data === "string" ? JSON.parse(data) : data;

  switch (targetFormat) {
    case "JSON":
      return JSON.stringify(jsObj, null, 2);

    case "CSV":
      return Papa.unparse(flattenJSON(jsObj));

    case "TSV":
      return Papa.unparse(flattenJSON(jsObj), { delimiter: "\t" });

    case "Space-Separated Values":
      return Papa.unparse(flattenJSON(jsObj), { delimiter: " " });

    case "YAML":
      return yaml.dump(jsObj);

    case "XML":
      // distinct wrapper for valid XML
      const wrapped = { root: jsObj };
      return xml.js2xml(wrapped, { compact: true, spaces: 2 });

    case "Plain Text":
      return JSON.stringify(jsObj); // Fallback to string representation

    // BINARY FORMATS (Mock implementation for Browser-Only)
    // Real implementation requires WASM and Schema definition.
    case "Apache Parquet":
    case "Apache Avro":
    case "Apache ORC":
      throw new Error(
        "Binary formats (Parquet/Avro/ORC) require strict Schema definitions and cannot be generated securely in-browser from loose JSON without a backend."
      );

    default:
      return "Format not supported";
  }
};
