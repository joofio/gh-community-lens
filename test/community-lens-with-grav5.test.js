const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

// ePI has a grav-5 extension that maps to the "community-slot" HTML class.
// The lens should inject the banner INTO that element instead of prepending to body.
const baseHtml = fs.readFileSync(path.join(__dirname, "../data/html.html"), "utf-8");
const baseEpi = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/epi.json")));
const ipsData = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/ips.json")));

// Add a placeholder div with a known class to the HTML
const TARGET_CLASS = "community-slot";
const htmlWithSlot = baseHtml.replace("</body>", `<div class="${TARGET_CLASS}"></div></body>`);

// Add a grav-5 HtmlElementLink extension to the Composition that points to TARGET_CLASS
const epiWithGrav5 = JSON.parse(JSON.stringify(baseEpi)); // deep clone
const composition = epiWithGrav5.entry.find(
    (e) => e.resource?.resourceType === "Composition"
);
composition.resource.extension.push({
    url: "http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/HtmlElementLink",
    extension: [
        {
            url: "elementClass",
            valueString: TARGET_CLASS,
        },
        {
            url: "concept",
            valueCodeableReference: {
                concept: {
                    coding: [
                        {
                            code: "grav-5",
                            system: "https://www.gravitatehealth.eu/sid/doc",
                            display: "Community slot",
                        },
                    ],
                },
            },
        },
    ],
});

function runLens(html, epi, ips) {
    const dom = new JSDOM(html);
    const context = {
        console,
        window: dom.window,
        document: dom.window.document,
        html,
        epi,
        ips,
        pv: {},
        require,
        module: {},
        exports: {},
    };
    vm.createContext(context);
    const scriptContent = fs.readFileSync(path.join(__dirname, "../community-lens.js"), "utf-8");
    const wrappedScript = `(function() {\n${scriptContent}\n})();`;
    return vm.runInContext(wrappedScript, context);
}

describe("Community lens — ePI WITH grav-5 class", () => {
    let annotation;

    beforeAll(() => {
        annotation = runLens(htmlWithSlot, epiWithGrav5, ipsData);
    });

    test("should return correct version string", () => {
        expect(annotation.getSpecification()).toBe("2.0.3-community-banner");
    });

    test("community banner is injected into the grav-5 target element", async () => {
        const result = await annotation.enhance();

        const outputDir = path.join(__dirname, "../output");
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
        fs.writeFileSync(path.join(outputDir, "enhanced-with-grav5.html"), result, "utf-8");

        // Banner must appear in the output
        expect(result).toContain("community-banner");

        // The banner should be INSIDE the community-slot element, not loose at the top.
        // insertCommunityLink replaces the innerHTML of the first matching element,
        // so the slot element's content becomes the community banner HTML.
        const resultDom = new JSDOM(`<body>${result}</body>`);
        const slot = resultDom.window.document.querySelector(`.${TARGET_CLASS}`);
        expect(slot).not.toBeNull();
        expect(slot?.querySelector(".community-banner")).not.toBeNull();
    });
});
