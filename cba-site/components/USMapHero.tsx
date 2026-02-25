"use client";

import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const R = 20; // logo circle radius in SVG units

const TEAMS = [
  {
    id: 1, name: 'Space Cowboys',
    logo: 'https://i.imgur.com/nguVo08.png',
    coordinates: [-95.63, 29.62] as [number, number],
    dx: -55, dy: -30,
  },
  {
    id: 2, name: 'Chinook',
    logo: 'https://i.imgur.com/8iNLFJK.png',
    coordinates: [-122.68, 45.52] as [number, number],
    dx: 45, dy: -28,
  },
  {
    id: 3, name: 'Pepperoni Rolls',
    logo: 'https://i.pinimg.com/originals/83/99/28/839928316e524f7df9f543702aa96e1e.png',
    coordinates: [-81.63, 38.35] as [number, number],
    dx: -55, dy: -22,
  },
  {
    id: 4, name: 'Mega Rats',
    logo: 'https://i.imgur.com/H2nbUd4.jpg',
    coordinates: [-73.99, 40.75] as [number, number],
    dx: 50, dy: 10,
  },
  {
    id: 6, name: 'Emus',
    logo: 'https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/91042200-9a25-11f0-b1c3-bf61c28fbeb9',
    coordinates: [-75.60, 38.36] as [number, number],
    dx: 55, dy: 38,
  },
  {
    id: 7, name: 'Sky Chiefs',
    logo: 'https://1000logos.net/wp-content/uploads/2018/08/Syracuse-Chiefs-Logo-1997.png',
    coordinates: [-76.15, 43.05] as [number, number],
    dx: 10, dy: -52,
  },
  {
    id: 8, name: 'Whistlepigs',
    logo: 'https://i.pinimg.com/564x/4e/2e/88/4e2e880d6aa675473a8d3eb73b2064f1.jpg',
    coordinates: [-73.62, 42.35] as [number, number],
    dx: 55, dy: -22,
  },
  {
    id: 9, name: 'Fuzzy Bottoms',
    logo: 'https://i.postimg.cc/sgycxWDX/North-Georgia-3.png',
    coordinates: [-83.82, 34.30] as [number, number],
    dx: -55, dy: 30,
  },
  {
    id: 10, name: 'Banshees',
    logo: 'https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/bc893190-2775-11f0-bf52-473646e3de99',
    coordinates: [-82.19, 36.60] as [number, number],
    dx: -55, dy: 8,
  },
  {
    id: 11, name: 'Folksy Ferrets',
    logo: 'https://i.imgur.com/cNtQjIA.png',
    coordinates: [-76.75, 39.11] as [number, number],
    dx: -55, dy: 16,
  },
];

export default function USMapHero() {
  return (
    <div className="bg-blue-950 text-white overflow-hidden">
      <div className="pt-20">
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 880 }}
        width={800}
        height={480}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#1e3a8a"
                stroke="#3b82f6"
                strokeWidth={0.5}
              />
            ))
          }
        </Geographies>

        {TEAMS.map(({ id, name, logo, coordinates, dx, dy }) => {
          const clipId = `clip-team-${id}`;
          return (
            <Marker key={id} coordinates={coordinates}>
              <defs>
                <clipPath id={clipId}>
                  <circle cx={dx} cy={dy} r={R} />
                </clipPath>
              </defs>

              {/* Leader line from city star to logo */}
              <line
                x1={0} y1={0}
                x2={dx} y2={dy}
                stroke="rgba(255,255,255,0.45)"
                strokeWidth={1}
              />

              {/* City star */}
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={14}
                fill="#fbbf24"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                ★
              </text>

              {/* Circular team logo — clickable */}
              <a href={`/teams/${id}`} style={{ cursor: 'pointer' }}>
                <title>{name}</title>
                <image
                  href={logo}
                  x={dx - R}
                  y={dy - R}
                  width={R * 2}
                  height={R * 2}
                  clipPath={`url(#${clipId})`}
                  preserveAspectRatio="xMidYMid slice"
                />
                <circle
                  cx={dx}
                  cy={dy}
                  r={R}
                  fill="none"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={1.5}
                />
              </a>
            </Marker>
          );
        })}
      </ComposableMap>
      </div>
    </div>
  );
}
