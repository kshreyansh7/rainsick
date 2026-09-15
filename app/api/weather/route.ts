import { NextRequest, NextResponse } from "next/server";

type Coordinate = [number, number]; // [longitude, latitude]

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
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const y =
    2 *
    Math.atan2(
      Math.sqrt(x),
      Math.sqrt(1 - x)
    );

  return R * y;
}

function sampleRoute(
  coordinates: Coordinate[],
  intervalKm = 2
): {
  coordinate: Coordinate;
  distanceKm: number;
}[] {
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
    const previous = coordinates[i - 1];
    const current = coordinates[i];

    const segmentDistance =
      haversineDistanceKm(
        previous,
        current
      );

    accumulatedDistance += segmentDistance;

    if (
      accumulatedDistance >=
      nextSampleDistance
    ) {
      samples.push({
        coordinate: current,
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
    lastSample.coordinate !== lastCoordinate
  ) {
    samples.push({
      coordinate: lastCoordinate,
      distanceKm: accumulatedDistance,
    });
  }

  return samples;
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

    const coordinates =
      body.geometry.coordinates;

    // --------------------------------------------------
    // Sample the route every 2 km
    // --------------------------------------------------

    const samples = sampleRoute(
      coordinates,
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

    // --------------------------------------------------
    // Prepare coordinates for Open-Meteo
    //
    // Open-Meteo accepts multiple coordinates
    // in a single request.
    // --------------------------------------------------

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

    // --------------------------------------------------
    // Open-Meteo returns an array when multiple
    // coordinates are supplied.
    // --------------------------------------------------

    const weatherLocations =
      Array.isArray(weatherData)
        ? weatherData
        : [weatherData];

    // --------------------------------------------------
    // Current time
    // --------------------------------------------------

    const now = new Date();

    // --------------------------------------------------
    // Match each route sample to an estimated
    // arrival time.
    // --------------------------------------------------

    const routeWeather =
      samples.map((sample, index) => {
        const progress =
          accumulatedProgress(
            sample.distanceKm,
            samples[samples.length - 1]
              ?.distanceKm ?? 0
          );

        const arrivalMinutes =
          progress *
          body.durationMinutes;

        const arrivalTime = new Date(
          now.getTime() +
            arrivalMinutes * 60 * 1000
        );

        const weather =
          weatherLocations[index];

        if (!weather?.hourly) {
          return {
            index,
            latitude: sample.coordinate[1],
            longitude: sample.coordinate[0],
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
          const forecastTime =
            new Date(times[i]);

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

        return {
          index,
          latitude: sample.coordinate[1],
          longitude: sample.coordinate[0],

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
            times[closestIndex],

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

            weatherCode:
              hourly.weather_code?.[
                closestIndex
              ] ?? null,

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
            weather.hourly_units ?? null,
        };
      });

    return NextResponse.json({
      source: "Open-Meteo",

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

function accumulatedProgress(
  distanceKm: number,
  totalDistanceKm: number
): number {
  if (
    totalDistanceKm <= 0
  ) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(
      0,
      distanceKm / totalDistanceKm
    )
  );
}