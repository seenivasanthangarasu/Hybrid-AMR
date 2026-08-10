import { createContext, useContext, useState } from 'react';

const MissionContext = createContext();

// Scaling note (spec REQ-14): this single context intentionally bundles
// destination + routeInfo + mapApi because every consumer today needs the
// mission goal. If a 4th unrelated piece of shared state is added (or a
// high-frequency value that would re-render all consumers on every tick),
// split it into a separate context/provider then rather than growing this one.
export function MissionProvider({ children }) {
  const [destination, setDestination] = useState({
    latitude: '',
    longitude: '',
    goalName: '',
  });

  const [routeInfo, setRouteInfo] = useState({
    distance: 0,
    eta: 0,
  });

  // Used by GpsMapView to expose map controls
  const [mapApi, setMapApi] = useState(null);

  return (
    <MissionContext.Provider
      value={{
        destination,
        setDestination,
        routeInfo,
        setRouteInfo,
        mapApi,
        setMapApi,
      }}
    >
      {children}
    </MissionContext.Provider>
  );
}

export function useMission() {
  return useContext(MissionContext);
}
