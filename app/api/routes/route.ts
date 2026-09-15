import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const fromLat = searchParams.get("fromLat");
  const fromLon = searchParams.get("fromLon");
  const toLat = searchParams.get("toLat");
  const toLon = searchParams.get("toLon");

  if (!fromLat || !fromLon || !toLat || !toLon) {
    return NextResponse.json(
      {
        error: "Missing route coordinates",
      },
      { status: 400 }
    );
  }

  try {
    const coordinates = `${fromLon},${fromLat};${toLon},${toLat}`;

    const url =
      `https://router.project-osrm.org/route/v1/driving/${coordinates}` +
      `?alternatives=true&steps=true&geometries=geojson&overview=full`;

    const response = await fetch(url);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Routing service failed",
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.code !== "Ok") {
      return NextResponse.json(
        {
          error: data.code || "No route found",
        },
        { status: 404 }
      );
    }

    const routes = data.routes.map(
      (
        route: {
          distance: number;
          duration: number;
          geometry: {
            type: string;
            coordinates: number[][];
          };
        },
        index: number
      ) => ({
        id: index + 1,
        distanceKm: Number((route.distance / 1000).toFixed(2)),
        durationMinutes: Math.round(route.duration / 60),
        geometry: route.geometry,
      })
    );

    return NextResponse.json({
      routes,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to calculate route",
      },
      { status: 500 }
    );
  }
}