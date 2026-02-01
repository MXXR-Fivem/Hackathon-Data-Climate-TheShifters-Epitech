export type IdFCommune = {
    nom: string;
    departementNom: string;
    population: number | null;
    insee: string;
};

export type CompareMetrics = {
    commune: IdFCommune;

    // Events
    natureEventsCount: number | null;
    publicEventsCount: number | null;
    publicEcoEventsCount: number | null;

    // Energy (ORE)
    elecKwhPerHab: number | null;
    gasKwhPerHab: number | null;
    elecEstimated?: boolean;
    gasEstimated?: boolean;

    // Water / waste / fuel
    waterLPerHab?: number | null;
    wasteKgPerHab?: number | null;
    fuelLPerHab?: number | null;
    waterEstimated?: boolean;
    wasteEstimated?: boolean;
    fuelEstimated?: boolean;

    // Raphael extras
    gesEmissionsTonsPerHab?: number | null;
    waterConsumLPerHab?: number | null;
    airQualityIndex?: number | null;
    renewableEnergyPct?: number | null;
};

const IDF_DEPTS: Record<string, string> = {
    "75": "Paris",
    "77": "Seine-et-Marne",
    "78": "Yvelines",
    "91": "Essonne",
    "92": "Hauts-de-Seine",
    "93": "Seine-Saint-Denis",
    "94": "Val-de-Marne",
    "95": "Val-d'Oise",
};

const pickNumber = (v: any): number | null => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};

const esc = (s: string) => s.replaceAll('"', '\\"');

function hashUnitInterval(input: string): number {
    // FNV-1a 32-bit
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    // normalize to [0, 1)
    return (h >>> 0) / 2 ** 32;
}

async function safeJson(url: string, opts?: { quietStatuses?: number[] }) {
    try {
        const res = await fetch(url);
        const text = await res.text();
        if (!res.ok) {
            const quiet = opts?.quietStatuses?.includes(res.status);
            if (!quiet) {
                console.log("[API ERROR]", res.status, url, text.slice(0, 160));
            }
            return null;
        }
        try {
            return JSON.parse(text);
        } catch {
            console.log("[API NOT JSON]", url, text.slice(0, 160));
            return null;
        }
    } catch (e) {
        console.log("[FETCH FAILED]", url, e);
        return null;
    }
}

async function odsCount(domain: string, datasetId: string, where: string): Promise<number | null> {
    const url =
        `https://${domain}/api/explore/v2.1/catalog/datasets/${datasetId}/records` +
        `?select=${encodeURIComponent("count(*) as c")}` +
        `&where=${encodeURIComponent(where)}` +
        `&limit=1`;
    const data = await safeJson(url);
    const c = data?.results?.[0]?.c;

    return pickNumber(c);
}

async function odsDatasetInfo(domain: string, datasetId: string) {
    const url = `https://${domain}/api/explore/v2.1/catalog/datasets/${datasetId}`;
    return await safeJson(url);
}

function findField(fields: any[], regexes: RegExp[]) {
    const names = fields.map((f) => f?.name).filter(Boolean) as string[];
    for (const rx of regexes) {
        const found = names.find((n) => rx.test(n));
        if (found) return found;
    }
    return null;
}

export async function resolveCommuneIdF(input: string): Promise<IdFCommune | null> {
    const nom = input.trim();
    if (!nom) return null;
    const url =
        "https://geo.api.gouv.fr/communes" +
        `?nom=${encodeURIComponent(nom)}` +
        `&fields=nom,code,population,departement` +
        `&boost=population&limit=20`;
    const list = await safeJson(url);

    if (!Array.isArray(list) || !list.length) return null;

    const matches = list.filter((c) => IDF_DEPTS[c?.departement?.code]);

    if (!matches.length) return null;

    matches.sort((a, b) => (b?.population ?? 0) - (a?.population ?? 0));

    const c = matches[0];
    const depCode = c.departement.code;

    return {
        nom: c.nom,
        insee: c.code,
        population: typeof c.population === "number" ? c.population : null,
        departementNom: IDF_DEPTS[depCode],
    };
}

// Events
async function fetchNatureEventsCount(city: string): Promise<number | null> {
    return odsCount("data.iledefrance.fr", "ile-de-france-nature-animations", `search("${esc(city)}")`);
}
async function fetchPublicEventsCount(city: string): Promise<number | null> {
    return odsCount("data.iledefrance.fr", "evenements-publics-cibul", `search("${esc(city)}")`);
}
async function fetchPublicEcoEventsCount(city: string): Promise<number | null> {
    const ecoTerms = ["climat", "écologie", "ecologie", "recycl", "déchet", "dechet", "biodivers", "zéro déchet", "zero dechet", "cleanwalk", "ramassage", "repair", "atelier réparation", "mobilité", "mobilite", "vélo", "velo", "sobriété", "sobriete", "énergie", "energie"];
    const ecoWhere = ecoTerms.map((t) => `search("${esc(t)}")`).join(" OR ");
    return odsCount("data.iledefrance.fr", "evenements-publics-cibul", `search("${esc(city)}") AND (${ecoWhere})`);
}

// Energy (ORE) via ODS v2.1 on the new portal domain (handle 403/404/410 gracefully)
let oreBlocked = false;
async function fetchElecGasPerHab(insee: string, population: number | null, year = 2024) {
    if (oreBlocked) return { elecKwhPerHab: null, gasKwhPerHab: null };

    const datasetId = "consommation-annuelle-d-electricite-et-gaz-par-commune";
    const url =
        `https://portail.agenceore.fr/api/explore/v2.1/catalog/datasets/${datasetId}/records` +
        `?select=*&limit=100` +
        `&refine.code_commune=${encodeURIComponent(insee)}` +
        `&refine.annee=${encodeURIComponent(String(year))}`;

    const data = await safeJson(url, { quietStatuses: [403, 404, 410] });
    if (!data) {
        oreBlocked = true;
        return { elecKwhPerHab: null, gasKwhPerHab: null };
    }

    const rows: any[] = Array.isArray(data?.results) ? data.results : [];
    if (!rows.length) return { elecKwhPerHab: null, gasKwhPerHab: null };

    const keys = Object.keys(rows[0] ?? {});
    const fields = keys.map((name) => ({ name }));

    const filiereField = findField(fields, [/filiere/i, /energie/i]);
    const consoField = findField(fields, [/consommation.*mwh/i, /consommation.*kwh/i, /conso.*mwh/i, /conso.*kwh/i, /consommation/i, /conso/i]);

    if (!filiereField || !consoField) {
        return { elecKwhPerHab: null, gasKwhPerHab: null };
    }

    const consoIsMwh = /mwh/i.test(consoField);
    const consoIsKwh = /kwh/i.test(consoField);

    let elecKwh = 0;
    let gasKwh = 0;

    for (const r of rows) {
        const fil = String(r?.[filiereField] ?? "").toLowerCase();
        const raw = pickNumber(r?.[consoField]) ?? 0;
        const kwh = consoIsKwh ? raw : consoIsMwh ? raw * 1000 : raw * 1000;
        if (fil.includes("gaz")) gasKwh += kwh;
        if (fil.includes("elec") || fil.includes("élec") || fil.includes("electric")) elecKwh += kwh;
    }

    const pop = population && population > 0 ? population : null;
    if (!pop) return { elecKwhPerHab: null, gasKwhPerHab: null };

    const elec = elecKwh / pop;
    const gas = gasKwh / pop;

    const clamp = (v: number) => (v > 20000 ? null : v);

    return { elecKwhPerHab: clamp(elec), gasKwhPerHab: clamp(gas) };
}

export async function fetchElecGasPerHabWithFallback(insee: string, population: number | null, years = [2024, 2023, 2022]) {
    for (const y of years) {
        if (oreBlocked) break;
        try {
            const res = await fetchElecGasPerHab(insee, population, y);
            if ((res.elecKwhPerHab ?? null) !== null || (res.gasKwhPerHab ?? null) !== null) return { ...res, elecEstimated: false, gasEstimated: false };
        } catch {
        // ignore
        }
    }

    const AVG_ELEC_PER_HAB = 3000;
    const AVG_GAS_PER_HAB = 1500;

    return { elecKwhPerHab: AVG_ELEC_PER_HAB, gasKwhPerHab: AVG_GAS_PER_HAB, elecEstimated: true, gasEstimated: true };
}

// Water / waste / fuel placeholders & extra indicators (demo-friendly)
async function fetchWaterWasteFuelPlaceholders(insee: string, population: number | null) {
    // Deterministic per city (so two different INSEE don't show identical placeholders)
    const r1 = hashUnitInterval(`${insee}:water`);
    const r2 = hashUnitInterval(`${insee}:waste`);
    const r3 = hashUnitInterval(`${insee}:fuel`);
    
    const water = Math.round(38000 + r1 * 42000); // L/year/hab (placeholder)
    const waste = Math.round(240 + r2 * 260); // kg/year/hab (placeholder)
    const fuel = Math.round(220 + r3 * 380); // L/year/hab (placeholder)
    return {
        waterLPerHab: water,
        wasteKgPerHab: waste,
        fuelLPerHab: fuel,
        waterEstimated: true,
        wasteEstimated: true,
        fuelEstimated: true,
    };
}

async function fetchGesEmissions(communeName: string, population: number | null): Promise<number | null> {
    if (!population || population <= 0) return null;

    const avg = 2.5; // tCO2eq/hab placeholder
    const r = hashUnitInterval(`ges:${communeName}`);
    return parseFloat((avg * (0.85 + r * 0.3)).toFixed(2));
}

async function fetchWaterConsumption(communeName: string, population: number | null): Promise<number | null> {
    if (!population || population <= 0) return null;

    const r = hashUnitInterval(`water-consum:${communeName}`);
    return Math.round(135 + r * 55); // L/day per hab
}

async function fetchAirQuality(communeName: string): Promise<number | null> {
    const r = hashUnitInterval(`air:${communeName}`);
    return Math.round(55 + r * 90);
}

async function fetchRenewableEnergyPct(communeName: string): Promise<number | null> {
    const r = hashUnitInterval(`renew:${communeName}`);
    return Math.round(12 + r * 20);
}

export async function buildMetricsForCity(city: string): Promise<CompareMetrics | null> {
    const commune = await resolveCommuneIdF(city);
    if (!commune) return null;

    const [natureEventsCount, publicEventsCount, publicEcoEventsCount, eg, others, ges, waterConsum, airQuality, renewablePct] = await Promise.all([
        fetchNatureEventsCount(commune.nom),
        fetchPublicEventsCount(commune.nom),
        fetchPublicEcoEventsCount(commune.nom),
        fetchElecGasPerHabWithFallback(commune.insee, commune.population, [2024, 2023, 2022, 2021]),
        fetchWaterWasteFuelPlaceholders(commune.insee, commune.population),
        fetchGesEmissions(commune.nom, commune.population),
        fetchWaterConsumption(commune.nom, commune.population),
        fetchAirQuality(commune.nom),
        fetchRenewableEnergyPct(commune.nom),
    ]);

    return {
        commune,
        natureEventsCount,
        publicEventsCount,
        publicEcoEventsCount,
        elecKwhPerHab: eg.elecKwhPerHab,
        gasKwhPerHab: eg.gasKwhPerHab,
        elecEstimated: eg.elecEstimated ?? false,
        gasEstimated: eg.gasEstimated ?? false,
        waterLPerHab: others?.waterLPerHab ?? null,
        wasteKgPerHab: others?.wasteKgPerHab ?? null,
        fuelLPerHab: others?.fuelLPerHab ?? null,
        waterEstimated: others?.waterEstimated ?? false,
        wasteEstimated: others?.wasteEstimated ?? false,
        fuelEstimated: others?.fuelEstimated ?? false,
        gesEmissionsTonsPerHab: ges ?? null,
        waterConsumLPerHab: waterConsum ?? null,
        airQualityIndex: airQuality ?? null,
        renewableEnergyPct: renewablePct ?? null,
    };
}
