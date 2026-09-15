"use client";

import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";

import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

type Route = {
  id: number;
  distanceKm: number;
  durationMinutes: number;
  geometry: {
    type: string;
    coordinates: number[][];
  };
};

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

type RouteMapProps = {
  routes: Route[];

  from: {
    latitude: number;
    longitude: number;
  };

  to: {
    latitude: number;
    longitude: number;
  };

  weather: Record<number, RouteWeather>;
};

// ======================================================
// MAP BOUNDS
// ======================================================

function MapBounds({
  routes,
  from,
  to,
}: RouteMapProps) {
  const map = useMap();

  useEffect(() => {
    const allPoints = routes.flatMap(
      (route) =>
        route.geometry.coordinates.map(
          ([lon, lat]) =>
            [lat, lon] as [
              number,
              number
            ]
        )
    );

    allPoints.push(
      [from.latitude, from.longitude],
      [to.latitude, to.longitude]
    );

    if (allPoints.length > 0) {
      map.fitBounds(allPoints, {
        padding: [30, 30],
      });
    }
  }, [
    map,
    routes,
    from,
    to,
  ]);

  return null;
}

// ======================================================
// WEATHER MARKER COLOR
// ======================================================

function getWeatherColor(
  point: WeatherPoint
): string {
  if (!point.weather) {
    return "#064e3b";
  }

  const probability =
    point.weather
      .precipitationProbability ?? 0;

  const rain =
    point.weather.rain ?? 0;

  const showers =
    point.weather.showers ?? 0;

  const code =
    point.weather.weatherCode ?? 0;

  // Thunderstorm
  if (code >= 95) {
    return "#ef4444";
  }

  // High rain
  if (
    probability >= 70 ||
    rain >= 2 ||
    showers >= 2
  ) {
    return "#f97316";
  }

  // Moderate rain
  if (
    probability >= 40 ||
    rain >= 0.5 ||
    showers >= 0.5
  ) {
    return "#eab308";
  }

  // Low rain
  return "#22c55e";
}

// ======================================================
// WEATHER ICON
// ======================================================

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

// ======================================================
// WEATHER RISK
// ======================================================

function getRiskLabel(
  point: WeatherPoint
): string {
  if (!point.weather) {
    return "Weather unavailable";
  }

  const probability =
    point.weather
      .precipitationProbability ?? 0;

  const rain =
    point.weather.rain ?? 0;

  const showers =
    point.weather.showers ?? 0;

  const code =
    point.weather.weatherCode ?? 0;

  if (code >= 95) {
    return "Thunderstorm possible";
  }

  if (
    probability >= 70 ||
    rain >= 2 ||
    showers >= 2
  ) {
    return "High rain risk";
  }

  if (
    probability >= 40 ||
    rain >= 0.5 ||
    showers >= 0.5
  ) {
    return "Rain possible";
  }

  return "Low rain risk";
}

// ======================================================
// ARRIVAL TIME
// ======================================================

function formatArrivalTime(
  arrivalMinutes: number
): string {
  if (arrivalMinutes < 1) {
    return "Now";
  }

  if (arrivalMinutes < 60) {
    return `~${Math.round(
      arrivalMinutes
    )} min`;
  }

  const hours =
    Math.floor(
      arrivalMinutes / 60
    );

  const minutes =
    Math.round(
      arrivalMinutes % 60
    );

  return `~${hours}h ${minutes}m`;
}

// ======================================================
// ROUTE MAP
// ======================================================

export default function RouteMap({
  routes,
  from,
  to,
  weather,
}: RouteMapProps) {
  const center: [
    number,
    number
  ] = [
    from.latitude,
    from.longitude,
  ];

  return (
    <div className="overflow-hidden rounded-3xl border border-emerald-950 bg-[#020806]">

      <MapContainer
        center={center}
        zoom={11}
        scrollWheelZoom={true}
        className="h-[400px] w-full"
      >

        {/* ================================================= */}
        {/* MAP TILES */}
        {/* ================================================= */}

        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* ================================================= */}
        {/* AUTOMATIC MAP BOUNDS */}
        {/* ================================================= */}

        <MapBounds
          routes={routes}
          from={from}
          to={to}
          weather={weather}
        />

        {/* ================================================= */}
        {/* ROUTES */}
        {/* ================================================= */}

        {routes.map(
          (route, index) => {
            const positions =
              route.geometry.coordinates.map(
                ([
                  longitude,
                  latitude,
                ]) =>
                  [
                    latitude,
                    longitude,
                  ] as [
                    number,
                    number
                  ]
              );

            return (
              <Polyline
                key={route.id}
                positions={
                  positions
                }
                pathOptions={{
                  color:
                    index === 0
                      ? "#10b981"
                      : "#34d399",

                  weight:
                    index === 0
                      ? 6
                      : 4,

                  opacity:
                    index === 0
                      ? 0.95
                      : 0.55,
                }}
              />
            );
          }
        )}

        {/* ================================================= */}
        {/* WEATHER CHECKPOINTS */}
        {/* ================================================= */}

        {routes.map(
          (route) => {
            const routeWeather =
              weather[
                route.id
              ];

            if (
              !routeWeather
            ) {
              return null;
            }

            return routeWeather.points.map(
              (point) => {
                const markerColor =
                  getWeatherColor(
                    point
                  );

                const weatherData =
                  point.weather;

                return (
                  <CircleMarker
                    key={`${route.id}-${point.index}`}
                    center={[
                      point.latitude,
                      point.longitude,
                    ]}
                    radius={7}
                    pathOptions={{
                      color:
                        "#ecfdf5",

                      weight: 2,

                      fillColor:
                        markerColor,

                      fillOpacity: 1,
                    }}
                  >

                    {/* ================================================= */}
                    {/* WEATHER POPUP */}
                    {/* ================================================= */}

                    <Popup>

                      <div className="min-w-[190px] text-slate-900">

                        {/* HEADER */}

                        <div className="flex items-center gap-2">

                          <span className="text-xl">
                            {weatherData
                              ? getWeatherIcon(
                                  weatherData.weatherDescription
                                )
                              : "❔"}
                          </span>

                          <div>

                            <strong>
                              Weather checkpoint
                            </strong>

                            <div className="text-xs text-slate-500">
                              {
                                point.distanceKm
                              }{" "}
                              km into route
                            </div>

                          </div>

                        </div>

                        {/* WEATHER DATA */}

                        {weatherData ? (
                          <div className="mt-3 space-y-1 text-sm">

                            <div>
                              <strong>
                                Condition:
                              </strong>{" "}
                              {
                                weatherData.weatherDescription
                              }
                            </div>

                            <div>
                              <strong>
                                Arrival:
                              </strong>{" "}
                              {formatArrivalTime(
                                point.arrivalMinutes
                              )}
                            </div>

                            <div>
                              <strong>
                                Rain probability:
                              </strong>{" "}
                              {
                                weatherData.precipitationProbability
                              }
                              %
                            </div>

                            <div>
                              <strong>
                                Rain:
                              </strong>{" "}
                              {
                                weatherData.rain
                              }{" "}
                              mm
                            </div>

                            <div>
                              <strong>
                                Temperature:
                              </strong>{" "}
                              {
                                weatherData.temperature
                              }
                              °C
                            </div>

                            <div>
                              <strong>
                                Wind:
                              </strong>{" "}
                              {
                                weatherData.windSpeed
                              }{" "}
                              km/h
                            </div>

                            <div>
                              <strong>
                                Gusts:
                              </strong>{" "}
                              {
                                weatherData.windGusts
                              }{" "}
                              km/h
                            </div>

                            {/* RISK */}

                            <div className="mt-2 font-semibold">
                              {
                                getRiskLabel(
                                  point
                                )
                              }
                            </div>

                          </div>
                        ) : (
                          <p className="mt-2 text-sm">
                            Weather unavailable.
                          </p>
                        )}

                      </div>

                    </Popup>

                  </CircleMarker>
                );
              }
            );
          }
        )}

        {/* ================================================= */}
        {/* STARTING POINT */}
        {/* ================================================= */}

        <CircleMarker
          center={[
            from.latitude,
            from.longitude,
          ]}
          radius={9}
          pathOptions={{
            color: "#ecfdf5",
            weight: 2,
            fillColor: "#059669",
            fillOpacity: 1,
          }}
        >

          <Popup>

            <div className="text-slate-900">

              <strong>
                Starting location
              </strong>

            </div>

          </Popup>

        </CircleMarker>

        {/* ================================================= */}
        {/* DESTINATION */}
        {/* ================================================= */}

        <CircleMarker
          center={[
            to.latitude,
            to.longitude,
          ]}
          radius={9}
          pathOptions={{
            color: "#ecfdf5",
            weight: 2,
            fillColor: "#16a34a",
            fillOpacity: 1,
          }}
        >

          <Popup>

            <div className="text-slate-900">

              <strong>
                Destination
              </strong>

            </div>

          </Popup>

        </CircleMarker>

      </MapContainer>

    </div>
  );
}