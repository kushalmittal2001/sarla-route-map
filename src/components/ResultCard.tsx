'use client';

import React from 'react';

interface ResultCardProps {
  flyTime: number;
  cabTime: number;
}

export default function ResultCard({ flyTime, cabTime }: ResultCardProps) {
  const timeSaved = Math.abs(cabTime - flyTime);
  const isFaster = flyTime < cabTime;

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Route Comparison</h2>
      
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Flying Time:</span>
          <span className="font-semibold">{flyTime} minutes</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Cab Time:</span>
          <span className="font-semibold">{cabTime} minutes</span>
        </div>
        
        <div className="pt-4 border-t border-gray-200">
          <p className="text-lg font-semibold text-blue-600">
            {isFaster 
              ? `You'll save ${timeSaved} minutes flying with Sarla in 2027!`
              : `Cab is faster by ${timeSaved} minutes`}
          </p>
        </div>
      </div>
    </div>
  );
} 