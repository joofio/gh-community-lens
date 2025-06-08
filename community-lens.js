let pvData = pv;
let htmlData = html;

let epiData = epi;
let ipsData = ips;

let getSpecification = () => {
    return "2.0.3-contact-banner";
};
//document, htmlData, bannerHTML
//
const insertContactLinks = (listOfCategories, contacts, document, response) => {
    listOfCategories.forEach((className) => {
        if (
            response.includes(`class="${className}`) ||
            response.includes(`class='${className}`)
        ) {
            const elements = document.getElementsByClassName(className);
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];

                contacts.forEach(contact => {
                    let href = "";
                    if (contact.type === "email") {
                        href = `mailto:${contact.value}`;
                    } else if (contact.type === "phone") {
                        href = `tel:${contact.value}`;
                    }

                    if (href) {
                        // Create <a> and wrap existing content
                        const a = document.createElement("a");
                        a.setAttribute("href", href);
                        a.setAttribute("target", "_blank");
                        a.classList.add("contact-lens");

                        a.innerHTML = el.innerHTML;  // move original content into <a>
                        el.innerHTML = "";           // clear original content
                        el.appendChild(a);           // insert the <a> inside the original element
                    }
                });
            }
        }
    })


    // Clean head (same as your original logic)
    if (document.getElementsByTagName("head").length > 0) {
        document.getElementsByTagName("head")[0].remove();
    }

    // Extract HTML result
    if (document.getElementsByTagName("body").length > 0) {
        response = document.getElementsByTagName("body")[0].innerHTML;
        console.log("Response: " + response);
    } else {
        console.log("Response: " + document.documentElement.innerHTML);
        response = document.documentElement.innerHTML;
    }

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


    let arrayOfClasses = [{ "code": "grav-4", "system": "https://www.gravitatehealth.eu/sid/doc" }]      //what to look in extensions -made up code because there is none

    const contacts = []; // This will store the collected contact info

    for (const entry of ipsData.entry) {
        const res = entry.resource;
        if (!res || res.resourceType !== "Patient") continue;

        if (Array.isArray(res.generalPractitioner)) {
            for (const gpRef of res.generalPractitioner) {
                const gpId = gpRef.reference?.split("/")[1];
                if (!gpId) continue;

                const gpResource = ipsData.entry.find(e => e.resource?.id === gpId)?.resource;
                if (!gpResource) continue;

                if (
                    gpResource.resourceType === "Practitioner" ||
                    gpResource.resourceType === "Organization"
                ) {
                    const telecoms = gpResource.telecom;
                    if (Array.isArray(telecoms)) {
                        const filtered = telecoms.filter(t =>
                            ["phone", "email"].includes(t.system)
                        );
                        for (const telecom of filtered) {
                            contacts.push({
                                type: telecom.system,             // 'phone' or 'email'
                                value: telecom.value,             // e.g. '+123456789'
                                resourceType: gpResource.resourceType, // 'Practitioner' or 'Organization'
                                id: gpResource.id
                            });
                        }
                    }
                }
            }
        }
    }

    // Example usage:
    console.log("Collected contacts:", contacts);


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


    if (compositions == 0) {
        throw new Error('Bad ePI: no category "Composition" found');
    }

    else {


        let response = htmlData;
        let document;

        if (typeof window === "undefined") {
            let jsdom = await import("jsdom");
            let { JSDOM } = jsdom;
            let dom = new JSDOM(htmlData);
            document = dom.window.document;
            return insertContactLinks(categories, contacts, document, response);
            //listOfCategories, enhanceTag, document, response
        } else {
            document = window.document;
            return insertContactLinks(categories, contacts, document, response);
        }
    };
};

return {
    enhance: enhance,
    getSpecification: getSpecification,
};
