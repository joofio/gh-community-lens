let pvData = pv;
let htmlData = html;

let epiData = epi;
let ipsData = ips;
let lang = "";  // Default language, will be set by ePI

let getSpecification = () => {
    return "2.0.3-community-banner";
};
//document, htmlData, bannerHTML

const insertCommunityLink = (listOfCategories, matches, language, document, response) => {
    let communityHTML = "";

    if (matches.length > 0) {
        let heading = "";
        let intro = "";

        if (language?.startsWith("pt")) {
            heading = "👥 Comunidade relacionada";
            intro = "Pode beneficiar ao juntar-se a uma comunidade de utilizadores com experiências semelhantes:";
            callToAction = "Visitar Comunidade"
        } else if (language?.startsWith("es")) {
            heading = "👥 Comunidad relacionada";
            intro = "Podría beneficiarse al unirse a una comunidad de personas con experiencias similares:";
            callToAction = "Visitar comunidad"

        } else if (language?.startsWith("da")) {
            heading = "👥 Relateret fællesskab";
            intro = "Det kan være nyttigt at deltage i et fællesskab med lignende oplevelser:";
            callToAction = "Besøg fællesskab"

        } else {
            heading = "👥 Related Community";
            intro = "You might benefit from joining a community of others with similar experiences:";
            callToAction = "Visitar Comunidade"

        }

        communityHTML = `
        <div class="community-banner">
            <h3>${heading}</h3>
            <p>${intro}</p>
            <ul>
                ${matches.map(match => `
                    <li>
                        <a href="${match.href}" target="_blank" class="community-link">
                           ${callToAction}
                        </a>
                    </li>`).join("")}
            </ul>
        </div>
        `;
    } else {
        // No match: do not inject anything
        return response;
    }

    let injected = false;

    listOfCategories.forEach((className) => {
        console.log(className);
        const targets = document.getElementsByClassName(className);
        if (targets.length > 0) {
            targets[0].innerHTML = communityHTML;
            injected = true;
        }
    });

    console.log(injected);
    if (!injected) {
        const bannerDiv = document.createElement("div");
        bannerDiv.innerHTML = communityHTML;
        const body = document.querySelector("body");
        if (body) {
            body.insertBefore(bannerDiv, body.firstChild);
        }
    }

    const head = document.getElementsByTagName("head")[0];
    if (head) head.remove();

    const body = document.getElementsByTagName("body")[0];
    response = body ? body.innerHTML : document.documentElement.innerHTML;

    if (!response || response.trim() === "") {
        throw new Error("Annotation process failed: empty or null response");
    }

    return response;
};


let enhance = async () => {
    if (!ipsData || !ipsData.entry || ipsData.entry.length === 0) {
        throw new Error("IPS is empty or invalid.");
    }
    if (!epiData || !epiData.entry || epiData.entry.length === 0) {
        throw new Error("ePI is empty or invalid.");
    }


    let arrayOfClasses = [{ "code": "grav-5", "system": "https://www.gravitatehealth.eu/sid/doc" }]      //what to look in extensions -made up code because there is none

    const communities = {
        "http://hl7.org/fhir/sid/icd-10#E11": [ // Diabetes
            {
                med: "http://www.whocc.no/atc#A10BA02", // Metformin
                href: "https://community.health/metformin-diabetes"
            }
        ],
        "http://hl7.org/fhir/sid/icd-10#R52": [ // Pain
            {
                med: "http://www.whocc.no/atc#M01AE01", // Ibuprofen
                href: "https://community.health/ibuprofen-pain"
            }
        ],
        "http://snomed.info/sct#254837009": [ // Malignant neoplasm of breast (disorder)
            {
                med: "https://www.gravitatehealth.eu/sid/doc#epibundle-123", // Ibuprofen
                href: "https://community.health/ibuprofen-pain"
            }
        ],

    };

    const matches = [];

    // Extract all condition codings
    const conditions = ipsData.entry
        .filter(e => e.resource?.resourceType === "Condition")
        .flatMap(e => e.resource.code?.coding?.map(c => `${c.system}#${c.code}`) || []);

    console.log(conditions);
    // Extract all medication codings
    // const meds = ipsData.entry
    //   .filter(e => ["MedicationRequest", "MedicationStatement"].includes(e.resource?.resourceType))
    //  .flatMap(e => e.resource.medicationCodeableConcept?.coding?.map(c => `${c.system}#${c.code}`) || []);


    // Extrair identificadores de nível Bundle
    const medKeys = [];

    if (epiData.identifier?.value) {
        const system = epiData.identifier.system || "";
        medKeys.push(`${system}#${epiData.identifier.value}`);
    }

    // Extrair identificadores de MedicinalProductDefinition
    epiData.entry.forEach(entry => {
        const res = entry.resource;
        if (res?.resourceType === "MedicinalProductDefinition" && Array.isArray(res.identifier)) {
            res.identifier.forEach(id => {
                const system = id.system || "";
                if (id.value) {
                    medKeys.push(`${system}#${id.value}`);
                }
            });
        }
    });
    console.log(medKeys);

    // Match: for each condition, check if any matching med exists
    for (const condKey of conditions) {
        if (communities[condKey]) {
            for (const entry of communities[condKey]) {
                if (medKeys.includes(entry.med)) {
                    matches.push({
                        medication: entry.med,
                        condition: condKey,
                        href: entry.href
                    });
                }
            }
        }
    }

    // 1. Check Composition.language
    epiData.entry?.forEach((entry) => {
        const res = entry.resource;
        if (res?.resourceType === "Composition" && res.language) {
            lang = res.language;
            console.log("🌍 Detected from Composition.language:", lang);
        }
    });

    // 2. If not found, check Bundle.language
    if (!lang && epiData.language) {
        lang = epiData.language;
        console.log("🌍 Detected from Bundle.language:", lang);
    }

    // 3. Fallback
    if (!lang) {
        console.warn("⚠️ No language detected in Composition or Bundle.");
        lang = "en";
    }

    // ePI traslation from terminology codes to their human redable translations in the sections
    let compositions = 0;
    let categories = [];

    epi.entry.forEach((entry) => {
        if (entry.resource.resourceType == "Composition") {
            compositions++;
            //Iterated through the Condition element searching for conditions
            entry.resource.extension.forEach((element) => {

                // Check if the position of the extension[1] is correct
                if (element.extension[1].url == "concept") {
                    // Search through the different terminologies that may be avaible to check in the condition
                    if (element.extension[1].valueCodeableReference.concept != undefined) {
                        element.extension[1].valueCodeableReference.concept.coding.forEach(
                            (coding) => {
                                console.log("Extension: " + element.extension[0].valueString + ":" + coding.code + " - " + coding.system)
                                // Check if the code is in the list of categories to search
                                if (arrayOfClasses.some(item => item.code === coding.code && item.system === coding.system)) {
                                    // Check if the category is already in the list of categories
                                    console.log("Found", element.extension[0].valueString)
                                    categories.push(element.extension[0].valueString);
                                }
                            }
                        );
                    }
                }
            });
        }
    });

    console.log(matches);
    if (compositions == 0) {
        throw new Error('Bad ePI: no category "Composition" found');
    }

    if (matches.length == 0) {
        console.log("There are no matching communities for pair disease/medication");
        return htmlData;
    }

    else {


        let response = htmlData;
        let document;

        if (typeof window === "undefined") {
            let jsdom = await import("jsdom");
            let { JSDOM } = jsdom;
            let dom = new JSDOM(htmlData);
            document = dom.window.document;
            return insertCommunityLink(categories, matches, lang, document, response);
            //listOfCategories, enhanceTag, document, response
        } else {
            document = window.document;
            return insertCommunityLink(categories, matches, lang, document, response);
        }
    };
};


function getReport(lang = "en") {
    console.log("Generating report in language:", lang);
    return { message: getExplanation(lang), status: "" };


}

// --- Get user-facing report sentence in the selected language ---
function getExplanation(lang = "en") {
    console.log("Generating explanation in language:", lang);
    return "";
}

// --- Exported API ---
return {
    enhance: enhance,
    getSpecification: getSpecification,
    explanation: (language) => getExplanation(language || lang || "en"),
    report: (language) => getReport(language || lang || "en"),
};
