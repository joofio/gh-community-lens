const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

// Verify that SNOMED 238131007 (overweight) + MedicinalProductDefinition
// identifier https://spor.ema.europa.eu/pmswi#EU/1/98/071/004 (Xenical)
// triggers the https://www.myobesityteam.com/ community link.

const htmlData = fs.readFileSync(path.join(__dirname, "../data/html.html"), "utf-8");
const baseEpi = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/epi.json")));
const baseIps = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/ips.json")));

// IPS with overweight condition (SNOMED 238131007) only
const ipsWithOverweight = JSON.parse(JSON.stringify(baseIps));
const overweightCondition = {
    fullUrl: "https://myserver.org/Condition/overweight-001",
    resource: {
        resourceType: "Condition",
        id: "overweight-001",
        code: {
            coding: [
                {
                    system: "http://snomed.info/sct",
                    code: "238131007",
                    display: "Overweight (finding)",
                },
            ],
        },
    },
};
// Replace existing conditions to avoid unrelated matches
ipsWithOverweight.entry = ipsWithOverweight.entry.filter(
    (e) => e.resource?.resourceType !== "Condition"
);
ipsWithOverweight.entry.push(overweightCondition);

// ePI where MedicinalProductDefinition carries the Xenical EU identifier
const epiForXenical = JSON.parse(JSON.stringify(baseEpi));
const mpd = epiForXenical.entry.find(
    (e) => e.resource?.resourceType === "MedicinalProductDefinition"
);
mpd.resource.identifier = [
    {
        system: "https://spor.ema.europa.eu/pmswi",
        value: "EU/1/98/071/004",
    },
];
// Also clear the Bundle-level identifier so it doesn't accidentally match something else
epiForXenical.identifier = { system: "https://www.gravitatehealth.eu/sid/doc", value: "xenical-epi" };

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
    return vm.runInContext(`(function() {\n${scriptContent}\n})();`, context);
}

describe("Community lens — overweight (SNOMED 238131007) + Xenical (EU/1/98/071/004)", () => {
    let annotation;

    beforeAll(() => {
        annotation = runLens(htmlData, epiForXenical, ipsWithOverweight);
    });

    test("should return correct version string", () => {
        expect(annotation.getSpecification()).toBe("2.0.3-community-banner");
    });

    test("community link points to myobesityteam.com when overweight + Xenical match", async () => {
        const result = await annotation.enhance();

        const outputDir = path.join(__dirname, "../output");
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
        fs.writeFileSync(path.join(outputDir, "enhanced-obesity.html"), result, "utf-8");

        expect(result).toContain('href="https://www.myobesityteam.com/"');
    });

    test("no community link when IPS has overweight but ePI identifier does not match", async () => {
        // Use an ePI whose MedicinalProductDefinition has a different identifier
        const epiNoMatch = JSON.parse(JSON.stringify(epiForXenical));
        const mpdNoMatch = epiNoMatch.entry.find(
            (e) => e.resource?.resourceType === "MedicinalProductDefinition"
        );
        mpdNoMatch.resource.identifier = [
            {
                system: "https://spor.ema.europa.eu/pmswi",
                value: "EU/9/99/999/999", // not in communities map
            },
        ];
        epiNoMatch.identifier = { system: "https://www.gravitatehealth.eu/sid/doc", value: "no-match-epi" };

        const annotationNoMatch = runLens(htmlData, epiNoMatch, ipsWithOverweight);
        const result = await annotationNoMatch.enhance();

        // Should return HTML unchanged (no matches → returns htmlData as-is)
        expect(result).toBe(htmlData);
        expect(result).not.toContain("myobesityteam.com");
    });
});
