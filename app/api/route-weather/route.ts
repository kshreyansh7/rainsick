import { NextRequest, NextResponse } from "next/server";

type Coordinate = [number, number];

type RouteWeatherRequest = {
  geometry: {
    coordinates: Coordinate[];
  };
  durationMinutes: number;
};

function haversineDistanceKm(
  a: Coordinate,
  b: Coordinate
): number {
  const R = 6371;

  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;

  const dLat =
    ((b[1] - a[1]) * Math.PI) / 180;

  const dLon =
    ((b[0] - a[0]) * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(x),
      Math.sqrt(1 - x)
    )
  );
}

function sampleRoute(
  coordinates: Coordinate[],
  intervalKm = 2
) {
  if (coordinates.length === 0) {
    return [];
  }

  const samples: {
    coordinate: Coordinate;
    distanceKm: number;
  }[] = [];

  let accumulatedDistance = 0;
  let nextSampleDistance = 0;

  samples.push({
    coordinate: coordinates[0],
    distanceKm: 0,
  });

  nextSampleDistance = intervalKm;

  for (let i = 1; i < coordinates.length; i++) {
    accumulatedDistance +=
      haversineDistanceKm(
        coordinates[i - 1],
        coordinates[i]
      );

    if (
      accumulatedDistance >=
      nextSampleDistance
    ) {
      samples.push({
        coordinate: coordinates[i],
        distanceKm: accumulatedDistance,
      });

      nextSampleDistance += intervalKm;
    }
  }

  const lastCoordinate =
    coordinates[coordinates.length - 1];

  const lastSample =
    samples[samples.length - 1];

  if (
    !lastSample ||
    lastSample.coordinate[0] !==
      lastCoordinate[0] ||
    lastSample.coordinate[1] !==
      lastCoordinate[1]
  ) {
    samples.push({
      coordinate: lastCoordinate,
      distanceKm: accumulatedDistance,
    });
  }

  return samples;
}

function getWeatherDescription(
  code: number | null
): string {
  if (code === null) {
    return "Unknown";
  }

  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";

  if (code >= 45 && code <= 48) {
    return "Fog";
  }

  if (code >= 51 && code <= 55) {
    return "Drizzle";
  }

  if (code >= 56 && code <= 57) {
    return "Freezing drizzle";
  }

  if (code >= 61 && code <= 65) {
    return "Rain";
  }

  if (code >= 66 && code <= 67) {
    return "Freezing rain";
  }

  if (code >= 71 && code <= 77) {
    return "Snow";
  }

  if (code >= 80 && code <= 82) {
    return "Rain showers";
  }

  if (code >= 85 && code <= 86) {
    return "Snow showers";
  }

  if (code >= 95) {
    return "Thunderstorm";
  }

  return "Unknown";
}

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      (await request.json()) as RouteWeatherRequest;

    if (
      !body?.geometry?.coordinates ||
      !Array.isArray(
        body.geometry.coordinates
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Valid route geometry is required.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(body.durationMinutes) ||
      body.durationMinutes <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Valid route duration is required.",
        },
        { status: 400 }
      );
    }

    const samples = sampleRoute(
      body.geometry.coordinates,
      2
    );

    if (samples.length === 0) {
      return NextResponse.json(
        {
          error:
            "Unable to sample route geometry.",
        },
        { status: 400 }
      );
    }

    const latitudes = samples.map(
      (sample) => sample.coordinate[1]
    );

    const longitudes = samples.map(
      (sample) => sample.coordinate[0]
    );

    const weatherUrl = new URL(
      "https://api.open-meteo.com/v1/forecast"
    );

    weatherUrl.searchParams.set(
      "latitude",
      latitudes.join(",")
    );

    weatherUrl.searchParams.set(
      "longitude",
      longitudes.join(",")
    );

    weatherUrl.searchParams.set(
      "timezone",
      "auto"
    );

    weatherUrl.searchParams.set(
      "forecast_days",
      "3"
    );

    weatherUrl.searchParams.set(
      "hourly",
      [
        "temperature_2m",
        "relative_humidity_2m",
        "precipitation_probability",
        "precipitation",
        "rain",
        "showers",
        "weather_code",
        "cloud_cover",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
      ].join(",")
    );

    const response = await fetch(
      weatherUrl.toString(),
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        `Open-Meteo returned HTTP ${response.status}.`
      );
    }

    const weatherData =
      await response.json();

    const weatherLocations =
      Array.isArray(weatherData)
        ? weatherData
        : [weatherData];

    /*
     * Use the provider's local current time.
     *
     * This avoids comparing:
     *
     * UTC current time
     * against
     * Asia/Kolkata forecast time.
     */

    const firstWeather =
      weatherLocations[0];

    const currentTime =
      firstWeather?.current?.time;

    const now =
      currentTime
        ? new Date(
            `${currentTime}:00`
          )
        : new Date();

    const totalDistanceKm =
      samples[samples.length - 1]
        ?.distanceKm ?? 0;

    const routeWeather =
      samples.map((sample, index) => {
        const progress =
          totalDistanceKm > 0
            ? sample.distanceKm /
              totalDistanceKm
            : 0;

        const arrivalMinutes =
          progress *
          body.durationMinutes;

        const arrivalTime =
          new Date(
            now.getTime() +
              arrivalMinutes *
                60 *
                1000
          );

        const weather =
          weatherLocations[index];

        if (!weather?.hourly) {
          return {
            index,
            latitude:
              sample.coordinate[1],
            longitude:
              sample.coordinate[0],
            distanceKm:
              Number(
                sample.distanceKm.toFixed(2)
              ),
            arrivalMinutes:
              Number(
                arrivalMinutes.toFixed(1)
              ),
            arrivalTime:
              arrivalTime.toISOString(),
            weather: null,
          };
        }

        const hourly =
          weather.hourly;

        const times =
          hourly.time ?? [];

        let closestIndex = 0;
        let closestDifference =
          Infinity;

        for (
          let i = 0;
          i < times.length;
          i++
        ) {
          /*
           * Open-Meteo gives local time strings.
           * We compare the same local clock representation.
           */
          const forecastTime =
            new Date(
              `${times[i]}:00`
            );

          const difference =
            Math.abs(
              forecastTime.getTime() -
                arrivalTime.getTime()
            );

          if (
            difference <
            closestDifference
          ) {
            closestDifference =
              difference;
            closestIndex = i;
          }
        }

        const weatherCode =
          hourly.weather_code?.[
            closestIndex
          ] ?? null;

        return {
          index,

          latitude:
            sample.coordinate[1],

          longitude:
            sample.coordinate[0],

          distanceKm:
            Number(
              sample.distanceKm.toFixed(2)
            ),

          arrivalMinutes:
            Number(
              arrivalMinutes.toFixed(1)
            ),

          arrivalTime:
            arrivalTime.toISOString(),

          forecastTime:
            times[closestIndex] ?? null,

          weather: {
            temperature:
              hourly.temperature_2m?.[
                closestIndex
              ] ?? null,

            humidity:
              hourly.relative_humidity_2m?.[
                closestIndex
              ] ?? null,

            precipitationProbability:
              hourly
                .precipitation_probability?.[
                closestIndex
              ] ?? null,

            precipitation:
              hourly.precipitation?.[
                closestIndex
              ] ?? null,

            rain:
              hourly.rain?.[
                closestIndex
              ] ?? null,

            showers:
              hourly.showers?.[
                closestIndex
              ] ?? null,

            weatherCode,

            weatherDescription:
              getWeatherDescription(
                weatherCode
              ),

            cloudCover:
              hourly.cloud_cover?.[
                closestIndex
              ] ?? null,

            windSpeed:
              hourly.wind_speed_10m?.[
                closestIndex
              ] ?? null,

            windDirection:
              hourly.wind_direction_10m?.[
                closestIndex
              ] ?? null,

            windGusts:
              hourly.wind_gusts_10m?.[
                closestIndex
              ] ?? null,
          },

          units:
            weather.hourly_units ??
            null,
        };
      });

    return NextResponse.json({
      source: "Open-Meteo",

      timezone:
        firstWeather?.timezone ??
        null,

      route: {
        durationMinutes:
          body.durationMinutes,

        sampleIntervalKm: 2,

        sampleCount:
          samples.length,
      },

      points: routeWeather,
    });
  } catch (error) {
    console.error(
      "Route weather error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to retrieve route weather.",
      },
      { status: 500 }
    );
  }
}