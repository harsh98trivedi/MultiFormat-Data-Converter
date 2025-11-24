import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Upload,
  FileText,
  Download,
  Copy,
  AlertCircle,
  Check,
  RefreshCw,
  FileJson,
  FileType,
  Code,
  Table,
  Braces,
  FileCode,
  ChevronDown,
  Github,
  Loader2,
} from "lucide-react";
import Papa from "papaparse";
import jsyaml from "js-yaml";
import { saveAs } from "file-saver";

// --- FORMAT DEFINITIONS ---
const FORMATS = [
  {
    label: "JSON",
    ext: ".json",
    value: "JSON",
    icon: Braces,
    description: "JavaScript Object Notation",
  },
  {
    label: "CSV",
    ext: ".csv",
    value: "CSV",
    icon: Table,
    description: "Comma Separated Values",
  },
  {
    label: "TSV",
    ext: ".tsv",
    value: "TSV",
    icon: Table,
    description: "Tab Separated Values",
  },
  {
    label: "Space-Separated",
    ext: ".txt",
    value: "SSV",
    icon: FileText,
    description: "Space Separated Values",
  },
  {
    label: "XML",
    ext: ".xml",
    value: "XML",
    icon: Code,
    description: "Extensible Markup Language",
  },
  {
    label: "YAML",
    ext: ".yaml",
    value: "YAML",
    icon: FileCode,
    description: "YAML Ain't Markup Language",
  },
  {
    label: "Plain Text",
    ext: ".txt",
    value: "TEXT",
    icon: FileType,
    description: "Raw Text",
  },
];

// --- HELPER FUNCTIONS ---

const flattenJSON = (data) => {
  if (Array.isArray(data)) {
    return data.map((item) => flattenObject(item));
  }
  return [flattenObject(data)];
};

const flattenObject = (obj, prefix = "", res = {}) => {
  if (typeof obj !== "object" || obj === null) return { [prefix]: obj };

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

// Simple browser-friendly XML -> JS converter (DOMParser)
const xmlToJs = (xmlStr) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid XML");
  }

  const normalize = (node) => {
    // Element nodes
    if (node.nodeType === 1) {
      const obj = {};
      // attributes
      if (node.attributes && node.attributes.length) {
        obj["_attr"] = {};
        for (let i = 0; i < node.attributes.length; i++) {
          const a = node.attributes[i];
          obj["_attr"][a.name] = a.value;
        }
      }
      // child elements/text
      const childElements = Array.from(node.childNodes).filter(
        (n) => n.nodeType === 1
      );
      const textNodes = Array.from(node.childNodes).filter(
        (n) => n.nodeType === 3 && n.textContent.trim()
      );

      if (childElements.length === 0) {
        // leaf: return text or attributes
        const text = textNodes.map((t) => t.textContent.trim()).join(" ");
        if (Object.keys(obj).length === 0) return text;
        if (text) obj["_text"] = text;
        return obj;
      }

      // process child elements, group repeated tags into arrays
      for (const child of childElements) {
        const key = child.nodeName;
        const val = normalize(child);
        if (obj.hasOwnProperty(key)) {
          if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
          obj[key].push(val);
        } else {
          obj[key] = val;
        }
      }
      return obj;
    }
    // Text nodes
    if (node.nodeType === 3) return node.textContent.trim();
    return null;
  };

  // handle multiple top-level elements by returning object with root tags
  const roots = Array.from(doc.childNodes).filter((n) => n.nodeType === 1);
  if (roots.length === 1) {
    const root = roots[0];
    const res = {};
    res[root.nodeName] = normalize(root);
    return res;
  }

  const out = {};
  for (const r of roots) out[r.nodeName] = normalize(r);
  return out;
};

// Simple JS -> XML serializer
const escapeXml = (str) =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const jsToXml = (obj, nodeName = "root") => {
  const build = (key, value) => {
    if (value == null) return `<${key}/>`;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return `<${key}>${escapeXml(value)}</${key}>`;
    }
    if (Array.isArray(value)) {
      return value.map((v) => build(key, v)).join("");
    }
    // object: handle attributes key "_attr" and text key "_text"
    let attrs = "";
    let inner = "";
    if (value && typeof value === "object") {
      if (value._attr && typeof value._attr === "object") {
        for (const [aK, aV] of Object.entries(value._attr)) {
          attrs += ` ${aK}="${escapeXml(aV)}"`;
        }
      }
      if (value._text) inner += escapeXml(value._text);
      for (const [k, v] of Object.entries(value)) {
        if (k === "_attr" || k === "_text") continue;
        inner += build(k, v);
      }
    }
    return `<${key}${attrs}>${inner}</${key}>`;
  };

  // If wrapped object with a single root key, use it
  if (
    typeof obj === "object" &&
    !Array.isArray(obj) &&
    Object.keys(obj).length === 1
  ) {
    const [rootKey] = Object.keys(obj);
    return build(rootKey, obj[rootKey]);
  }
  return build(nodeName, obj);
};

// Map detected format label (from detectFormat) -> FORMATS value
const mapDetectedToValue = (detected) => {
  if (!detected) return null;
  switch (detected) {
    case "JSON":
      return "JSON";
    case "CSV":
      return "CSV";
    case "TSV":
      return "TSV";
    case "XML":
      return "XML";
    case "YAML":
      return "YAML";
    case "Plain Text":
      return "TEXT";
    default:
      return null;
  }
};

export default function App() {
  // block super-small screens (adjust threshold as needed)
  const [unsupported, setUnsupported] = useState(false);
  const [inputData, setInputData] = useState("");
  const [detectedFormat, setDetectedFormat] = useState("Unknown");
  const [targetFormat, setTargetFormat] = useState(FORMATS[0].value);
  const [outputData, setOutputData] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // detect very small screens and set unsupported flag
  useEffect(() => {
    const threshold = 320; // px
    const check = () => setUnsupported(window?.innerWidth < threshold);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Initialize Libraries and Fonts
  useEffect(() => {
    const init = async () => {
      // Do not init if screen unsupported
      if (unsupported) return;
      // Font
      const link = document.createElement("link");
      link.href =
        "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap";
      link.rel = "stylesheet";
      document.head.appendChild(link);
      // Using installed packages (imported at top). Mark libs loaded.
      setLibsLoaded(true);
    };
    init();
  }, [unsupported]);

  const detectFormat = (content) => {
    if (!libsLoaded) return "Unknown";
    const trimmed = content.trim();
    if (!trimmed) return "Unknown";

    // JSON Check
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        JSON.parse(trimmed);
        return "JSON";
      } catch (e) {}
    }

    // XML Check
    if (trimmed.startsWith("<") && trimmed.endsWith(">")) return "XML";

    // CSV/TSV Check (Simple Heuristic)
    const firstLine = trimmed.split("\n")[0];
    if (firstLine.includes(",") && !trimmed.includes("{")) return "CSV";
    if (firstLine.includes("\t")) return "TSV";

    // YAML Check using imported js-yaml
    try {
      const res = jsyaml.load(trimmed);
      if (typeof res === "object" && res !== null) return "YAML";
    } catch (e) {}

    return "Plain Text";
  };

  const convertData = (data, targetFormat) => {
    if (!data) return "";
    let jsObj = typeof data === "string" ? JSON.parse(data) : data;

    switch (targetFormat) {
      case "JSON":
        return JSON.stringify(jsObj, null, 2);
      case "CSV":
        return Papa ? Papa.unparse(flattenJSON(jsObj)) : "Lib missing";
      case "TSV":
        return Papa
          ? Papa.unparse(flattenJSON(jsObj), { delimiter: "\t" })
          : "Lib missing";
      case "SSV":
        return Papa
          ? Papa.unparse(flattenJSON(jsObj), { delimiter: " " })
          : "Lib missing";
      case "YAML":
        return jsyaml ? jsyaml.dump(jsObj) : "Lib missing";
      case "XML":
        try {
          return jsToXml(jsObj, "root");
        } catch (e) {
          return "XML conversion failed";
        }
      case "TEXT":
        return JSON.stringify(jsObj);
      default:
        return "Format not supported";
    }
  };

  const processInput = useCallback(
    (content) => {
      if (!libsLoaded) return;
      setLoading(true);
      setError(null);
      setTimeout(() => {
        try {
          const format = detectFormat(content);
          setDetectedFormat(format);
          setInputData(content);
          // if the detected format maps to a target option and that option is currently selected,
          // switch to the first available alternative to avoid identical input/output choice
          const mapped = mapDetectedToValue(format);
          if (mapped && targetFormat === mapped) {
            const alt = FORMATS.find((f) => f.value !== mapped);
            if (alt) setTargetFormat(alt.value);
          }
          setLoading(false);
        } catch (err) {
          setError("Could not analyze file format.");
          setLoading(false);
        }
      }, 50);
    },
    [libsLoaded]
  );

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      readFile(e.dataTransfer.files[0]);
    }
  };

  const readFile = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => processInput(event.target.result);
    reader.readAsText(file);
  };

  const handleConvert = () => {
    if (!inputData || !libsLoaded) return;
    setLoading(true);
    setError(null);

    setTimeout(() => {
      try {
        let jsObject;

        // Parse input based on format using imported libs
        if (
          detectedFormat === "JSON" ||
          inputData.trim().startsWith("{") ||
          inputData.trim().startsWith("[")
        ) {
          jsObject = JSON.parse(inputData);
        } else if (detectedFormat === "YAML") {
          jsObject = jsyaml.load(inputData);
        } else if (["CSV", "TSV"].includes(detectedFormat) && Papa) {
          // Clean empty lines for cleaner CSV parsing
          const cleanInput = inputData.trim();
          jsObject = Papa.parse(cleanInput, {
            header: true,
            skipEmptyLines: true,
          }).data;
        } else if (detectedFormat === "XML") {
          jsObject = xmlToJs(inputData);
        } else {
          // Fallback
          jsObject = JSON.parse(inputData);
        }

        const result = convertData(jsObject, targetFormat);
        setOutputData(result);
      } catch (err) {
        console.error(err);
        setError(
          err.message ||
            "Conversion Failed. Invalid input data or format mismatch."
        );
      } finally {
        setLoading(false);
      }
    }, 100);
  };

  const handleDownload = () => {
    if (!saveAs) return;
    const formatObj = FORMATS.find((f) => f.value === targetFormat);

    const blob = new Blob([outputData], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `converted_data${formatObj?.ext || ".txt"}`);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputData);
  };

  const currentFormat = FORMATS.find((f) => f.value === targetFormat);

  // If super-small screen, show only logo and do not render the full app
  if (unsupported) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <img
          src="./logo.svg"
          alt="MultiFormat Data Converter"
          className="w-16 h-16 sm:w-20 sm:h-20"
        />
      </div>
    );
  }

  if (!libsLoaded) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-200 font-['Poppins'] flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mx-auto" />
          <p className="text-slate-400">Initializing Core Libraries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-['Poppins'] flex flex-col selection:bg-blue-500/30">
      {/* Global Style overrides for scrollbars */}
      <style>{`
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #1e293b; }
        ::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #64748b; }
        body { font-family: 'Poppins', sans-serif; margin: 0; }
      `}</style>

      {/* HEADER */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-default">
            <div className="bg-gradient-to-br from-blue-600 to-cyan-500 rounded-full shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform duration-300">
              <img
                src="./logo.svg"
                alt="MultiFormat Data Converter"
                className="w-6 h-6"
              />
            </div>
            <h1 className="hidden sm:block text-base sm:text-lg font-bold text-slate-200">
              MultiFormat Data Converter
            </h1>
          </div>

          <a
            href="https://github.com/harsh98trivedi"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-2 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium border border-slate-700 hover:border-blue-500/50 transition-all duration-300"
          >
            <Github className="w-4 h-4 group-hover:text-blue-400 transition-colors" />
            <span className="hidden sm:inline">Harsh Trivedi</span>
          </a>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-2 gap-3 flex flex-col lg:flex-row h-[calc(100vh-4rem-3rem)] overflow-hidden">
        {/* INPUT PANE */}
        <div
          className={`flex-1 flex flex-col rounded-xl border transition-all duration-300 relative group
            ${
              dragActive
                ? "border-blue-500 bg-blue-500/10"
                : "border-slate-800 bg-slate-900/50"
            }
          `}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(false);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={handleDrop}
        >
          {/* Input Header */}
          <div className="flex items-center justify-between p-2 border-b border-slate-800/50 bg-slate-900/50 rounded-t-xl">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
                Input Source
              </span>
              {detectedFormat !== "Unknown" && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 animate-in fade-in zoom-in">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {detectedFormat} detected
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 hover:border-slate-600 transition-all flex items-center gap-2 group/btn">
                <Upload
                  size={14}
                  className="group-hover/btn:-translate-y-0.5 transition-transform"
                />
                Upload File
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          </div>

          {/* Input Area */}
          <textarea
            className="flex-1 w-full bg-transparent p-2 font-mono text-sm text-slate-300 focus:outline-none resize-none placeholder:text-slate-600"
            placeholder={
              dragActive
                ? "Drop file here..."
                : "Paste your data here (JSON, XML, CSV, YAML)..."
            }
            value={inputData}
            onChange={(e) => setInputData(e.target.value)}
            onBlur={() => processInput(inputData)}
            spellCheck="false"
          />

          {dragActive && (
            <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-sm rounded-xl flex items-center justify-center border-2 border-blue-500 border-dashed z-20 pointer-events-none">
              <div className="text-blue-100 font-medium text-lg flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 animate-bounce" />
                Drop file to load
              </div>
            </div>
          )}
        </div>

        {/* MIDDLE CONTROLS */}
        <div className="flex lg:flex-col items-center justify-center gap-4 z-10 shrink-0">
          <button
            onClick={handleConvert}
            disabled={loading || !inputData}
            className={`
              w-12 h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 relative
              ${
                !inputData
                  ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                  : "bg-gradient-to-tr from-blue-600 to-cyan-500 text-white hover:scale-110 hover:shadow-blue-500/50 cursor-pointer"
              }
            `}
            title="Convert"
          >
            {loading ? (
              <Loader2 className="animate-spin w-6 h-6" />
            ) : (
              <Check className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* OUTPUT PANE */}
        <div className="flex-1 flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 relative overflow-hidden">
          {/* Output Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2 border-b border-slate-800/50 bg-slate-900/50 rounded-t-xl">
            <div className="w-full flex items-center justify-between gap-2">
              <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
                Output
              </span>
              {/* show description directly on very small screens for clarity */}
              <div className="sm:hidden text-xs text-slate-400">
                {currentFormat?.description}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-2 sm:mt-0 w-full sm:w-auto">
              {/* Custom Dropdown Container */}
              <div className="relative group/select w-full sm:w-auto min-w-0">
                <div className="flex flex-row items-center gap-2 px-2 py-1 bg-slate-800/80 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 transition-all hover:shadow-md w-full min-w-0 whitespace-nowrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="p-1 rounded-md bg-slate-700/40 flex items-center justify-center flex-shrink-0">
                      {currentFormat && (
                        <currentFormat.icon
                          size={16}
                          className="text-blue-400"
                        />
                      )}
                    </span>
                    <span className="hidden sm:inline text-sm font-semibold text-slate-100 truncate max-w-[8rem] sm:max-w-[12rem] whitespace-nowrap">
                      {currentFormat?.label}
                    </span>
                  </div>

                  <select
                    className="appearance-none bg-transparent border-none focus:outline-none cursor-pointer pr-8 text-slate-200 w-full sm:w-40 whitespace-nowrap truncate"
                    value={targetFormat}
                    onChange={(e) => setTargetFormat(e.target.value)}
                  >
                    {FORMATS.filter(
                      (f) => f.value !== mapDetectedToValue(detectedFormat)
                    ).map((f) => (
                      <option
                        key={f.value}
                        value={f.value}
                        className="bg-slate-900 text-slate-200 py-2 whitespace-nowrap"
                      >
                        {f.label} ({f.ext})
                      </option>
                    ))}
                  </select>

                  <ChevronDown
                    size={14}
                    className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                </div>
              </div>

              <div className="hidden sm:block h-4 w-px bg-slate-700 mx-1"></div>

              <div className="flex gap-2 ml-auto sm:ml-0">
                <button
                  onClick={copyToClipboard}
                  disabled={!outputData}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Copy to Clipboard"
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!outputData}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Download File"
                >
                  <Download size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Output Area */}
          <div className="flex-1 relative w-full h-full bg-[#0b1120]/50">
            {error ? (
              <div className="absolute inset-0 flex items-center justify-center p-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 max-w-md text-center backdrop-blur-sm">
                  <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <AlertCircle className="text-red-400 w-6 h-6" />
                  </div>
                  <h3 className="text-red-400 font-medium mb-1">
                    Conversion Failed
                  </h3>
                  <p className="text-red-400/70 text-sm">{error}</p>
                </div>
              </div>
            ) : (
              <textarea
                readOnly
                className="w-full h-full bg-transparent p-3 font-mono text-sm text-emerald-400 focus:outline-none resize-auto min-h-[180px] sm:min-h-0 overflow-auto"
                placeholder="Converted data will appear here..."
                value={outputData}
              />
            )}
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="h-12 border-t border-slate-800 bg-slate-900 flex items-center justify-center text-xs text-slate-500">
        <p className="flex items-center gap-1.5 hover:text-slate-400 transition-colors cursor-default">
          Made with <span className="text-red-500 animate-pulse">❤️</span> by{" "}
          <span className="font-medium text-slate-300">
            <a target="_blank" href="https://harsh98trivedi.github.io">
              Harsh Trivedi
            </a>
          </span>
        </p>
      </footer>
    </div>
  );
}
