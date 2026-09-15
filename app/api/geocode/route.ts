import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json(
      { error: "Missing location query" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": "rainsick-weather-app/1.0",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Geocoding service failed" },
        { status: response.status }
      );
    }

    const data = await response.json();

    const locations = data.map(
      (location: {
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
      }) => ({
        id: location.place_id,
        name: location.display_name,
        latitude: Number(location.lat),
        longitude: Number(location.lon),
      })
    );

    return NextResponse.json(locations);
  } catch {
    return NextResponse.json(
      { error: "Unable to search for location" },
      { status: 500 }
    );
  }
}