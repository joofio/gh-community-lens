const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

// Uses the real Xenical ePI bundle (bare XHTML div fragments, no <html>/<body> tags).
// The bundle already carries EU/1/98/071/004 as its MedicinalProductDefinition identifier.
// An IPS with overweight (SNOMED 238131007) should trigger https://www.myobesityteam.com/

const REAL_BUNDLE_PATH = path.join(
    __dirname,
    "../../../IGs/gravitate-health/fsh-generated/resources/Bundle-bundlepackageleaflet-en-proc-4fab126d28f65a1084e7b50a23200363.json"
);

// Build bare XHTML html from the real bundle section divs (no <html>/<body> wrapper)
function buildHtmlFromBundle(bundle) {
    const parts = [];
    for (const entry of bundle.entry || []) {
        const r = entry.resource;
        if (r?.resourceType === "Composition") {
            for (const section of r.section || []) {
                if (section.text?.div) parts.push(section.text.div);
                for (const sub of section.section || []) {
                    if (sub.text?.div) parts.push(sub.text.div);
                }
            }
        }
    }
    return parts.join("\n");
}

function buildIpsWithCondition(baseIps, system, code) {
    const ips = JSON.parse(JSON.stringify(baseIps));
    ips.entry = ips.entry.filter((e) => e.resource?.resourceType !== "Condition");
    ips.entry.push({
        fullUrl: `https://myserver.org/Condition/${code}`,
        resource: {
            resourceType: "Condition",
            id: code,
            code: { coding: [{ system, code }] },
        },
    });
    return ips;
}

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
    const scriptContent = fs.readFileSync(
        path.join(__dirname, "../community-lens.js"),
        "utf-8"
    );
    return vm.runInContext(`(function() {\n${scriptContent}\n})();`, context);
}

describe("Community lens — real Xenical bundle (bare XHTML, no <body> tag)", () => {
    let realBundle;
    let bareHtml;
    let baseIps;

    beforeAll(() => {
        realBundle = JSON.parse(fs.readFileSync(REAL_BUNDLE_PATH, "utf-8"));
        bareHtml = buildHtmlFromBundle(realBundle);
        baseIps = JSON.parse(
            fs.readFileSync(path.join(__dirname, "../data/ips.json"), "utf-8")
        );
    });

    test("input HTML is a bare XHTML fragment (no <body> tag)", () => {
        expect(bareHtml.includes("<body>")).toBe(false);
        expect(bareHtml.includes("<div")).toBe(true);
    });

    test("banner is injected and is the first element in the output (no wrapper div)", async () => {
        const ips = buildIpsWithCondition(baseIps, "http://snomed.info/sct", "238131007");
        const annotation = runLens(bareHtml, realBundle, ips);

        const result = await annotation.enhance();

        const outputDir = path.join(__dirname, "../output");
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
        fs.writeFileSync(path.join(outputDir, "enhanced-real-bundle.html"), result, "utf-8");

        expect(result).toContain("community-banner");
        expect(result).toContain("myobesityteam.com");

        // The banner should be the FIRST element — directly a .community-banner div,
        // not wrapped in an extra container.
        const resultDom = new JSDOM(`<body>${result}</body>`);
        const firstEl = resultDom.window.document.body.firstElementChild;
        expect(firstEl?.classList.contains("community-banner")).toBe(true);
    });

    test("no banner when IPS has no matching condition", async () => {
        // IPS with a condition that has no entry in the communities map
        const ips = buildIpsWithCondition(baseIps, "http://snomed.info/sct", "000000000");
        const annotation = runLens(bareHtml, realBundle, ips);

        const result = await annotation.enhance();
        expect(result).not.toContain("community-banner");
        // Should return the original HTML unchanged
        expect(result).toBe(bareHtml);
    });
});
