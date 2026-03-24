const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

// ePI has no grav-5 extension → categories = [] → banner prepended to body
const htmlData = fs.readFileSync(path.join(__dirname, "../data/html.html"), "utf-8");
const epiData = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/epi.json")));
const ipsData = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/ips.json")));

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

describe("Community lens — ePI WITHOUT grav-5 class", () => {
    let annotation;

    beforeAll(() => {
        annotation = runLens(htmlData, epiData, ipsData);
    });

    test("should return correct version string", () => {
        expect(annotation.getSpecification()).toBe("2.0.3-community-banner");
    });

    test("community banner is prepended to body when no grav-5 class is present", async () => {
        const result = await annotation.enhance();

        const outputDir = path.join(__dirname, "../output");
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
        fs.writeFileSync(path.join(outputDir, "enhanced-without-grav5.html"), result, "utf-8");

        // Banner should still appear (match found via IPS condition + ePI identifier)
        expect(result).toContain("community-banner");

        // Without a grav-5 target element the banner is appended at the end of the second div.
        const resultDom = new JSDOM(result);
        const divs = resultDom.window.document.querySelectorAll("body > div");
        const secondDiv = divs[1];
        expect(secondDiv?.lastElementChild?.classList.contains("community-banner")).toBe(true);
    });
});
