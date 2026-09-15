"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const RouteMap = dynamic(
  () => import("../components/RouteMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[400px] items-center justify-center rounded-3xl border border-emerald-950 bg-[#07140f]">
        <div className="text-sm text-emerald-700">
          Loading map...
        </div>
      </div>
    ),
  }
);

type Location = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
};

type Route = {
  id: number;
  distanceKm: number;
  durationMinutes: number;
  geometry: {
    type: string;
    coordinates: number[][];
  };
};

type LocationField = "from" | "to";

type WeatherPoint = {
  index: number;
  latitude: number;
  longitude: number;
  distanceKm: number;
  arrivalMinutes: number;
  arrivalTime: string;
  forecastTime: string | null;

  weather: {
    temperature: number | null;
    humidity: number | null;
    precipitationProbability: number | null;
    precipitation: number | null;
    rain: number | null;
    showers: number | null;
    weatherCode: number | null;
    weatherDescription: string;
    cloudCover: number | null;
    windSpeed: number | null;
    windDirection: number | null;
    windGusts: number | null;
  } | null;
};

type RouteWeather = {
  source: string;
  timezone: string | null;

  route: {
    durationMinutes: number;
    sampleIntervalKm: number;
    sampleCount: number;
  };

  points: WeatherPoint[];
};

function getWeatherIcon(
  description: string
): string {
  const value =
    description.toLowerCase();

  if (
    value.includes("thunder")
  ) {
    return "⛈️";
  }

  if (
    value.includes("rain") ||
    value.includes("drizzle")
  ) {
    return "🌧️";
  }

  if (
    value.includes("fog")
  ) {
    return "🌫️";
  }

  if (
    value.includes("cloud")
  ) {
    return "☁️";
  }

  if (
    value.includes("clear")
  ) {
    return "☀️";
  }

  if (
    value.includes("snow")
  ) {
    return "❄️";
  }

  return "🌤️";
}

function getRainRisk(
  point: WeatherPoint
): {
  label: string;
  className: string;
} {
  if (!point.weather) {
    return {
      label: "Unavailable",
      className: "text-emerald-900",
    };
  }

  const probability =
    point.weather
      .precipitationProbability ?? 0;

  const rain =
    point.weather.rain ?? 0;

  const showers =
    point.weather.showers ?? 0;

  const code =
    point.weather.weatherCode;

  if (
    code !== null &&
    code >= 95
  ) {
    return {
      label: "Storm risk",
      className: "text-red-400",
    };
  }

  if (
    probability >= 70 ||
    rain >= 2 ||
    showers >= 2
  ) {
    return {
      label: "High rain risk",
      className: "text-orange-400",
    };
  }

  if (
    probability >= 40 ||
    rain >= 0.5 ||
    showers >= 0.5
  ) {
    return {
      label: "Rain possible",
      className: "text-yellow-400",
    };
  }

  return {
    label: "Low rain risk",
    className: "text-emerald-400",
  };
}

function getRouteWeatherSummary(
  weather: RouteWeather
) {
  const validPoints =
    weather.points.filter(
      (point) => point.weather
    );

  if (
    validPoints.length === 0
  ) {
    return {
      icon: "❔",
      title: "Weather unavailable",
      detail:
        "Weather data could not be matched to this route.",
    };
  }

  const maxProbability =
    Math.max(
      ...validPoints.map(
        (point) =>
          point.weather
            ?.precipitationProbability ??
          0
      )
    );

  const maxRain =
    Math.max(
      ...validPoints.map(
        (point) =>
          point.weather?.rain ?? 0
      )
    );

  const stormPoint =
    validPoints.find(
      (point) =>
        point.weather
          ?.weatherCode !== null &&
        (point.weather
          ?.weatherCode ?? 0) >= 95
    );

  if (stormPoint) {
    return {
      icon: "⛈️",
      title: "Thunderstorm possible",
      detail: `Storm conditions are forecast around ${stormPoint.distanceKm} km into the route.`,
    };
  }

  if (
    maxProbability >= 70 ||
    maxRain >= 2
  ) {
    return {
      icon: "🌧️",
      title: "Rain likely along route",
      detail: `Maximum forecast rain probability is ${maxProbability}%.`,
    };
  }

  if (
    maxProbability >= 40 ||
    maxRain >= 0.5
  ) {
    return {
      icon: "🌦️",
      title: "Rain possible along route",
      detail: `Rain probability reaches ${maxProbability}% at some route checkpoints.`,
    };
  }

  return {
    icon: "☁️",
    title: "No significant rain signal",
    detail: `Maximum forecast rain probability is ${maxProbability}%.`,
  };
}

export default function Home() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [fromSuggestions, setFromSuggestions] =
    useState<Location[]>([]);

  const [toSuggestions, setToSuggestions] =
    useState<Location[]>([]);

  const [selectedFrom, setSelectedFrom] =
    useState<Location | null>(null);

  const [selectedTo, setSelectedTo] =
    useState<Location | null>(null);

  const [activeField, setActiveField] =
    useState<LocationField | null>(null);

  const [searchingFrom, setSearchingFrom] =
    useState(false);

  const [searchingTo, setSearchingTo] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [weatherLoading, setWeatherLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [weatherError, setWeatherError] =
    useState("");

  const [routeInfo, setRouteInfo] =
    useState<{
      from: Location;
      to: Location;
      routes: Route[];
    } | null>(null);

  const [routeWeather, setRouteWeather] =
    useState<Record<number, RouteWeather>>(
      {}
    );

  const fromTimer =
    useRef<NodeJS.Timeout | null>(null);

  const toTimer =
    useRef<NodeJS.Timeout | null>(null);

  // ======================================================
  // LOCATION SEARCH
  // ======================================================

  async function searchLocation(
    value: string,
    field: LocationField
  ) {
    if (value.trim().length < 2) {
      if (field === "from") {
        setFromSuggestions([]);
      } else {
        setToSuggestions([]);
      }

      return;
    }

    if (field === "from") {
      setSearchingFrom(true);
    } else {
      setSearchingTo(true);
    }

    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(
          value.trim()
        )}`
      );

      if (!response.ok) {
        throw new Error(
          "Location search failed."
        );
      }

      const results: Location[] =
        await response.json();

      if (field === "from") {
        setFromSuggestions(results);
      } else {
        setToSuggestions(results);
      }
    } catch {
      if (field === "from") {
        setFromSuggestions([]);
      } else {
        setToSuggestions([]);
      }
    } finally {
      if (field === "from") {
        setSearchingFrom(false);
      } else {
        setSearchingTo(false);
      }
    }
  }

  function handleFromChange(
    value: string
  ) {
    setFrom(value);
    setSelectedFrom(null);
    setRouteInfo(null);
    setRouteWeather({});
    setError("");
    setWeatherError("");

    if (fromTimer.current) {
      clearTimeout(
        fromTimer.current
      );
    }

    fromTimer.current =
      setTimeout(() => {
        searchLocation(
          value,
          "from"
        );
      }, 400);
  }

  function handleToChange(
    value: string
  ) {
    setTo(value);
    setSelectedTo(null);
    setRouteInfo(null);
    setRouteWeather({});
    setError("");
    setWeatherError("");

    if (toTimer.current) {
      clearTimeout(
        toTimer.current
      );
    }

    toTimer.current =
      setTimeout(() => {
        searchLocation(
          value,
          "to"
        );
      }, 400);
  }

  function selectFrom(
    location: Location
  ) {
    setFrom(location.name);
    setSelectedFrom(location);
    setFromSuggestions([]);
    setActiveField(null);
    setError("");
  }

  function selectTo(
    location: Location
  ) {
    setTo(location.name);
    setSelectedTo(location);
    setToSuggestions([]);
    setActiveField(null);
    setError("");
  }

  // ======================================================
  // ROUTE WEATHER
  // ======================================================

  async function getRouteWeather(
    routes: Route[]
  ) {
    setWeatherLoading(true);
    setWeatherError("");
    setRouteWeather({});

    try {
      const weatherResults =
        await Promise.all(
          routes.map(
            async (route) => {
              const response =
                await fetch(
                  "/api/route-weather",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type":
                        "application/json",
                    },
                    body: JSON.stringify({
                      geometry:
                        route.geometry,
                      durationMinutes:
                        route.durationMinutes,
                    }),
                  }
                );

              if (!response.ok) {
                const data =
                  await response
                    .json()
                    .catch(
                      () => null
                    );

                throw new Error(
                  data?.error ??
                    `Weather request failed for Route ${route.id}.`
                );
              }

              const data: RouteWeather =
                await response.json();

              return {
                routeId: route.id,
                data,
              };
            }
          )
        );

      const weatherMap: Record<
        number,
        RouteWeather
      > = {};

      for (
        const result of weatherResults
      ) {
        weatherMap[
          result.routeId
        ] = result.data;
      }

      setRouteWeather(
        weatherMap
      );
    } catch (err) {
      setWeatherError(
        err instanceof Error
          ? err.message
          : "Unable to retrieve route weather."
      );
    } finally {
      setWeatherLoading(false);
    }
  }

  // ======================================================
  // CHECK ROUTE
  // ======================================================

  async function checkRoute() {
    setError("");
    setWeatherError("");
    setRouteInfo(null);
    setRouteWeather({});

    if (!selectedFrom) {
      setError(
        "Please select a starting location from the suggestions."
      );
      return;
    }

    if (!selectedTo) {
      setError(
        "Please select a destination from the suggestions."
      );
      return;
    }

    setLoading(true);

    try {
      const routeResponse =
        await fetch(
          `/api/routes?fromLat=${selectedFrom.latitude}` +
            `&fromLon=${selectedFrom.longitude}` +
            `&toLat=${selectedTo.latitude}` +
            `&toLon=${selectedTo.longitude}`
        );

      if (!routeResponse.ok) {
        throw new Error(
          "Could not calculate a driving route."
        );
      }

      const routeData =
        await routeResponse.json();

      if (
        !routeData.routes ||
        routeData.routes.length === 0
      ) {
        throw new Error(
          "No driving route was found between these locations."
        );
      }

      const newRouteInfo = {
        from: selectedFrom,
        to: selectedTo,
        routes:
          routeData.routes,
      };

      setRouteInfo(
        newRouteInfo
      );

      await getRouteWeather(
        routeData.routes
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while checking the route."
      );
    } finally {
      setLoading(false);
    }
  }

  // ======================================================
  // CLEAN UP
  // ======================================================

  useEffect(() => {
    return () => {
      if (fromTimer.current) {
        clearTimeout(
          fromTimer.current
        );
      }

      if (toTimer.current) {
        clearTimeout(
          toTimer.current
        );
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#020806] text-white">

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8">

        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <header className="mb-10">

          <div className="text-3xl font-bold tracking-tight">

            <span className="text-white">
              rain
            </span>

            <span className="text-emerald-400">
              sick
            </span>

          </div>

          {/* NEW CAPTION */}

          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-600">
             by mr meetings
          </p>

          <p className="mt-3 text-sm text-emerald-700">
            Weather intelligence for your journey.
          </p>

        </header>

        {/* ================================================= */}
        {/* SEARCH CARD */}
        {/* ================================================= */}

        <section className="rounded-3xl border border-emerald-950 bg-[#07140f] p-5 shadow-2xl shadow-black/40">

          <h1 className="text-2xl font-semibold">
            Where are you going?
          </h1>

          <p className="mt-2 text-sm text-emerald-700">
            Select your exact locations to check weather
            along the route.
          </p>

          {/* STARTING LOCATION */}

          <div className="relative mt-7">

            <label className="mb-2 block text-sm font-medium text-emerald-300">
              Starting location
            </label>

            <div
              className={`flex items-center rounded-2xl border bg-[#020806] px-4 ${
                selectedFrom
                  ? "border-emerald-500"
                  : "border-emerald-950"
              }`}
            >

              <span className="mr-3 text-lg">
                📍
              </span>

              <input
                type="text"
                value={from}
                onChange={(e) =>
                  handleFromChange(
                    e.target.value
                  )
                }
                onFocus={() =>
                  setActiveField("from")
                }
                placeholder="e.g. Gandhinagar"
                className="w-full bg-transparent py-4 text-white outline-none placeholder:text-emerald-950"
              />

              {searchingFrom && (
                <span className="ml-2 text-xs text-emerald-700">
                  Searching...
                </span>
              )}

            </div>

            {activeField === "from" &&
              fromSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-emerald-900 bg-[#030b08] shadow-2xl">

                  {fromSuggestions.map(
                    (location) => (
                      <button
                        key={location.id}
                        type="button"
                        onClick={() =>
                          selectFrom(
                            location
                          )
                        }
                        className="w-full border-b border-emerald-950 px-4 py-4 text-left transition last:border-b-0 hover:bg-emerald-950/40"
                      >

                        <div className="flex gap-3">

                          <span className="mt-0.5">
                            📍
                          </span>

                          <div>

                            <p className="text-sm font-medium text-white">
                              {
                                location.name
                              }
                            </p>

                            <p className="mt-1 text-xs text-emerald-800">
                              {location.latitude.toFixed(
                                5
                              )}
                              {", "}
                              {location.longitude.toFixed(
                                5
                              )}
                            </p>

                          </div>

                        </div>

                      </button>
                    )
                  )}

                </div>
              )}

            {selectedFrom && (
              <p className="mt-2 text-xs text-emerald-400">
                ✓ Starting location selected
              </p>
            )}

          </div>

          {/* DESTINATION */}

          <div className="relative mt-5">

            <label className="mb-2 block text-sm font-medium text-emerald-300">
              Destination
            </label>

            <div
              className={`flex items-center rounded-2xl border bg-[#020806] px-4 ${
                selectedTo
                  ? "border-emerald-500"
                  : "border-emerald-950"
              }`}
            >

              <span className="mr-3 text-lg">
                🏁
              </span>

              <input
                type="text"
                value={to}
                onChange={(e) =>
                  handleToChange(
                    e.target.value
                  )
                }
                onFocus={() =>
                  setActiveField("to")
                }
                placeholder="e.g. Ahmedabad"
                className="w-full bg-transparent py-4 text-white outline-none placeholder:text-emerald-950"
              />

              {searchingTo && (
                <span className="ml-2 text-xs text-emerald-700">
                  Searching...
                </span>
              )}

            </div>

            {activeField === "to" &&
              toSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-emerald-900 bg-[#030b08] shadow-2xl">

                  {toSuggestions.map(
                    (location) => (
                      <button
                        key={location.id}
                        type="button"
                        onClick={() =>
                          selectTo(
                            location
                          )
                        }
                        className="w-full border-b border-emerald-950 px-4 py-4 text-left transition last:border-b-0 hover:bg-emerald-950/40"
                      >

                        <div className="flex gap-3">

                          <span className="mt-0.5">
                            🏁
                          </span>

                          <div>

                            <p className="text-sm font-medium text-white">
                              {
                                location.name
                              }
                            </p>

                            <p className="mt-1 text-xs text-emerald-800">
                              {location.latitude.toFixed(
                                5
                              )}
                              {", "}
                              {location.longitude.toFixed(
                                5
                              )}
                            </p>

                          </div>

                        </div>

                      </button>
                    )
                  )}

                </div>
              )}

            {selectedTo && (
              <p className="mt-2 text-xs text-emerald-400">
                ✓ Destination selected
              </p>
            )}

          </div>

          {/* ERROR */}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* BUTTON */}

          <button
            onClick={checkRoute}
            disabled={
              loading ||
              weatherLoading
            }
            className="mt-7 w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >

            {loading
              ? "Calculating route..."
              : weatherLoading
              ? "Analyzing route weather..."
              : "Check Route →"}

          </button>

        </section>

        {/* ================================================= */}
        {/* ROUTE RESULTS */}
        {/* ================================================= */}

        {routeInfo && (
          <section className="mt-6 rounded-3xl border border-emerald-950 bg-[#07140f] p-5">

            <div className="mb-5">

              <p className="text-xs font-medium uppercase tracking-wider text-emerald-500">
                Route found
              </p>

              <h2 className="mt-1 text-xl font-semibold">
                {routeInfo.routes.length}{" "}
                {routeInfo.routes.length ===
                1
                  ? "route"
                  : "routes"}{" "}
                available
              </h2>

            </div>

            {/* MAP */}

            <RouteMap
              routes={routeInfo.routes}
              from={routeInfo.from}
              to={routeInfo.to}
              weather={routeWeather}
            />

            {/* ROUTE SUMMARY */}

            <div className="mt-5 space-y-3">

              {routeInfo.routes.map(
                (route, index) => {

                  const weather =
                    routeWeather[
                      route.id
                    ];

                  return (
                    <div
                      key={route.id}
                      className="rounded-2xl border border-emerald-950 bg-[#020806] p-4"
                    >

                      <div className="flex items-center justify-between">

                        <div>

                          <p className="text-xs uppercase tracking-wider text-emerald-700">
                            Route {index + 1}
                          </p>

                          <p className="mt-1 text-lg font-semibold">
                            {
                              route.distanceKm
                            }{" "}
                            km
                          </p>

                        </div>

                        <div className="text-right">

                          <p className="text-xs text-emerald-700">
                            Estimated time
                          </p>

                          <p className="mt-1 font-medium">
                            {
                              route.durationMinutes
                            }{" "}
                            min
                          </p>

                        </div>

                      </div>

                      {weather && (
                        <div className="mt-4 border-t border-emerald-950 pt-4">

                          {(() => {

                            const summary =
                              getRouteWeatherSummary(
                                weather
                              );

                            return (
                              <div className="flex items-start gap-3">

                                <span className="text-2xl">
                                  {
                                    summary.icon
                                  }
                                </span>

                                <div>

                                  <p className="font-medium">
                                    {
                                      summary.title
                                    }
                                  </p>

                                  <p className="mt-1 text-xs text-emerald-700">
                                    {
                                      summary.detail
                                    }
                                  </p>

                                </div>

                              </div>
                            );

                          })()}

                        </div>
                      )}

                      {!weather &&
                        weatherLoading && (
                          <div className="mt-4 border-t border-emerald-950 pt-4 text-sm text-emerald-700">
                            Analyzing weather along this route...
                          </div>
                        )}

                    </div>
                  );
                }
              )}

            </div>

            {/* WEATHER ERROR */}

            {weatherError && (
              <div className="mt-5 rounded-2xl border border-yellow-900 bg-yellow-950/30 p-4 text-sm text-yellow-300">

                Weather could not be loaded:
                <br />

                {weatherError}

              </div>
            )}

            {/* ================================================= */}
            {/* WEATHER CHECKPOINTS */}
            {/* ================================================= */}

            {Object.entries(
              routeWeather
            ).map(
              ([routeId, weather]) => {

                const route =
                  routeInfo.routes.find(
                    (item) =>
                      item.id ===
                      Number(routeId)
                  );

                if (!route) {
                  return null;
                }

                return (
                  <div
                    key={routeId}
                    className="mt-5 rounded-2xl border border-emerald-950 bg-[#020806] p-4"
                  >

                    <div className="mb-4">

                      <p className="text-xs font-medium uppercase tracking-wider text-emerald-500">

                        Route{" "}
                        {routeInfo.routes.indexOf(
                          route
                        ) + 1}{" "}
                        Weather

                      </p>

                      <p className="mt-1 text-sm text-emerald-700">

                        Weather checkpoints every{" "}
                        {
                          weather.route
                            .sampleIntervalKm
                        }{" "}
                        km

                      </p>

                    </div>

                    <div className="space-y-3">

                      {weather.points.map(
                        (point) => {

                          const risk =
                            getRainRisk(
                              point
                            );

                          const weatherData =
                            point.weather;

                          return (
                            <div
                              key={
                                point.index
                              }
                              className="rounded-xl border border-emerald-950 bg-[#07140f] p-3"
                            >

                              <div className="flex items-center justify-between">

                                <div className="flex items-center gap-3">

                                  <span className="text-xl">

                                    {weatherData
                                      ? getWeatherIcon(
                                          weatherData.weatherDescription
                                        )
                                      : "❔"}

                                  </span>

                                  <div>

                                    <p className="text-sm font-medium">
                                      {
                                        point.distanceKm
                                      }{" "}
                                      km
                                    </p>

                                    <p className="text-xs text-emerald-700">
                                      Arrival ≈{" "}
                                      {Math.round(
                                        point.arrivalMinutes
                                      )}{" "}
                                      min
                                    </p>

                                  </div>

                                </div>

                                <div className="text-right">

                                  {weatherData && (
                                    <p
                                      className={`text-xs font-medium ${risk.className}`}
                                    >
                                      {
                                        risk.label
                                      }
                                    </p>
                                  )}

                                </div>

                              </div>

                              {weatherData && (
                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">

                                  <div className="rounded-lg bg-[#020806] p-2">

                                    <p className="text-emerald-700">
                                      Condition
                                    </p>

                                    <p className="mt-1">
                                      {
                                        weatherData.weatherDescription
                                      }
                                    </p>

                                  </div>

                                  <div className="rounded-lg bg-[#020806] p-2">

                                    <p className="text-emerald-700">
                                      Temperature
                                    </p>

                                    <p className="mt-1">
                                      {
                                        weatherData.temperature
                                      }
                                      °C
                                    </p>

                                  </div>

                                  <div className="rounded-lg bg-[#020806] p-2">

                                    <p className="text-emerald-700">
                                      Rain probability
                                    </p>

                                    <p className="mt-1">
                                      {
                                        weatherData.precipitationProbability
                                      }
                                      %
                                    </p>

                                  </div>

                                  <div className="rounded-lg bg-[#020806] p-2">

                                    <p className="text-emerald-700">
                                      Rain
                                    </p>

                                    <p className="mt-1">
                                      {
                                        weatherData.rain
                                      }{" "}
                                      mm
                                    </p>

                                  </div>

                                  <div className="rounded-lg bg-[#020806] p-2">

                                    <p className="text-emerald-700">
                                      Wind
                                    </p>

                                    <p className="mt-1">
                                      {
                                        weatherData.windSpeed
                                      }{" "}
                                      km/h
                                    </p>

                                  </div>

                                  <div className="rounded-lg bg-[#020806] p-2">

                                    <p className="text-emerald-700">
                                      Gusts
                                    </p>

                                    <p className="mt-1">
                                      {
                                        weatherData.windGusts
                                      }{" "}
                                      km/h
                                    </p>

                                  </div>

                                </div>
                              )}

                            </div>
                          );
                        }
                      )}

                    </div>

                  </div>
                );
              }
            )}

            {/* ================================================= */}
            {/* START LOCATION */}
            {/* ================================================= */}

            <div className="mt-6 border-l-2 border-emerald-500 pl-4">

              <p className="text-xs font-medium text-emerald-700">
                STARTING LOCATION
              </p>

              <p className="mt-1 font-medium leading-relaxed">
                {routeInfo.from.name}
              </p>

              <p className="mt-1 text-xs text-emerald-800">
                {routeInfo.from.latitude.toFixed(
                  5
                )}
                {", "}
                {routeInfo.from.longitude.toFixed(
                  5
                )}
              </p>

            </div>

            <div className="my-4 ml-1 h-8 border-l-2 border-dashed border-emerald-950" />

            {/* ================================================= */}
            {/* DESTINATION */}
            {/* ================================================= */}

            <div className="border-l-2 border-green-500 pl-4">

              <p className="text-xs font-medium text-emerald-700">
                DESTINATION
              </p>

              <p className="mt-1 font-medium leading-relaxed">
                {routeInfo.to.name}
              </p>

              <p className="mt-1 text-xs text-emerald-800">
                {routeInfo.to.latitude.toFixed(
                  5
                )}
                {", "}
                {routeInfo.to.longitude.toFixed(
                  5
                )}
              </p>

            </div>

            {/* SUCCESS */}

            <div className="mt-6 rounded-2xl border border-emerald-950 bg-[#020806] p-4 text-center text-sm text-emerald-600">
              ✓ Route and weather analysis completed.
            </div>

          </section>
        )}

        {/* ================================================= */}
        {/* WEATHER CATEGORIES */}
        {/* ================================================= */}

        <section className="mt-6 grid grid-cols-3 gap-3">

          <div className="rounded-2xl border border-emerald-950 bg-[#07140f] p-4 text-center">

            <div className="text-xl">
              🌧️
            </div>

            <p className="mt-2 text-xs text-emerald-700">
              Rain
            </p>

          </div>

          <div className="rounded-2xl border border-emerald-950 bg-[#07140f] p-4 text-center">

            <div className="text-xl">
              ⛈️
            </div>

            <p className="mt-2 text-xs text-emerald-700">
              Storms
            </p>

          </div>

          <div className="rounded-2xl border border-emerald-950 bg-[#07140f] p-4 text-center">

            <div className="text-xl">
              💨
            </div>

            <p className="mt-2 text-xs text-emerald-700">
              Wind
            </p>

          </div>

        </section>

        {/* FOOTER */}

        <footer className="mt-auto pt-10 text-center text-xs text-emerald-900">
          rainsick · Route weather intelligence
        </footer>

      </div>
    </main>
  );
}