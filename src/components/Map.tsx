'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Location {
  name: string;
  lat: number;
  lng: number;
}

interface MapProps {
  fromLocation?: Location | null;
  toLocation?: Location | null;
}

declare global {
  interface Window {
    google: {
      maps: {
        DirectionsService: new () => {
          route(request: {
            origin: { lat: number; lng: number };
            destination: { lat: number; lng: number };
            travelMode: string;
          }, callback: (response: any, status: string) => void): void;
        };
        TravelMode: {
          DRIVING: string;
        };
        LatLng: new (lat: number, lng: number) => { lat(): number; lng(): number };
      };
    };
  }
}

export default function Map({ fromLocation, toLocation }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const flightAnimationRef = useRef<number>(0);
  const evtolMarker = useRef<mapboxgl.Marker | null>(null);
  const start = useRef<number>(0);
  const evtolProgress = useRef<number>(0);
  const startTime = useRef<number>(Date.now());

  // Add eVTOL animation
  const animateEvtol = (timestamp: number) => {
    if (!map.current || !fromLocation || !toLocation) return;
    
    if (!start.current) start.current = timestamp;
    const progress = (timestamp - start.current) / 10000; // 10 seconds duration
    evtolProgress.current = progress % 1;

    // Get the current point along the curved path
    const t = evtolProgress.current;
    const midPoint = [
      (fromLocation.lng + toLocation.lng) / 2,
      (fromLocation.lat + toLocation.lat) / 2
    ];
    
    const distance = Math.sqrt(
      Math.pow(toLocation.lng - fromLocation.lng, 2) +
      Math.pow(toLocation.lat - fromLocation.lat, 2)
    );
    const curveHeight = distance * 0.15;

    // Calculate current position using the same bezier curve
    const currentLng = (1 - t) * (1 - t) * fromLocation.lng +
                      2 * (1 - t) * t * midPoint[0] +
                      t * t * toLocation.lng;
    const currentLat = (1 - t) * (1 - t) * fromLocation.lat +
                      2 * (1 - t) * t * (midPoint[1] + curveHeight) +
                      t * t * toLocation.lat;

    // Calculate bearing for rotation
    // Get the next point slightly ahead on the curve for more accurate bearing
    const nextT = Math.min(1, t + 0.01);
    const nextLng = (1 - nextT) * (1 - nextT) * fromLocation.lng +
                   2 * (1 - nextT) * nextT * midPoint[0] +
                   nextT * nextT * toLocation.lng;
    const nextLat = (1 - nextT) * (1 - nextT) * fromLocation.lat +
                   2 * (1 - nextT) * nextT * (midPoint[1] + curveHeight) +
                   nextT * nextT * toLocation.lat;

    const bearing = getBearing(
      [currentLng, currentLat],
      [nextLng, nextLat]
    );

    evtolMarker.current?.setLngLat([currentLng, currentLat])
      .setRotation(bearing);

    requestAnimationFrame(animateEvtol);
  };

  // Calculate bearing between two points
  const getBearing = (start: [number, number], end: [number, number]) => {
    const startLat = start[1] * Math.PI / 180;
    const startLng = start[0] * Math.PI / 180;
    const endLat = end[1] * Math.PI / 180;
    const endLng = end[0] * Math.PI / 180;

    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
              Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
    const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    return bearing;
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error('Mapbox token is not defined');
      return;
    }

    mapboxgl.accessToken = token;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [0, 20], // Start with a global view
      zoom: 2,
      pitch: 0,
      bearing: 0
    });

    // Create eVTOL marker element
    const el = document.createElement('div');
    el.className = 'evtol-marker';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.backgroundImage = 'url(/evtol.svg)';
    el.style.backgroundSize = 'contain';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.filter = 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.5))'; // Add glow effect

    // Create the marker
    evtolMarker.current = new mapboxgl.Marker({
      element: el,
      rotationAlignment: 'map'
    });

    // Add terrain and sky
    map.current.on('load', () => {
      // Initial zoom animation to India
      map.current?.flyTo({
        center: [78.9629, 20.5937], // Center of India
        zoom: 4,
        pitch: 45,
        bearing: 0,
        duration: 5000, // 5 seconds animation
        essential: true
      });

      const style = map.current?.getStyle();
      if (style && style.layers) {
        style.layers.forEach(layer => {
          if (
            layer.type === 'symbol' ||
            layer.id.includes('label') ||
            layer.id.includes('place') ||
            layer.id.includes('poi')
          ) {
            map.current?.removeLayer(layer.id);
          }
          
          if (layer.id.includes('road')) {
            map.current?.setPaintProperty(layer.id, 'line-color', '#ffffff');
            map.current?.setPaintProperty(layer.id, 'line-opacity', 0.1);
          }

          if (layer.id.includes('building')) {
            map.current?.setPaintProperty(layer.id, 'fill-color', '#ffffff');
            map.current?.setPaintProperty(layer.id, 'fill-opacity', 0.05);
          }
        });
      }

      map.current?.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
        'tileSize': 512,
        'maxzoom': 14
      });

      map.current?.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });

      map.current?.addLayer({
        'id': 'sky',
        'type': 'sky',
        'paint': {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15
        }
      });

      // Add subtle contour lines
      map.current?.addSource('contours', {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-terrain-v2'
      });

      map.current?.addLayer({
        'id': 'contours',
        'type': 'line',
        'source': 'contours',
        'source-layer': 'contour',
        'layout': {
          'line-join': 'round',
          'line-cap': 'round'
        },
        'paint': {
          'line-color': '#2d3747',
          'line-width': 1,
          'line-opacity': 0.15
        }
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, []);

  const animateFlightPath = (timestamp: number) => {
    if (!map.current) return;
    
    if (!start.current) start.current = timestamp;
    const progress = Math.min(1, (timestamp - start.current) / 5000); // 5 seconds duration for reveal
    
    if (map.current.getLayer('flight-route')) {
      // Create reveal effect by trimming the line
      map.current.setPaintProperty(
        'flight-route',
        'line-gradient',
        [
          'step',
          ['line-progress'],
          '#a855f7',  // Color for revealed part
          progress,   // Transition point
          'rgba(168, 85, 247, 0)'  // Transparent for unrevealed part
        ]
      );

      // Once animation is complete
      if (progress === 1) {
        // Set the entire line to be visible with solid color
        map.current.setPaintProperty(
          'flight-route',
          'line-gradient',
          ['interpolate', ['linear'], ['line-progress'], 0, '#a855f7', 1, '#a855f7']
        );
        if (flightAnimationRef.current) {
          cancelAnimationFrame(flightAnimationRef.current);
        }
        return;
      }
    }
    
    // Continue animation until complete
    flightAnimationRef.current = requestAnimationFrame(animateFlightPath);
  };

  const createFlightPath = (map: mapboxgl.Map, fromLocation: Location, toLocation: Location) => {
    // Calculate intermediate points for a curved path
    const midPoint = [
      (fromLocation.lng + toLocation.lng) / 2,
      (fromLocation.lat + toLocation.lat) / 2
    ];
    
    // Add some height to the midpoint for a curve
    const distance = Math.sqrt(
      Math.pow(toLocation.lng - fromLocation.lng, 2) +
      Math.pow(toLocation.lat - fromLocation.lat, 2)
    );
    
    const curveHeight = distance * 0.15; // Adjust curve height based on distance
    
    // Generate a curved path with more points for smoother animation
    const numPoints = 50;
    const coordinates = [];
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      // Quadratic bezier curve
      const lng = (1 - t) * (1 - t) * fromLocation.lng +
                 2 * (1 - t) * t * (midPoint[0]) +
                 t * t * toLocation.lng;
      const lat = (1 - t) * (1 - t) * fromLocation.lat +
                 2 * (1 - t) * t * (midPoint[1] + curveHeight) +
                 t * t * toLocation.lat;
      coordinates.push([lng, lat]);
    }

    if (map.getSource('flight-route')) {
      (map.getSource('flight-route') as mapboxgl.GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates
        }
      });
    } else {
      map.addSource('flight-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates
          }
        },
        lineMetrics: true  // Enable line-gradient
      });

      // Add a background track
      map.addLayer({
        id: 'flight-route-bg',
        type: 'line',
        source: 'flight-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#a855f7',
          'line-width': 4,
          'line-opacity': 0.2
        }
      }, 'point-markers');

      // Add the animated line on top
      map.addLayer({
        id: 'flight-route',
        type: 'line',
        source: 'flight-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#a855f7',
          'line-width': 4,
          'line-opacity': 1
        }
      }, 'point-markers');
    }

    // Reset start time and begin animation
    start.current = 0;
    if (flightAnimationRef.current) {
      cancelAnimationFrame(flightAnimationRef.current);
    }
    requestAnimationFrame(animateFlightPath);
  };

  const createCabRoute = (map: mapboxgl.Map, coordinates: number[][]) => {
    if (map.getSource('cab-route')) {
      (map.getSource('cab-route') as mapboxgl.GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      });
    } else {
      map.addSource('cab-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        }
      });

      // Single static cab route with reduced opacity
      map.addLayer({
        id: 'cab-route',
        type: 'line',
        source: 'cab-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ef4444',
          'line-width': 4,
          'line-opacity': 0.75
        }
      });
    }
  };

  // Update map when locations change
  useEffect(() => {
    if (!map.current || !fromLocation || !toLocation) return;

    // Remove existing markers and lines
    const markers = document.getElementsByClassName('mapboxgl-marker');
    while (markers.length > 0) {
      markers[0].remove();
    }

    // Create new eVTOL marker if it doesn't exist
    if (!evtolMarker.current) {
      const el = document.createElement('div');
      el.className = 'evtol-marker';
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.backgroundImage = 'url(/evtol.svg)';
      el.style.backgroundSize = 'contain';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.filter = 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.5))';

      evtolMarker.current = new mapboxgl.Marker({
        element: el,
        rotationAlignment: 'map',
        pitchAlignment: 'map'
      });
    }

    // Position and add eVTOL marker
    evtolMarker.current
      .setLngLat([fromLocation.lng, fromLocation.lat])
      .addTo(map.current);

    // Reset animation start time
    start.current = 0;

    // Start eVTOL animation
    requestAnimationFrame(animateEvtol);

    // Add circle markers for start and end points
    if (!map.current.getSource('point-markers')) {
      map.current.addSource('point-markers', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [fromLocation.lng, fromLocation.lat]
              },
              properties: { point: 'start' }
            },
            {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [toLocation.lng, toLocation.lat]
              },
              properties: { point: 'end' }
            }
          ]
        }
      });

      // Add circle layer for points
      map.current.addLayer({
        id: 'point-markers',
        type: 'circle',
        source: 'point-markers',
        paint: {
          'circle-radius': 4,
          'circle-color': '#a855f7',
          'circle-opacity': 0.8
        }
      });
    } else {
      // Update existing markers
      (map.current.getSource('point-markers') as mapboxgl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [fromLocation.lng, fromLocation.lat]
            },
            properties: { point: 'start' }
          },
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [toLocation.lng, toLocation.lat]
            },
            properties: { point: 'end' }
          }
        ]
      });
    }

    // Create the flight path with animation
    createFlightPath(map.current, fromLocation, toLocation);

    // Fetch and display cab route
    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: fromLocation.lat, lng: fromLocation.lng },
        destination: { lat: toLocation.lat, lng: toLocation.lng },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (response: any, status: string) => {
        if (status === 'OK' && response && map.current) {
          const route = response.routes[0];
          const coordinates = route.overview_path.map((point: { lat: () => number; lng: () => number }) => 
            [point.lng(), point.lat()]
          );
          createCabRoute(map.current, coordinates);
        }
      }
    );

    // Fit bounds to show both markers
    const bounds = new mapboxgl.LngLatBounds()
      .extend([fromLocation.lng, fromLocation.lat])
      .extend([toLocation.lng, toLocation.lat]);

    map.current.fitBounds(bounds, {
      padding: 50,
      pitch: 45
    });

    return () => {
      if (flightAnimationRef.current) {
        cancelAnimationFrame(flightAnimationRef.current);
      }
      if (evtolMarker.current) {
        evtolMarker.current.remove();
      }
    };
  }, [fromLocation, toLocation]);

  return (
    <>
      <style jsx global>{`
        .evtol-marker {
          transition: transform 0.1s ease-in-out;
        }
        .floating-container {
          position: absolute;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
          background: rgba(17, 24, 39, 0.8);
          backdrop-filter: blur(8px);
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          width: 90%;
          max-width: 600px;
        }
        .logo-container {
          position: absolute;
          top: 20px;
          left: 20px;
          z-index: 10;
          background: rgba(17, 24, 39, 0.8);
          backdrop-filter: blur(8px);
          border-radius: 12px;
          padding: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.1);
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .logo {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      `}</style>
      <div className="fixed inset-0 w-full h-full">
        <div className="logo-container">
          <img src="/jn-logo.png" alt="JN Logo" className="logo" />
        </div>
        <div ref={mapContainer} className="w-full h-full" />
      </div>
    </>
  );
} 