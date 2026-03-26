"use client";

import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const WORLD_GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";
const R = 20;    // CBA team logo circle radius
const R_AFF = 9; // minor league affiliate logo radius (star-sized)

// Minor league affiliates — small logo sits right at the city pin, no leader line
// zoom: how much to scale the image inside the clip (>1 crops in, useful when logo has whitespace padding)
// imgOffsetX/Y: nudge the zoomed image left/right/up/down within the circle (in SVG units)
const AFFILIATES = [
  {
    teamId: 9,
    name: 'Dahlonega Gold Diggers',
    logo: '/gold-diggers-primary.png',
    coordinates: [-83.99, 34.53] as [number, number],
    zoom: 1.0, imgOffsetX: 0, imgOffsetY: 0,
  },
  {
    teamId: 7,
    name: 'Lake Placid Puddle Jumpers',
    logo: '/puddle-jumpers-logo.png',
    coordinates: [-73.99, 44.28] as [number, number],
    zoom: 1.4, imgOffsetX: 0, imgOffsetY: 0,
  },
  {
    teamId: 1,
    name: 'Rocket City Mustangs',
    logo: '/mustangs-logo.png',
    coordinates: [-118.14, 34.15] as [number, number],
    zoom: 1.4, imgOffsetX: 0, imgOffsetY: 0,
  },
];

// Affiliates located outside the US (rendered on the NZ inset map)
const NZ_AFFILIATES = [
  {
    teamId: 6,
    name: 'Edoras Wild Ponies',
    logo: '/edoras-ponies-logo.jpeg',
    // Mount Sunday, Hakatere Conservation Park, Canterbury, NZ
    coordinates: [170.83, -43.62] as [number, number],
    zoom: 1.0, imgOffsetX: 0, imgOffsetY: 0,
  },
];

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
    coordinates: [-79.96, 39.63] as [number, number],
    dx: -55, dy: 20,
  },
  {
    id: 4, name: 'Mega Rats',
    logo: 'https://i.imgur.com/H2nbUd4.jpg',
    coordinates: [-73.99, 40.75] as [number, number],
    dx: 50, dy: -25,
  },
  {
    id: 6, name: 'Emus',
    logo: 'https://content.sportslogos.net/news/2017/08/jwzbfi703gbaujbpvfm5iqjg9.gif',
    coordinates: [-75.60, 38.36] as [number, number],
    dx: 55, dy: 62,
  },
  {
    id: 7, name: 'Sky Chiefs',
    logo: 'https://1000logos.net/wp-content/uploads/2018/08/Syracuse-Chiefs-Logo-1997.png',
    coordinates: [-76.15, 43.05] as [number, number],
    dx: -30, dy: -30,
  },
  {
    id: 8, name: 'Whistlepigs',
    logo: 'https://i.pinimg.com/564x/4e/2e/88/4e2e880d6aa675473a8d3eb73b2064f1.jpg',
    coordinates: [-80.82, 41.24] as [number, number],
    dx: -65, dy: -15,
  },
  {
    id: 9, name: 'Fuzzy Bottoms',
    logo: 'https://i.postimg.cc/sgycxWDX/North-Georgia-3.png',
    coordinates: [-83.82, 34.05] as [number, number],
    dx: -55, dy: 30,
  },
  {
    id: 10, name: 'Banshees',
    logo: '/banshees-logo.png',
    coordinates: [-72.95, 41.67] as [number, number],
    dx: 45, dy: -65,
  },
  {
    id: 11, name: 'Folksy Ferrets',
    logo: 'https://i.imgur.com/cNtQjIA.png',
    coordinates: [-76.75, 39.11] as [number, number],
    dx: 90, dy: 5,
  },
];

export default function USMapHero() {
  return (
    <div className="bg-blue-950 text-white overflow-hidden">
      <div className="pt-20">
      <div className="relative">
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 880 }}
        width={800}
        height={480}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: any[] }) =>
            geographies
              .filter(geo => Number(geo.id) !== 2) // filter out Alaska (FIPS 02)
              .map((geo) => (
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

        {/* Minor league affiliates — logo sits right at city pin, star-sized */}
        {AFFILIATES.map(({ teamId, name, logo, coordinates, zoom, imgOffsetX, imgOffsetY }) => {
          const clipId = `clip-affiliate-${teamId}`;
          const z = zoom ?? 1;
          const w = R_AFF * 2 * z;
          const h = R_AFF * 2 * z;
          return (
            <Marker key={`affiliate-${teamId}`} coordinates={coordinates}>
              <defs>
                <clipPath id={clipId}>
                  <circle cx={0} cy={0} r={R_AFF} />
                </clipPath>
              </defs>
              <a href={`/teams/${teamId}`} style={{ cursor: 'pointer' }}>
                <title>{name}</title>
                <image
                  href={logo}
                  x={-w / 2 + (imgOffsetX ?? 0)}
                  y={-h / 2 + (imgOffsetY ?? 0)}
                  width={w}
                  height={h}
                  clipPath={`url(#${clipId})`}
                  preserveAspectRatio="xMidYMid slice"
                />
                <circle
                  cx={0} cy={0}
                  r={R_AFF}
                  fill="none"
                  stroke="#C9A84C"
                  strokeWidth={1.5}
                />
              </a>
            </Marker>
          );
        })}
      </ComposableMap>

      {/* New Zealand outline — replaces Alaska inset (bottom-left) */}
      <div
        className="absolute left-0 pointer-events-none"
        style={{ width: '20%', paddingBottom: '16%', bottom: '4%', left: '-2%' }}
      >
        <div className="absolute inset-0">
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ center: [172, -41], scale: 480 }}
            width={200}
            height={170}
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            <Geographies geography={WORLD_GEO_URL}>
              {({ geographies }: { geographies: any[] }) =>
                geographies
                  .filter(geo => Number(geo.id) === 554) // New Zealand ISO 554
                  .map((geo) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill="#1e3a8a"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                    />
                  ))
              }
            </Geographies>
            {NZ_AFFILIATES.map(({ teamId, name, logo, coordinates, zoom, imgOffsetX, imgOffsetY }) => {
              const clipId = `clip-nz-affiliate-${teamId}`;
              const z = zoom ?? 1;
              const w = R_AFF * 2 * z;
              const h = R_AFF * 2 * z;
              return (
                <Marker key={`nz-affiliate-${teamId}`} coordinates={coordinates}>
                  <defs>
                    <clipPath id={clipId}>
                      <circle cx={0} cy={0} r={R_AFF} />
                    </clipPath>
                  </defs>
                  <a href={`/teams/${teamId}`} style={{ cursor: 'pointer', pointerEvents: 'auto' }}>
                    <title>{name}</title>
                    <image
                      href={logo}
                      x={-w / 2 + (imgOffsetX ?? 0)}
                      y={-h / 2 + (imgOffsetY ?? 0)}
                      width={w}
                      height={h}
                      clipPath={`url(#${clipId})`}
                      preserveAspectRatio="xMidYMid slice"
                    />
                    <circle
                      cx={0} cy={0}
                      r={R_AFF}
                      fill="none"
                      stroke="#C9A84C"
                      strokeWidth={1.5}
                    />
                  </a>
                </Marker>
              );
            })}
          </ComposableMap>
        </div>
      </div>

      </div>
      </div>
    </div>
  );
}
