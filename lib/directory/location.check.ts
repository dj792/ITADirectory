/**
 * Checks for the State / City filters (location.ts). Fixed inputs, so they
 * hold whatever the export carries.
 */
import {
  cityLabel, cityName, citiesFor, locationFacets, matchesCities, matchesStates,
  pruneCities, stateCode,
} from "./location";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nlocation.check");

// ── Normalizing the hand-typed values seen in the live export ────────────
check('"Ohio" and "OH" are one state', stateCode("Ohio") === "OH" && stateCode("OH") === "OH");
check('"New York" → NY', stateCode("New York") === "NY");
check('"mi" → MI', stateCode("mi") === "MI");
check("whitespace is trimmed", stateCode("  CA ") === "CA");
check("a Canadian province name → its code", stateCode("Ontario") === "ON");
check('"Outside US/Canada" is kept as written', stateCode("Outside US/Canada") === "Outside US/Canada");
check("blank stays blank", stateCode("") === "" && stateCode("   ") === "");

check('"CLEVELAND" → "Cleveland"', cityName("CLEVELAND") === "Cleveland");
check('"kennesaw" → "Kennesaw"', cityName("kennesaw") === "Kennesaw");
check("multi-word all-caps → title case", cityName("ST. LOUIS") === "St. Louis", cityName("ST. LOUIS"));
check("deliberate mixed case is left alone", cityName("McLean") === "McLean" && cityName("DeKalb") === "DeKalb");

check("a city carries its state", cityLabel("Springfield", "Missouri") === "Springfield, MO");
check("the same city in two states is two options",
  cityLabel("Springfield", "MO") !== cityLabel("Springfield", "IL"));
check("no city → no option", cityLabel("", "OH") === "");

// ── Facets ───────────────────────────────────────────────────────────────
const f = locationFacets([
  { city: "Cleveland", state: "OH" },
  { city: "CLEVELAND", state: "Ohio" },
  { city: "Chicago", state: "IL" },
  { city: "", state: "" },
]);
check("variant spellings collapse to one state option", f.state.join(",") === "IL,OH", f.state.join(","));
check("variant spellings collapse to one city option",
  f.city.join("|") === "Chicago, IL|Cleveland, OH", f.city.join("|"));

// ── Matching: own location OR the firm's ─────────────────────────────────
const member = { city: "Columbus", state: "OH", orgCity: "", orgState: "" };
const remote = { city: "San Diego", state: "CA", orgCity: "Columbus", orgState: "Ohio" };
const noOwn = { city: "", state: "", orgCity: "Columbus", orgState: "OH" };
const blank = { city: "", state: "", orgCity: "", orgState: "" };

check("a member matches its own state", matchesStates(member, ["OH"]));
check("remote staff match their FIRM's state", matchesStates(remote, ["OH"]));
check("…and their own state too", matchesStates(remote, ["CA"]));
check("staff with no state of their own match via the firm", matchesStates(noOwn, ["OH"]));
check("states OR each other", matchesStates(member, ["MI", "OH"]));
check("a non-matching state excludes", !matchesStates(member, ["MI"]));
check("a record with no location never matches", !matchesStates(blank, ["OH"]) && !matchesCities(blank, ["Columbus, OH"]));
check("no state chosen = no restriction", matchesStates(blank, []));
check("remote staff match their firm's city", matchesCities(remote, ["Columbus, OH"]));
check("cities match on the normalized label", matchesCities({ ...member, city: "COLUMBUS" }, ["Columbus, OH"]));

// ── The City list follows the State selection ────────────────────────────
const all = ["Chicago, IL", "Cleveland, OH", "Springfield, IL", "Springfield, MO"];
check("no states → every city", citiesFor(all, []).length === 4);
check("states narrow the city list",
  citiesFor(all, ["IL"]).join("|") === "Chicago, IL|Springfield, IL");
check("de-selecting a state drops its chosen cities",
  pruneCities(["Cleveland, OH", "Chicago, IL"], ["IL"]).join("|") === "Chicago, IL");
check("clearing states keeps chosen cities", pruneCities(["Cleveland, OH"], []).length === 1);

if (failures) {
  console.log(`\n${failures} FAILED`);
  process.exit(1);
}
