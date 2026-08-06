import { createContext, useContext, useState } from 'react';

const MissionContext = createContext();

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
