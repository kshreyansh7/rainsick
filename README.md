from pathlib import Path

readme = """# rainsick

**Route-aware weather analysis for road journeys.**

rainsick is a web application that helps users understand the weather conditions they may encounter while travelling from one location to another. Instead of looking at weather for only the starting point or destination, rainsick checks weather conditions at multiple points along the selected driving route.

## What it does

- Search for a starting location and destination.
- Select the exact locations from search results.
- Generate a driving route on an interactive map.
- Check weather conditions at different points along the route.
- Match forecast conditions with the estimated arrival time at each checkpoint.
- Show temperature, rain probability, rainfall, wind and wind gusts.
- Highlight weather risk along the route.
- Provide a simple overall weather summary for the journey.

## Why rainsick?

Weather can change significantly during a road journey. A route that looks clear at the starting point may encounter rain or stronger winds several kilometres later.

rainsick is designed to make this information easier to see by combining the route and weather into one view.

## Current status

rainsick is currently a working prototype focused on route-aware weather analysis, with initial use around Gandhinagar and Gujarat.

The project is being developed further with the goal of improving forecasting accuracy, weather-risk detection and live weather awareness.

## Built with

- Next.js
- React
- TypeScript
- Tailwind CSS
- React Leaflet
- OpenStreetMap
- OSRM
- Open-Meteo

## Running locally

Clone the repository and install the dependencies:

```bash
git clone https://github.com/kshreyansh7/rainsick.git
cd rainsick
npm install
