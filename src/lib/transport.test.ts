import { describe, expect, it } from "vitest";
import { itemTransport, parseRoutes, resolveTransport, routeCity, routeLabel, routesText, transportChoices } from "./transport";

const pasted = `City,Transport
Delhi,Vin General Transport
Delhi,Radhe Lal Vishnu Kumar Transport
Faridabad,Vin General Transport
Faridabad,Thru Your Vehicle
Mumbai,Vijay Lakshmi Transport
Noida,Thru Your Vehicle`;

const settings = { destination: "MIDC Chakan, Pune", routes: parseRoutes(pasted).routes };

describe("parseRoutes", () => {
  it("reads the sheet as pasted, skipping the header", () => {
    const { routes, problems } = parseRoutes(pasted);
    expect(problems).toEqual([]);
    expect(routes).toHaveLength(6);
    expect(routes[0]).toEqual({ city: "Delhi", name: "Vin General Transport" });
    expect(routes[5]).toEqual({ city: "Noida", name: "Thru Your Vehicle" });
  });

  it("takes tabs and commas inside the name, drops repeats, reports half lines", () => {
    const { routes, problems } = parseRoutes("Noida\tThru Your Vehicle\nAgra, Shree Ram, Roadways\nnoida, thru your vehicle\nPune");
    expect(routes).toEqual([
      { city: "Noida", name: "Thru Your Vehicle" },
      { city: "Agra", name: "Shree Ram, Roadways" },
    ]);
    expect(problems).toEqual(["Line 4: “Pune” needs a city, a comma and the transporter."]);
  });

  it("round-trips through the text form", () => {
    expect(parseRoutes(routesText(settings.routes)).routes).toEqual(settings.routes);
  });
});

describe("resolveTransport", () => {
  it("cleans stored JSON", () => {
    expect(resolveTransport(null)).toEqual({ destination: "", routes: [] });
    expect(resolveTransport({ destination: " MIDC Chakan,  Pune ", routes: [{ city: "Delhi", name: "VG" }, { city: "", name: "x" }, { city: "delhi", name: "vg" }] })).toEqual({
      destination: "MIDC Chakan, Pune",
      routes: [{ city: "Delhi", name: "VG" }],
    });
  });
});

describe("routeCity", () => {
  it("matches the vendor's city, or a city named in its address", () => {
    expect(routeCity(settings.routes, { city: "New Delhi" })).toBe("Delhi");
    expect(routeCity(settings.routes, { city: "MUMBAI" })).toBe("Mumbai");
    expect(routeCity(settings.routes, { city: null, address: "Plot 4, Sector 24, Faridabad, Haryana" })).toBe("Faridabad");
    expect(routeCity(settings.routes, { city: "Ahmedabad", address: "Near Delhi Darwaza" })).toBeNull();
    expect(routeCity(settings.routes, { city: "Delhiwala Nagar" })).toBeNull();
    expect(routeCity(settings.routes, { city: null, address: null })).toBeNull();
  });
});

describe("transportChoices", () => {
  it("puts the vendor's own choice first, then its city's list, then names used before", () => {
    const used = { delhi: ["Gati", "vin general transport"] };
    expect(transportChoices({ settings, used }, { city: "Delhi" })).toEqual({
      city: "Delhi",
      recommended: "Vin General Transport",
      options: ["Vin General Transport", "Radhe Lal Vishnu Kumar Transport", "Gati"],
    });
    expect(transportChoices({ settings, used }, { city: "Delhi", preferredTransport: "Radhe Lal Vishnu Kumar Transport" }).recommended).toBe(
      "Radhe Lal Vishnu Kumar Transport",
    );
  });

  it("lets an item that always comes one way (an adhesive by courier) win", () => {
    const forItem = itemTransport([{ preferredTransport: null }, { preferredTransport: " Courier " }]);
    expect(forItem).toBe("Courier");
    const choice = transportChoices({ settings, used: {} }, { city: "Mumbai", preferredTransport: "VRL" }, forItem);
    expect(choice.recommended).toBe("Courier");
    expect(choice.options).toEqual(["Courier", "VRL", "Vijay Lakshmi Transport"]);
    expect(itemTransport([undefined, { preferredTransport: "" }])).toBeNull();
  });

  it("suggests names used from a city that isn't in the list", () => {
    const used = { ahmedabad: ["Patel Roadways"] };
    expect(transportChoices({ settings, used }, { city: "Ahmedabad" })).toEqual({ city: null, recommended: null, options: ["Patel Roadways"] });
  });

  it("labels the route", () => {
    expect(routeLabel(settings, "Mumbai")).toBe("Mumbai → MIDC Chakan, Pune");
    expect(routeLabel(settings, null)).toBeNull();
  });
});
