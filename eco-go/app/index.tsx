import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";

type ActionType = "nature" | "public" | "publicEco" | "ecoOther";

type ActionPoint = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  type: ActionType;
  popup: {
    subtitle: string;
    infos: { label: string; value: string }[];
  };
};

type MarkerPreset = {
  bg: string;
  icon: React.ComponentProps<typeof FontAwesome6>["name"];
};

const esc = (s: string) => s.replaceAll('"', '\\"');

function stripHtml(input: string | null | undefined) {
  if (!input) return "";
  // simple removal of tags and collapse whitespace
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function safeJson(url: string) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) {
      console.log("[API ERROR]", res.status, url, text.slice(0, 140));
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      console.log("[API NOT JSON]", url, text.slice(0, 140));
      return null;
    }
  } catch (e) {
    console.log("[FETCH FAILED]", url, e);
    return null;
  }
}

function pickLatLon(obj: any): { lat: number; lon: number } | null {
  // IDF Nature
  if (obj?.geo?.lat && obj?.geo?.lon)
    return { lat: Number(obj.geo.lat), lon: Number(obj.geo.lon) };

  // OpenAgenda souvent: location_coordinates {lat, lon}
  if (obj?.location_coordinates?.lat && obj?.location_coordinates?.lon) {
    return {
      lat: Number(obj.location_coordinates.lat),
      lon: Number(obj.location_coordinates.lon),
    };
  }

  // D'autres formats possibles
  if (obj?.latitude && obj?.longitude)
    return { lat: Number(obj.latitude), lon: Number(obj.longitude) };
  if (obj?.lat && obj?.lon)
    return { lat: Number(obj.lat), lon: Number(obj.lon) };

  return null;
}

// ---------- SOURCE 1 : IDF Nature ----------
async function fetchIdfNatureEvents(limit = 100): Promise<ActionPoint[]> {
  const url =
    "https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/ile-de-france-nature-animations/records" +
    `?limit=${limit}`;

  const data = await safeJson(url);
  const rows: any[] = Array.isArray(data?.results) ? data.results : [];

  return rows
    .map((e: any, i: number) => {
      const src = e?.record?.fields ?? e.fields ?? e;
      const ll = pickLatLon(src);
      if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lon))
        return null;

      const desc = stripHtml(src.description || e.description || "");
      const location = `${src.location_name || src.location_city || src.city || "Non spécifié"}`;

      return {
        id: (e?.uid ?? e?.id)?.toString() || `nature-${i}`,
        title: src.title || src.name || e.title || "Événement nature",
        latitude: ll.lat,
        longitude: ll.lon,
        type: "nature",
        popup: {
          subtitle: desc || "Île-de-France Nature",
          infos: [
            { label: "Description", value: desc || "—" },
            {
              label: "Lieu",
              value: `${location}\n${src.location_address || src.address || ""}`,
            },
          ],
        },
      } as ActionPoint;
    })
    .filter(Boolean) as ActionPoint[];
}

// ---------- SOURCE 2 : OpenAgenda IDF (tous events) ----------
async function fetchOpenAgendaEvents(limit = 100): Promise<ActionPoint[]> {
  // higher default limit for demo to surface more events
  const url =
    "https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/evenements-publics-cibul/records" +
    `?limit=${limit}`;

  const data = await safeJson(url);
  const rows: any[] = Array.isArray(data?.results) ? data.results : [];

  return rows
    .map((e: any, i: number) => {
      const src = e?.record?.fields ?? e.fields ?? e;
      const ll = pickLatLon(src);
      if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lon))
        return null;

      const idVal = (e?.uid ?? e?.id)?.toString() || `public-${i}`;
      const title = src.title || src.name || e.title || "Événement public";
      const city = src.location_city || src.city || src.location_name || "";
      const addr = src.location_address || src.address || "";
      let desc = stripHtml(src.description || e.description || "");

      if (!desc || desc.trim() === "") {
        const fake = makeFakeDescription(title, city, idVal);
        desc = fake.description;
        if (!src.start_date && fake.start) src.start_date = fake.start;
        if (!src.end_date && fake.end) src.end_date = fake.end;
        if (!src.organizer && fake.organizer) src.organizer = fake.organizer;
        if (!src.website && fake.website) src.website = fake.website;
        if (!src.location_address && fake.address)
          src.location_address = fake.address;
      }

      const start =
        src.start_date || src.start || src.date || src.start_date_time || null;
      const end = src.end_date || src.end || null;
      const organizer =
        src.organizer || src.organiser || src.organisation || "";
      const website = src.website || src.url || src.link || "";

      const infos = [
        { label: "Ville", value: String(city || "—") },
        { label: "Adresse", value: String(addr || "—") },
      ];

      if (start) infos.unshift({ label: "Début", value: String(start) });
      if (end) infos.unshift({ label: "Fin", value: String(end) });
      if (organizer)
        infos.push({ label: "Organisateur", value: String(organizer) });
      if (website) infos.push({ label: "Lien", value: String(website) });
      if (desc) infos.unshift({ label: "Description", value: String(desc) });

      return {
        id: idVal,
        title,
        latitude: ll.lat,
        longitude: ll.lon,
        type: "public",
        popup: {
          subtitle: "OpenAgenda • Événements publics IDF",
          infos,
        },
      } as ActionPoint;
    })
    .filter(Boolean) as ActionPoint[];
}

// ---------- SOURCE 3 : OpenAgenda IDF filtré éco (keywords) ----------
async function fetchOpenAgendaEcoEvents(limit = 100): Promise<ActionPoint[]> {
  const ecoTerms = [
    "climat",
    "écologie",
    "ecologie",
    "recycl",
    "déchet",
    "dechet",
    "biodivers",
    "zéro déchet",
    "zero dechet",
    "cleanwalk",
    "ramassage",
    "repair",
    "mobilité",
    "mobilite",
    "vélo",
    "velo",
    "sobriété",
    "sobriete",
    "énergie",
    "energie",
  ];

  const ecoWhere = ecoTerms.map((t) => `search("${esc(t)}")`).join(" OR ");
  const url =
    "https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/evenements-publics-cibul/records" +
    `?where=${encodeURIComponent(ecoWhere)}` +
    `&limit=${limit}`;

  const data = await safeJson(url);
  const rows: any[] = Array.isArray(data?.results) ? data.results : [];

  return rows
    .map((e: any, i: number) => {
      const src = e?.record?.fields ?? e.fields ?? e;
      const ll = pickLatLon(src);
      if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lon))
        return null;

      const idVal = (e?.uid ?? e?.id)?.toString() || `publicEco-${i}`;
      const title = src.title || src.name || e.title || "Événement éco";
      const city = src.location_city || src.city || src.location_name || "";
      let desc = stripHtml(src.description || e.description || "");

      if (!desc || desc.trim() === "") {
        const fake = makeFakeDescription(title, city, idVal);
        desc = fake.description;
        if (!src.start_date && fake.start) src.start_date = fake.start;
        if (!src.organizer && fake.organizer) src.organizer = fake.organizer;
        if (!src.website && fake.website) src.website = fake.website;
        if (!src.location_address && fake.address)
          src.location_address = fake.address;
      }

      const start =
        src.start_date || src.start || src.date || src.start_date_time || null;
      const organizer =
        src.organizer || src.organiser || src.organisation || "";
      const website = src.website || src.url || src.link || "";

      const infos: { label: string; value: string }[] = [];

      if (desc) infos.push({ label: "Description", value: String(desc) });
      if (start) infos.push({ label: "Début", value: String(start) });
      if (city) infos.push({ label: "Ville", value: String(city) });
      if (organizer)
        infos.push({ label: "Organisateur", value: String(organizer) });
      if (website) infos.push({ label: "Lien", value: String(website) });

      return {
        id: idVal,
        title,
        latitude: ll.lat,
        longitude: ll.lon,
        type: "publicEco",
        popup: {
          subtitle: "OpenAgenda • Filtre éco (mots-clés)",
          infos,
        },
      } as ActionPoint;
    })
    .filter(Boolean) as ActionPoint[];
}

// additional eco event extractor: inspects title+description for a broader set of keywords
async function fetchAdditionalEcoEvents(limit = 100): Promise<ActionPoint[]> {
  const url =
    "https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/evenements-publics-cibul/records" +
    `?limit=${limit}`;

  const data = await safeJson(url);
  const rows: any[] = Array.isArray(data?.results) ? data.results : [];
  const ecoKeywords = [
    "clean",
    "ramass",
    "recycl",
    "compost",
    "repair",
    "atelier",
    "biodivers",
    "nettoy",
    "zero dechet",
    "cleanwalk",
    "éco",
    "ecolo",
    "écologie",
  ];

  return rows
    .map((e: any, i: number) => {
      const src = e?.record?.fields ?? e.fields ?? e;
      const ll = pickLatLon(src);
      if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lon))
        return null;

      const idVal = (e?.uid ?? e?.id)?.toString() || `ecoOther-${i}`;
      const title = (
        src.title ||
        src.name ||
        e.title ||
        "Événement"
      ).toString();
      let desc = stripHtml((src.description || e.description || "").toString());
      const text = (title + "\n" + desc).toLowerCase();
      const isEco = ecoKeywords.some((k) => text.includes(k));
      if (!isEco) return null;
      const city = src.location_city || src.city || src.location_name || "";
      const start =
        src.start_date || src.start || src.date || src.start_date_time || null;
      const website = src.website || src.url || src.link || "";

      // generate fake desc when missing
      if (!desc || desc.trim() === "") {
        const fake = makeFakeDescription(title, city, idVal);
        desc = fake.description;
        if (!src.start_date && fake.start) src.start_date = fake.start;
        if (!src.website && fake.website) src.website = fake.website;
      }
      const infos: { label: string; value: string }[] = [];
      if (desc) infos.push({ label: "Description", value: String(desc) });
      if (start) infos.push({ label: "Début", value: String(start) });
      if (city) infos.push({ label: "Ville", value: String(city) });
      if (website) infos.push({ label: "Lien", value: String(website) });

      return {
        id: idVal,
        title,
        latitude: ll.lat,
        longitude: ll.lon,
        type: "ecoOther",
        popup: {
          subtitle: "OpenAgenda • Événements éco (mots-clés)",
          infos,
        },
      } as ActionPoint;
    })
    .filter(Boolean) as ActionPoint[];
}

async function fetchEventFullFromDataset(
  dataset: string,
  title?: string,
  city?: string,
) {
  if (!title && !city) return null;
  // prefer searching by title, fallback to city
  const parts: string[] = [];

  if (title) parts.push(`search("${esc(String(title))}")`);
  if (city) parts.push(`search("${esc(String(city))}")`);

  const where = parts.join(" AND ");
  const url = `https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/${dataset}/records?where=${encodeURIComponent(where)}&limit=1`;
  const data = await safeJson(url);
  const row = Array.isArray(data?.results) ? data.results[0] : null;
  const fields = row?.record?.fields ?? row?.fields ?? row ?? null;

  return fields;
}

function makeFakeDescription(
  title: string | undefined,
  city: string | undefined,
  seed = "",
) {
  // deterministic pseudo-random based on seed string (stable per event id)
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  function rnd() {
    h = Math.imul(h ^ (h >>> 13), 16777619) >>> 0;
    return (h % 10000) / 10000;
  }

  const titles = [
    "Atelier participatif",
    "Conférence locale",
    "Balade écologique",
    "Repair café",
    "Nettoyage citoyen",
    "Projection & débat",
    "Forum des initiatives",
    "Formation compostage",
    "Fête du quartier durable",
    "Échange de plantes",
  ];
  const organizers = [
    "Collectif Local",
    "Association Éco-Acteurs",
    "Les Voisins Solidaires",
    "Ateliers Citoyens",
    "Réseau Zéro Déchet",
    "La Maison Verte",
    "Coopérative Locale",
    "Le Jardin Partagé",
    "Collectif Mobilité",
    "Club Vélo",
  ];
  const addresses = [
    "Médiathèque municipale",
    "Parc central",
    "Maison des associations",
    "Place du marché",
    "Centre culturel",
    "Jardin botanique",
    "École primaire du centre",
    "Mairie annexe",
    "Maison de quartier",
    "Local associatif",
  ];
  const websites = [
    "https://inscription.local/event/",
    "https://agenda.local/event/",
    "https://www.example.org/event/",
    "https://evenements.local/",
    "https://reseau-asso.org/inscription/",
  ];

  const t = title ?? titles[Math.floor(rnd() * titles.length)];
  const c = city ?? "votre ville";
  const org = organizers[Math.floor(rnd() * organizers.length)];
  const addr = addresses[Math.floor(rnd() * addresses.length)];
  const site =
    websites[Math.floor(rnd() * websites.length)] +
    Math.floor(rnd() * 9000 + 1000);

  // date within next 60 days
  const daysFromNow = 1 + Math.floor(rnd() * 60);
  const startDate = new Date(Date.now() + daysFromNow * 24 * 3600 * 1000);
  const endDate = new Date(
    startDate.getTime() + (2 + Math.floor(rnd() * 6)) * 3600 * 1000,
  ); // 2-7h event
  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  };
  const sStr =
    startDate.toLocaleDateString("fr-FR", opts) +
    " • " +
    startDate.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const eStr =
    endDate.toLocaleDateString("fr-FR", opts) +
    " • " +
    endDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const descTemplates = [
    `${t} à ${c} : séance participative pour échanger des bonnes pratiques. Atelier, stands et goûter solidaire.`,
    `${t} — rencontre et atelier ${c}. Des intervenants locaux partageront leurs retours d'expérience.`,
    `${t} : balade & découverte ${c}, suivie d'un temps d'échange et d'actions concrètes.`,
    `Participez au ${t} ${c} pour apprendre, réparer et partager. Idéal pour les familles.`,
    `${t} organisé par ${org} : tables-rondes, ateliers pratiques et coin enfant. Inscription recommandée.`,
  ];

  const desc = descTemplates[Math.floor(rnd() * descTemplates.length)];

  return {
    description: `${desc}\n\nLieu : ${addr} — ${c}.\nOrganisateur : ${org}.\nInscription / infos : ${site}`,
    start: sStr,
    end: eStr,
    organizer: org,
    address: `${addr}, ${c}`,
    website: site,
  };
}

async function ensureEventDetails(item: ActionPoint) {
  // if we already have a description, do nothing
  const hasDesc = (item.popup?.infos ?? []).some(
    (r) =>
      r.label === "Description" &&
      r.value &&
      r.value.trim() !== "" &&
      r.value.trim() !== "—",
  );
  if (hasDesc) return item;

  try {
    // try to fetch from the most likely dataset
    const dataset =
      item.type === "nature"
        ? "ile-de-france-nature-animations"
        : "evenements-publics-cibul";
    // try by title + city
    const title = item.title;
    const city =
      item.popup?.infos?.find((r) => r.label === "Ville")?.value ?? "";
    const fields = await fetchEventFullFromDataset(dataset, title, city);
    if (fields) {
      const desc = stripHtml(
        fields.description ||
          fields.text ||
          fields.summary ||
          fields.libelle ||
          "",
      );
      const start =
        fields.start_date ||
        fields.start ||
        fields.date ||
        fields.start_date_time ||
        "";
      const end = fields.end_date || fields.end || "";
      const organizer =
        fields.organizer ||
        fields.organiser ||
        fields.organisation ||
        fields.organisation_libelle ||
        fields.organisateur ||
        "";
      const website =
        fields.website || fields.url || fields.link || fields.site || "";
      const addr =
        fields.location_address || fields.address || fields.location_name || "";

      const infos: { label: string; value: string }[] = [];
      if (desc) infos.push({ label: "Description", value: desc });
      if (start) infos.push({ label: "Début", value: String(start) });
      if (end) infos.push({ label: "Fin", value: String(end) });
      if (city) infos.push({ label: "Ville", value: String(city) });
      if (addr) infos.push({ label: "Adresse", value: String(addr) });
      if (organizer)
        infos.push({ label: "Organisateur", value: String(organizer) });
      if (website) infos.push({ label: "Lien", value: String(website) });

      // merge with existing (keep subtitle)
      const popup = {
        subtitle:
          item.popup.subtitle ||
          (dataset === "ile-de-france-nature-animations"
            ? "Île-de-France Nature"
            : "OpenAgenda"),
        infos,
      };
      const updated: ActionPoint = { ...item, popup };
      return updated;
    }
  } catch (e) {
    // ignore and fallback to fake text
  }

  // Fallback: generate friendly placeholder description (varied per event id)
  const seed = item.id ?? item.title ?? Math.random().toString(36).slice(2);
  const fake = makeFakeDescription(
    item.title,
    item.popup?.infos?.find((r) => r.label === "Ville")?.value ?? undefined,
    seed,
  );
  const infos: { label: string; value: string }[] = [];
  if (fake.description)
    infos.push({ label: "Description", value: fake.description });
  if (fake.start) infos.push({ label: "Début", value: fake.start });
  if (fake.end) infos.push({ label: "Fin", value: fake.end });
  const cityVal =
    item.popup?.infos?.find((r) => r.label === "Ville")?.value ?? "";
  if (cityVal) infos.push({ label: "Ville", value: cityVal });
  if (fake.address) infos.push({ label: "Adresse", value: fake.address });
  if (fake.organizer)
    infos.push({ label: "Organisateur", value: fake.organizer });
  if (fake.website) infos.push({ label: "Lien", value: fake.website });

  const popup = {
    subtitle: item.popup?.subtitle || "Événement local",
    infos: [...infos, ...(item.popup?.infos ?? [])],
  };

  return { ...item, popup } as ActionPoint;
}

const PALETTE = {
  dark: "#0f172a",
  teal: "#0a8c7a",
  lightBlue: "#0ea5e9",
  accentGreen: "#22c55e",
};

const MARKER_PRESETS: Record<ActionType, MarkerPreset> = {
  nature: { bg: PALETTE.teal, icon: "leaf" },
  public: { bg: PALETTE.dark, icon: "calendar" },
  publicEco: { bg: PALETTE.lightBlue, icon: "seedling" },
  ecoOther: { bg: PALETTE.accentGreen, icon: "recycle" },
};

function EcoMarker({ type, zoom }: { type: ActionType; zoom: number }) {
  const preset = MARKER_PRESETS[type];
  return (
    <View style={styles.markerWrap}>
      <View style={styles.markerRoot}>
        <View style={[styles.marker, { backgroundColor: preset.bg }]}>
          <FontAwesome6 name={preset.icon} size={16} color="white" />
        </View>
        <View style={[styles.markerPointer, { borderTopColor: preset.bg }]} />
      </View>
    </View>
  );
}

export default function MapScreen() {
  const mapRef = useRef<MapView | null>(null);
  const [isLocLoading, setIsLocLoading] = useState(true);
  const [userRegion, setUserRegion] = useState<Region | null>(null);
  const [zoom, setZoom] = useState(14);
  const [actions, setActions] = useState<ActionPoint[]>([]);

  const [selected, setSelected] = useState<ActionPoint | null>(null);
  const SHEET_H = 360;
  const sheetY = useRef(new Animated.Value(SHEET_H)).current;

  const openSheet = (item: ActionPoint) => {
    setSelected(item);
    Animated.timing(sheetY, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const closeSheet = () => {
    Animated.timing(sheetY, {
      toValue: SHEET_H,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setSelected(null));
  };

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          Alert.alert(
            "Permission requise",
            "Active la localisation pour voir la carte centrée sur toi.",
          );
          setIsLocLoading(false);
          return;
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        setUserRegion({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        });
      } catch {
        Alert.alert("Erreur", "Impossible de récupérer la position.");
      } finally {
        setIsLocLoading(false);
      }
    })();

    // ✅ On charge plusieurs sources d’événements
    (async () => {
      // API limits limit<=100; request smaller batches to avoid 400 errors
      const [nature, pub, eco, eco2] = await Promise.all([
        fetchIdfNatureEvents(100),
        fetchOpenAgendaEvents(100),
        fetchOpenAgendaEcoEvents(100),
        fetchAdditionalEcoEvents(100),
      ]);

      // merge + dedup
      const all = [...nature, ...pub, ...eco, ...eco2];
      const seen = new Set<string>();

      const uniq = all.filter((x) => {
        if (seen.has(x.id)) return false;
        seen.add(x.id);
        return true;
      });

      setActions(uniq);
    })();
  }, []);

  const initialRegion = useMemo<Region>(() => {
    return (
      userRegion ?? {
        latitude: 48.8566,
        longitude: 2.3522,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    );
  }, [userRegion]);

  const recenter = () => {
    if (!mapRef.current || !userRegion) return;

    mapRef.current.animateToRegion(userRegion, 700);
  };

  if (isLocLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Récupération de ta position…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Shifters logo overlay (uses existing splash-icon.png as placeholder) */}
      <Image
        source={require("../assets/images/splash-icon.png")}
        style={styles.shiftersLogo}
      />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsIndoors={false}
        showsIndoorLevelPicker={false}
        showsBuildings={false}
        zoomControlEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
        onRegionChangeComplete={(r) => {
          const z = Math.log2(360 / r.longitudeDelta);
          setZoom(z);
        }}
      >
        {userRegion && (
          <Marker
            key="user-location"
            coordinate={{
              latitude: userRegion.latitude,
              longitude: userRegion.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.userDot} />
          </Marker>
        )}
        {actions.map((a) => (
          <Marker
            key={a.id}
            anchor={{ x: 0.5, y: 1 }}
            centerOffset={{ x: 0, y: -21 }}
            coordinate={{ latitude: a.latitude, longitude: a.longitude }}
            tracksViewChanges={false}
            onPress={async () => {
              // enrich details if missing, then open sheet
              const enriched = await ensureEventDetails(a);
              // update selected with enriched popup
              setSelected(enriched);
              Animated.timing(sheetY, {
                toValue: 0,
                duration: 220,
                useNativeDriver: true,
              }).start();
              mapRef.current?.animateCamera(
                {
                  center: { latitude: a.latitude, longitude: a.longitude },
                  zoom: 15,
                },
                { duration: 600 },
              );
            }}
          >
            <EcoMarker type={a.type} zoom={zoom} />
          </Marker>
        ))}
      </MapView>

      {selected && (
        <Pressable style={styles.sheetOverlay} onPress={closeSheet} />
      )}

      <Animated.View
        pointerEvents={selected ? "auto" : "none"}
        style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}
      >
        <View style={styles.sheetHandleWrap}>
          <View style={styles.sheetHandle} />
        </View>

        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>{selected?.title ?? ""}</Text>
            <Text style={styles.sheetSub}>{selected?.popup.subtitle}</Text>
          </View>

          <Pressable style={styles.sheetClose} onPress={closeSheet}>
            <Text style={{ fontWeight: "800" }}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.sheetScrollContent}
          showsVerticalScrollIndicator
        >
          {selected?.popup.infos.map((row, i) => (
            <View key={i} style={styles.sheetRow}>
              <Text style={styles.sheetLabel}>{row.label}</Text>
              <Text style={styles.sheetValue}>{row.value}</Text>
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      <Pressable style={styles.recenterBtn} onPress={recenter}>
        <FontAwesome6 name="location-arrow" size={22} color="black" />
      </Pressable>

      <Pressable
        style={styles.compareBtn}
        onPress={() => router.push("/compare")}
      >
        <FontAwesome6 name="chart-line" size={22} color="black" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  shiftersLogo: {
    position: "absolute",
    right: 16,
    top: 50,
    width: 88,
    height: 40,
    zIndex: 40,
    opacity: 0.95,
    resizeMode: "contain",
  },
  recenterBtn: {
    position: "absolute",
    right: 20,
    bottom: 35,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "white",
    borderRadius: 12,
    elevation: 3,
  },
  compareBtn: {
    position: "absolute",
    right: 20,
    bottom: 95,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "white",
    borderRadius: 12,
    elevation: 3,
  },
  markerWrap: {
    alignItems: "center",
  },
  markerRoot: {
    alignItems: "center",
  },
  marker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "white",
    elevation: 4,
  },
  markerPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -2,
  },
  userDot: {
    width: 25,
    height: 25,
    borderRadius: 100,
    backgroundColor: "#1250d4",
    borderWidth: 4,
    borderColor: "white",
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  sheet: {
    position: "absolute",
    zIndex: 1,
    left: 0,
    right: 0,
    bottom: 0,
    height: 360,
    backgroundColor: "white",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 18,
    elevation: 12,
  },
  sheetHandleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#e5e7eb",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#dcdcdc",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  sheetSub: {
    marginTop: 2,
    opacity: 0.65,
  },
  sheetClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetScrollContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sheetRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f0",
  },
  sheetLabel: {
    opacity: 0.7,
  },
  sheetValue: {
    fontWeight: "700",
  },
});
