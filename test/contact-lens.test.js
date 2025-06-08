const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

// Load your input data
global.html = fs.readFileSync(path.join(__dirname, "../data/html.html"), "utf-8");
global.epi = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/epi.json")));
global.ips = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/ips.json")));

// Set up DOM globally so the script can use it
const dom = new JSDOM(global.html);
global.window = dom.window;
global.document = dom.window.document;

let annotation;
beforeAll(() => {
  const scriptContent = fs.readFileSync(path.join(__dirname, "../contact-lens.js"), "utf-8");

  const context = {
    console,
    window,
    document,
    html: global.html,
    epi: global.epi,
    ips: global.ips,
    pv: {}, // optional
    require,
    module: {},
    exports: {},
  };

  vm.createContext(context);

  // Wrap script in IIFE to capture return value
  const wrappedScript = `(function() {\n${scriptContent}\n})();`;

  // Run the script and get the returned object
  annotation = vm.runInContext(wrappedScript, context);
});

describe("Questionnaire adding Annotation Script (non-invasive)", () => {
  test("should return version string", () => {
    expect(annotation.getSpecification()).toBe("2.0.3-contact-banner");
  });

  test("should return enhanced HTML containing questionaire link", async () => {
    const result = await annotation.enhance();

    // Ensure output directory exists
    const outputDir = path.join(__dirname, "../output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    // Save result to file
    const outputPath = path.join(outputDir, "enhanced.html");
    fs.writeFileSync(outputPath, result, "utf-8");

    console.log(`✅ Enhanced HTML saved to: ${outputPath}`);

    expect(result).toContain("example@example.org");
  });
});
