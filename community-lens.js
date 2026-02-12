let pvData = pv;
let htmlData = html;

let epiData = epi;
let ipsData = ips;
let lang = "";  // Default language, will be set by ePI

let getSpecification = () => {
    return "2.0.3-community-banner";
};

const getCommunityHTML = (matches, language) => {
    let heading = "";
    let intro = "";
    let callToAction = "";

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
        callToAction = "Visit Community"
    }

    return `
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
}

const insertCommunityLink = (listOfCategories, matches, language, document, response) => {
    if (matches.length === 0) {
        return response;
    }

    const communityHTML = getCommunityHTML(matches, language);
    let injected = false;

    listOfCategories.forEach((className) => {
        const targets = document.getElementsByClassName(className);
        if (targets.length > 0) {
            targets[0].innerHTML = communityHTML;
            injected = true;
        }
    });

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

    let arrayOfClasses = [{ "code": "grav-5", "system": "https://www.gravitatehealth.eu/sid/doc" }]

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

    const conditions = ipsData.entry
        .filter(e => e.resource?.resourceType === "Condition")
        .flatMap(e => e.resource.code?.coding?.map(c => `${c.system}#${c.code}`) || []);

    const medKeys = [];

    if (epiData.identifier?.value) {
        const system = epiData.identifier.system || "";
        medKeys.push(`${system}#${epiData.identifier.value}`);
    }

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

    epiData.entry?.forEach((entry) => {
        const res = entry.resource;
        if (res?.resourceType === "Composition" && res.language) {
            lang = res.language;
        }
    });

    if (!lang && epiData.language) {
        lang = epiData.language;
    }

    if (!lang) {
        lang = "en";
    }

    let compositions = 0;
    let categories = [];

    epi.entry.forEach((entry) => {
        if (entry.resource.resourceType == "Composition") {
            compositions++;
            entry.resource.extension.forEach((element) => {
                if (element.extension[1].url == "concept") {
                    if (element.extension[1].valueCodeableReference.concept != undefined) {
                        element.extension[1].valueCodeableReference.concept.coding.forEach(
                            (coding) => {
                                if (arrayOfClasses.some(item => item.code === coding.code && item.system === coding.system)) {
                                    categories.push(element.extension[0].valueString);
                                }
                            }
                        );
                    }
                }
            });
        }
    });

    if (compositions == 0) {
        throw new Error('Bad ePI: no category "Composition" found');
    }

    if (matches.length == 0) {
        return htmlData;
    } else {
        let response = htmlData;
        let document;

        if (typeof window === "undefined") {
            let jsdom = await import("jsdom");
            let { JSDOM } = jsdom;
            let dom = new JSDOM(htmlData);
            document = dom.window.document;
            return insertCommunityLink(categories, matches, lang, document, response);
        } else {
            document = window.document;
            return insertCommunityLink(categories, matches, lang, document, response);
        }
    };
};

function getReport(lang = "en") {
    return { message: getExplanation(lang), status: "success" };
}

function getExplanation(lang = "en") {
    const explanations = {
        en: "This lens displays links to communities of patients with similar experiences.",
        pt: "Esta lente exibe links para comunidades de pacientes com experiências semelhantes.",
        es: "Esta lente muestra enlaces a comunidades de pacientes con experiencias similares.",
        da: "Denne linse viser links til fællesskaber af patienter med lignende oplevelser.",
    };
    return explanations[lang] || explanations.en;
}

return {
    enhance: enhance,
    getSpecification: getSpecification,
    explanation: (language) => getExplanation(language || lang || "en"),
    report: (language) => getReport(language || lang || "en"),
};
