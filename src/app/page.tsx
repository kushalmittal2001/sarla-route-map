'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import RouteForm from '@/components/RouteForm';

interface Location {
  name: string;
  lat: number;
  lng: number;
}

// Dynamically import Map component to avoid SSR issues with mapbox-gl
const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
});

export default function Home() {
  const [fromLocation, setFromLocation] = useState<Location | null>(null);
  const [toLocation, setToLocation] = useState<Location | null>(null);

  const handleLocationSelect = (from: Location | null, to: Location | null) => {
    setFromLocation(from);
    setToLocation(to);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <Map fromLocation={fromLocation} toLocation={toLocation} />
      <RouteForm onLocationSelect={handleLocationSelect} />
    </main>
  );
}
