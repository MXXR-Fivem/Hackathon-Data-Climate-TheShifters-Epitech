import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import React, { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { buildMetricsForCity, CompareMetrics } from "../src/lib/metrics";

const fmtK = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "—";

  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;

  return `${Math.round(n)}`;
};

const fmtPop = (n: number | null | undefined) => {
  if (!n) return "—";

  if (n >= 1000000) return `${Math.round(n / 100000) / 10}M`;

  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;

  return `${n}`;
};

const fmt1 = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "—";

  return (Math.round(n * 10) / 10).toLocaleString("fr-FR");
};

function StatPill({
  label,
  left,
  right,
}: {
  label: string;
  left: string;
  right: string;
}) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <View style={styles.pillValues}>
        <Text style={styles.pillValue}>{left}</Text>
        <Text style={styles.pillValue}>{right}</Text>
      </View>
    </View>
  );
}

function MetricIcon({
  name,
}: {
  name: React.ComponentProps<typeof FontAwesome6>["name"];
}) {
  return (
    <View
      style={{
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <FontAwesome6 name={name} size={18} color="#0f172a" />
    </View>
  );
}

export default function CompareScreen() {
  const [cityA, setCityA] = useState("");
  const [cityB, setCityB] = useState("");

  const [loading, setLoading] = useState(false);
  const [a, setA] = useState<CompareMetrics | null>(null);
  const [b, setB] = useState<CompareMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canCompare =
    cityA.trim().length >= 2 && cityB.trim().length >= 2 && !loading;

  const onCompare = async () => {
    setError(null);
    setLoading(true);
    setA(null);
    setB(null);

    try {
      const [ma, mb] = await Promise.all([
        buildMetricsForCity(cityA),
        buildMetricsForCity(cityB),
      ]);
      if (!ma || !mb) {
        setError(
          "Ville introuvable en IDF (ex: Paris, Cergy, Versailles, Créteil…).",
        );
      } else {
        setA(ma);
        setB(mb);
      }
    } catch (e: any) {
      setError(`Erreur API: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const title = useMemo(() => {
    if (a?.commune?.nom && b?.commune?.nom)
      return `${a.commune.nom} vs ${b.commune.nom}`;

    return "COMPARATOR";
  }, [a, b]);

  return (
    <View style={styles.container}>
      <View style={styles.dragHandleWrap}>
        <View style={styles.dragHandle} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 28, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <Text style={styles.title}>{title}</Text>

          <TextInput
            style={styles.input}
            onChangeText={setCityA}
            value={cityA}
            placeholder="First city (IDF)"
            placeholderTextColor="black"
            autoCapitalize="words"
          />
          <TextInput
            style={styles.input}
            onChangeText={setCityB}
            value={cityB}
            placeholder="Second city (IDF)"
            placeholderTextColor="black"
            autoCapitalize="words"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          {a && b && (
            <View style={styles.cityRow}>
              <View style={styles.cityCard}>
                <Text style={styles.cityPop}>
                  {fmtPop(a.commune.population)}
                </Text>
                <Text style={styles.cityPopLabel}>hab</Text>
              </View>
              <View style={styles.cityCard}>
                <Text style={styles.cityPop}>
                  {fmtPop(b.commune.population)}
                </Text>
                <Text style={styles.cityPopLabel}>hab</Text>
              </View>
            </View>
          )}

          <Pressable
            style={[styles.compareBtnInline, !canCompare && { opacity: 0.5 }]}
            disabled={!canCompare}
            onPress={onCompare}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.compareText}>COMPARER</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() =>
              Linking.openURL("https://www.linkedin.com/company/les-shifters/")
            }
            style={styles.shiftersLink}
          >
            <FontAwesome6 name="share-nodes" size={14} color="#0f172a" />
            <Text style={styles.shiftersText}>Les Shifters</Text>
          </Pressable>

          {a && b && (
            <View style={styles.results}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Comparatif — événements & conso
                </Text>
                <View style={styles.twoCol}>
                  <View style={styles.col}>
                    <Text style={styles.colCity}>{a.commune.nom}</Text>
                    <View style={styles.statRow}>
                      <View style={styles.statLeft}>
                        <MetricIcon name="leaf" />
                        <Text style={styles.statLabel} numberOfLines={2}>
                          Nature / écolo
                        </Text>
                      </View>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {fmtK(a.natureEventsCount)}
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statLeft}>
                        <MetricIcon name="bolt" />
                        <Text style={styles.statLabel} numberOfLines={1}>
                          Électricité
                        </Text>
                      </View>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {fmtK(a.elecKwhPerHab)} kWh
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statLeft}>
                        <MetricIcon name="gas-pump" />
                        <Text style={styles.statLabel} numberOfLines={2}>
                          Gaz
                        </Text>
                      </View>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {fmtK(a.gasKwhPerHab)} kWh
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statLeft}>
                        <MetricIcon name="droplet" />
                        <Text style={styles.statLabel} numberOfLines={2}>
                          Eau
                        </Text>
                      </View>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {a.waterLPerHab ? `${fmtK(a.waterLPerHab)} L` : "—"}
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statLeft}>
                        <MetricIcon name="trash" />
                        <Text style={styles.statLabel} numberOfLines={2}>
                          Déchet
                        </Text>
                      </View>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {a.wasteKgPerHab ? `${fmt1(a.wasteKgPerHab)} kg` : "—"}
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statLeft}>
                        <MetricIcon name="gas-pump" />
                        <Text style={styles.statLabel} numberOfLines={2}>
                          Carburant
                        </Text>
                      </View>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {a.fuelLPerHab ? `${fmt1(a.fuelLPerHab)} L` : "—"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.col}>
                    <Text style={styles.colCity}>{b.commune.nom}</Text>
                    <View style={styles.statRow}>
                      <View style={styles.statLeft}>
                        <MetricIcon name="leaf" />
                        <Text style={styles.statLabel} numberOfLines={2}>
                          Nature / écolo
                        </Text>
                      </View>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {fmtK(b.natureEventsCount)}
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statLeft}>
                        <MetricIcon name="bolt" />
                        <Text style={styles.statLabel} numberOfLines={2}>
                          Électricité
                        </Text>
                      </View>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {fmtK(b.elecKwhPerHab)} kWh
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statLeft}>
                        <MetricIcon name="gas-pump" />
                        <Text style={styles.statLabel} numberOfLines={2}>
                          Gaz
                        </Text>
                      </View>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {fmtK(b.gasKwhPerHab)} kWh
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statLeft}>
                        <MetricIcon name="droplet" />
                        <Text style={styles.statLabel} numberOfLines={2}>
                          Eau
                        </Text>
                      </View>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {b.waterLPerHab ? `${fmtK(b.waterLPerHab)} L` : "—"}
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statLeft}>
                        <MetricIcon name="trash" />
                        <Text style={styles.statLabel} numberOfLines={2}>
                          Déchet
                        </Text>
                      </View>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {b.wasteKgPerHab ? `${fmt1(b.wasteKgPerHab)} kg` : "—"}
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statLeft}>
                        <MetricIcon name="gas-pump" />
                        <Text style={styles.statLabel} numberOfLines={2}>
                          Carburant
                        </Text>
                      </View>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {b.fuelLPerHab ? `${fmt1(b.fuelLPerHab)} L` : "—"}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.note}>
                  Statistiques moyennes par habitants et par an.
                </Text>
                <Text style={styles.note}>
                  Sources : data.iledefrance.fr (événements), ORE (conso
                  électricité/gaz). Période : annuelle par habitant
                  (kWh/hab/an), année la plus récente dispo.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Indicateurs supplémentaires
                </Text>
                <StatPill
                  label="Émissions GES"
                  left={`${fmt1(a.gesEmissionsTonsPerHab)} t CO₂eq/hab`}
                  right={`${fmt1(b.gesEmissionsTonsPerHab)} t CO₂eq/hab`}
                />
                <StatPill
                  label="Consommation eau"
                  left={`${fmt1(a.waterConsumLPerHab)} L/hab/j`}
                  right={`${fmt1(b.waterConsumLPerHab)} L/hab/j`}
                />
                <StatPill
                  label="Qualité de l'air (ATMO)"
                  left={fmtK(a.airQualityIndex)}
                  right={fmtK(b.airQualityIndex)}
                />
                <StatPill
                  label="% Énergie renouvelable"
                  left={`${a.renewableEnergyPct ?? "—"}%`}
                  right={`${b.renewableEnergyPct ?? "—"}%`}
                />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
    padding: 20,
    paddingTop: 12,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
  },
  dragHandleWrap: {
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 10,
  },
  dragHandle: {
    width: 80,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#d1d5db",
  },
  top: {
    marginTop: 20,
    gap: 12,
  },
  title: {
    fontWeight: "900",
    fontSize: 30,
    textAlign: "center",
  },
  input: {
    height: 54,
    backgroundColor: "#d4d4d4",
    borderRadius: 14,
    paddingHorizontal: 12,
    fontSize: 18,
    textAlign: "center",
    color: "black",
  },
  error: {
    color: "#b91c1c",
    fontWeight: "700",
    textAlign: "center",
  },
  cityRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  cityCard: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fafafa",
    alignItems: "center",
  },
  cityPop: {
    fontWeight: "900",
    fontSize: 24,
  },
  cityPopLabel: {
    marginTop: 4,
    opacity: 0.7,
  },
  compareBtnInline: {
    marginTop: 20,
    height: 54,
    borderRadius: 18,
    backgroundColor: "black",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    elevation: 6,
  },
  compareText: {
    color: "white",
    fontWeight: "900",
    fontSize: 22,
  },
  shiftersLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    alignSelf: "center",
  },
  shiftersText: {
    marginLeft: 6,
    fontWeight: "700",
    opacity: 0.8,
  },
  results: {
    marginTop: 14,
    gap: 12,
  },
  section: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    borderRadius: 18,
    padding: 14,
  },
  sectionTitle: {
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 10,
  },
  twoCol: {
    flexDirection: "row",
    gap: 20,
  },
  col: {
    flex: 1,
  },
  colCity: {
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 10,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  statLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  statLabel: {
    opacity: 0.7,
    flexShrink: 0,
  },
  statValue: {
    fontWeight: "900",
    minWidth: 92,
    textAlign: "right",
    flexShrink: 0,
  },
  sep: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 10,
  },
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#eef2f7",
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    backgroundColor: "white",
  },
  pillLabel: {
    opacity: 0.7,
    marginBottom: 6,
  },
  pillValues: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pillValue: {
    fontWeight: "900",
  },
  note: {
    marginTop: 10,
    fontSize: 12,
    opacity: 0.6,
    lineHeight: 16,
  },
  compareBtn: {
    position: "absolute",
    left: 20,
    bottom: 35,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#0a8c7a",
    borderRadius: 12,
    elevation: 3,
  },
});
