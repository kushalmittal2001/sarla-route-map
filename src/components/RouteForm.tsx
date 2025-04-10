'use client';

import React, { useState, useRef, useEffect } from 'react';

// @ts-ignore
declare global {
  interface Window {
    google: any;
  }
}

interface Location {
  name: string;
  lat: number;
  lng: number;
}

interface RouteFormProps {
  onLocationSelect: (from: Location | null, to: Location | null) => void;
}

interface TimeComparison {
  flyingMinutes: number;
  cabMinutes: number;
  timeSaved: number;
}

export default function RouteForm({ onLocationSelect }: RouteFormProps) {
  const [fromLocation, setFromLocation] = useState<Location | null>(null);
  const [toLocation, setToLocation] = useState<Location | null>(null);
  const [timeComparison, setTimeComparison] = useState<TimeComparison | null>(null);
  const fromInputRef = useRef<HTMLDivElement>(null);
  const toInputRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [distance, setDistance] = useState<number>(0);
  const [flyingTime, setFlyingTime] = useState<number>(0);
  const [drivingTime, setDrivingTime] = useState<number>(0);

  // Calculate flying time (eVTOL speed of 250 km/h)
  const calculateFlyingTime = (from: Location, to: Location): { distance: number; flyingTime: number } => {
    const R = 6371; // Earth's radius in km
    const lat1 = (from.lat * Math.PI) / 180;
    const lat2 = (to.lat * Math.PI) / 180;
    const deltaLat = ((to.lat - from.lat) * Math.PI) / 180;
    const deltaLng = ((to.lng - from.lng) * Math.PI) / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = Math.round(R * c); // Distance in km

    const flyingSpeed = 250; // km/h for eVTOL
    const timeInHours = distance / flyingSpeed;
    return {
      distance,
      flyingTime: Math.round(timeInHours * 60) // Convert to minutes
    };
  };

  // Calculate cab time using Google Maps Distance Matrix Service
  const calculateCabTime = async (from: Location, to: Location): Promise<number | null> => {
    if (!window.google) return null;

    const service = new window.google.maps.DistanceMatrixService();
    const origin = new window.google.maps.LatLng(from.lat, from.lng);
    const destination = new window.google.maps.LatLng(to.lat, to.lng);

    try {
      const response = await service.getDistanceMatrix({
        origins: [origin],
        destinations: [destination],
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.METRIC,
      });

      if (response.rows[0].elements[0].status === 'OK') {
        const duration = response.rows[0].elements[0].duration;
        return Math.round(duration.value / 60); // Convert seconds to minutes
      }
    } catch (error) {
      console.error('Error calculating cab time:', error);
    }
    return null;
  };

  const updateTimeComparison = async (from: Location, to: Location) => {
    const { distance: calculatedDistance, flyingTime: calculatedFlyingTime } = calculateFlyingTime(from, to);
    const cabMinutes = await calculateCabTime(from, to);
    
    setDistance(calculatedDistance);
    setFlyingTime(calculatedFlyingTime);
    
    if (cabMinutes !== null) {
      setDrivingTime(cabMinutes);
      setTimeComparison({
        flyingMinutes: calculatedFlyingTime,
        cabMinutes,
        timeSaved: cabMinutes - calculatedFlyingTime
      });
    }
  };

  useEffect(() => {
    // Load Google Maps Places script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !fromInputRef.current || !toInputRef.current) return;

    const fromAutocomplete = new window.google.maps.places.Autocomplete(fromInputRef.current, {
      types: ['geocode', 'establishment'],
      componentRestrictions: { country: 'in' }
    });

    const toAutocomplete = new window.google.maps.places.Autocomplete(toInputRef.current, {
      types: ['geocode', 'establishment'],
      componentRestrictions: { country: 'in' }
    });

    fromAutocomplete.addListener('place_changed', async () => {
      const place = fromAutocomplete.getPlace();
      if (place.geometry) {
        const location = {
          name: place.formatted_address || place.name,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        setFromLocation(location);
        if (toLocation) {
          await updateTimeComparison(location, toLocation);
        } else {
          setTimeComparison(null);
          setDistance(0);
          setFlyingTime(0);
          setDrivingTime(0);
        }
        onLocationSelect(location, toLocation);
      }
    });

    toAutocomplete.addListener('place_changed', async () => {
      const place = toAutocomplete.getPlace();
      if (place.geometry) {
        const location = {
          name: place.formatted_address || place.name,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        setToLocation(location);
        if (fromLocation) {
          await updateTimeComparison(fromLocation, location);
        } else {
          setTimeComparison(null);
          setDistance(0);
          setFlyingTime(0);
          setDrivingTime(0);
        }
        onLocationSelect(fromLocation, location);
      }
    });

    // Clear comparison when component mounts
    setTimeComparison(null);

    return () => {
      window.google.maps.event.clearInstanceListeners(fromAutocomplete);
      window.google.maps.event.clearInstanceListeners(toAutocomplete);
    };
  }, [scriptLoaded, fromLocation, toLocation, onLocationSelect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromLocation || !toLocation) return;

    // TODO: Save route
    console.log('Route submitted:', { fromLocation, toLocation, timeComparison });
  };

  return (
    <div className="floating-container">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label htmlFor="from" className="block text-sm font-medium text-gray-200 mb-1">
              From
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-purple-400">
                  <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
                </svg>
              </div>
              <input
                type="text"
                ref={fromInputRef as any}
                id="from"
                placeholder="Enter starting location"
                className="w-full pl-10 pr-3 py-3 bg-gray-900/30 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all backdrop-blur-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="to" className="block text-sm font-medium text-gray-200 mb-1">
              To
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-purple-400">
                  <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
                </svg>
              </div>
              <input
                type="text"
                ref={toInputRef as any}
                id="to"
                placeholder="Enter destination"
                className="w-full pl-10 pr-3 py-3 bg-gray-900/30 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all backdrop-blur-sm"
              />
            </div>
          </div>
        </div>

        {fromLocation && toLocation && (
          <div className="bg-gray-900/30 backdrop-blur-sm rounded-xl p-4 space-y-3 border border-white/10">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-300">Distance</span>
              <span className="text-white font-medium">{distance} km</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-300">Flying Time</span>
                <div className="flex items-center gap-1 text-purple-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                  </svg>
                  <span>eVTOL</span>
                </div>
              </div>
              <span className="text-white font-medium">{flyingTime} min</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-300">Driving Time</span>
                <div className="flex items-center gap-1 text-red-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M6.5 3c-1.051 0-2.093.04-3.125.117A1.49 1.49 0 002 4.607V10.5h9V4.606c0-.771-.59-1.43-1.375-1.489A41.568 41.568 0 006.5 3zM2 12v2.5A1.5 1.5 0 003.5 16h.041a3 3 0 015.918 0h.791a.75.75 0 00.75-.75V12H2z" />
                    <path d="M6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM13.25 5a.75.75 0 00-.75.75v8.514a3.001 3.001 0 014.893 1.44c.37-.275.61-.719.61-1.22v-6.5a.75.75 0 00-.75-.75h-4z" />
                    <path d="M14.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                  </svg>
                  <span>Cab</span>
                </div>
              </div>
              <span className="text-white font-medium">{drivingTime} min</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 