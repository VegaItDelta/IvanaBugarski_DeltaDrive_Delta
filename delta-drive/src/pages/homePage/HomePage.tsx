import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Marker, MapContainer, TileLayer, Popup } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { AxiosResponse } from 'axios';
import { Box, Button, Grid, GridItem, Text as Info } from '@chakra-ui/react';
import L from 'leaflet';
import { HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { useQueryClient } from '@tanstack/react-query';

import { UserContext } from '@/contexts';
import { DefaultMarkerIcon, RedMarkerIcon, VehicleMarkerIcon, calculateDistance, initialAxiosResponse, useErrorToast, useSuccessToast } from '@/helpers';
import { useBookVehicleMutation, useGetAllVehiclesQuery } from '@/services';
import { BookVehicleType } from '@/types';

export const HomePage = () => {
  const [t] = useTranslation('common');
  const navigate = useNavigate();
  const destinationMarkerRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const [destination, setDestination] = useState({lat: 45.255930, lng: 19.846320});
  const [nearestAvailableVehicles, setNearestAvailableVehicles] = useState<any>();
  const [position, setPosition] = useState({ lat: 45.2428032, lng: 19.849218322071287 });
  const [currentLocationAddress, setCurrentLocationAddress] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [signalRConnection, setSignalRConnection] = useState<any>(null);
  const [connection, setConnection] = useState<any>(null);
  const { currentUser } = useContext(UserContext);
  const successToast = useSuccessToast();
  const errorToast = useErrorToast();
  const queryClient = useQueryClient();

  L.Marker.prototype.options.icon = DefaultMarkerIcon;
  const myAPIKey = 'b6618ad7359b4f779daeae7e35233c67';

  const { data: csvData = initialAxiosResponse, isLoading } = useGetAllVehiclesQuery();
  console.log(csvData);

  const { mutate: bookVehicle } = useBookVehicleMutation(queryClient, {
    onSuccess: (response?: AxiosResponse) => {
      successToast({ title: t('successfulBookVehicle', { response }) });
      console.log(response);
    },
    onError: (error: any) => {
      if (error === 'ERR_BAD_REQUEST') {
        errorToast({ title: t('driverRejectedRequest')});
      }
      errorToast({ title: t('unsuccessfulBookVehicle') });
    }
  });

  const getNearestAvailableVehicles = (destinationLatLng: any) => {
    const currentLatLng = { lat: position.lat, lng: position.lng };
    const availableVehicles = csvData?.data?.filter((c: any) => c.available === true);
    console.log(availableVehicles);
    if (availableVehicles) {
      const vehiclesWithDistances = availableVehicles?.map((vehicle: any) => {
        const distanceToCurrentLocation = calculateDistance(currentLatLng, {
          lat: parseFloat(vehicle.latitude),
          lng: parseFloat(vehicle.longitude),
        });
        const distanceToDestination = calculateDistance(
          { lat: parseFloat(vehicle.latitude), lng: parseFloat(vehicle.longitude) },
          destinationLatLng
        );
        const startPrice = parseFloat(vehicle.startPrice);
        const pricePerKM = parseFloat(vehicle.pricePerKM);
        const totalPrice = startPrice + (distanceToDestination / 1000) * pricePerKM;
        return { ...vehicle, distanceToCurrentLocation, distanceToDestination, totalPrice };
      });
      vehiclesWithDistances.sort((a: any, b: any) => a.distanceToCurrentLocation - b.distanceToCurrentLocation);
      const nearestVehicles = vehiclesWithDistances.slice(0, 10);
      setNearestAvailableVehicles(nearestVehicles);
      console.log(nearestAvailableVehicles);
    }
  };

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker !== null) {
          const markerPosition = marker.getLatLng();
          setPosition(markerPosition);
        }
      },
    }),
    [],
  );

  const destinationEventHandlers = useMemo(() => ({
    dragend() {
      const marker = destinationMarkerRef.current;
      if (marker !== null) {
        const destinationPosition = marker.getLatLng();
        setDestination(destinationPosition);
        getNearestAvailableVehicles(destinationPosition);
        const userLatLng = L.latLng(position.lat, position.lng);
        const destinationLatLng = L.latLng(destinationPosition.lat, destinationPosition.lng);
        const distance = userLatLng.distanceTo(destinationLatLng);
      }
    },
  }), [position]);

  useEffect(() => {
    if (position) {
      const reverseGeocodingUrl = `https://api.geoapify.com/v1/geocode/reverse?lat=${position.lat}&lon=${position.lng}&apiKey=${myAPIKey}`;
      fetch(reverseGeocodingUrl)
        .then((result) => result.json())
        .then((featureCollection) => {
          //console.log(featureCollection.features[0].properties);
        })
        .catch((reverseGeocodingError) => {
          console.error('Error in reverse geocoding:', reverseGeocodingError);
        });
    }
  }, [position, myAPIKey]);

  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (geoPosition) => {
          const { latitude, longitude } = geoPosition.coords;
          setPosition({ lat: latitude, lng: longitude });
        },
        (error) => {
          console.error(t('locationError'), error);
        }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      console.error(t('geolocationError'));
    }
  }, []);

  const handleBookVehicle = (bookVehicleValues: BookVehicleType) => {
    const payload = {
      id: bookVehicleValues.id,
      userId: bookVehicleValues.userId,
      startingLocation: bookVehicleValues.startingLocation,
      endingLocation: bookVehicleValues.endingLocation,
      totalPrice: bookVehicleValues.totalPrice,
      firstName: bookVehicleValues.firstName,
      lastName: bookVehicleValues.lastName
    };
    localStorage.setItem('driverId', bookVehicleValues.firstName + bookVehicleValues.lastName);
    bookVehicle(payload);
  };

  useEffect(() => {
    if (position) {
      const reverseGeocodingUrl = `https://api.geoapify.com/v1/geocode/reverse?lat=${position.lat}&lon=${position.lng}&apiKey=${myAPIKey}`;
      fetch(reverseGeocodingUrl)
        .then((result) => result.json())
        .then((featureCollection) => {
          const address = featureCollection.features[0]?.properties?.formatted || 'Address not found';
          setCurrentLocationAddress(address);
        })
        .catch((reverseGeocodingError) => {
          console.error('Error in reverse geocoding:', reverseGeocodingError);
        });
    }
  }, [position, myAPIKey]);

  useEffect(() => {
    if (destination) {
      const reverseGeocodingUrl = `https://api.geoapify.com/v1/geocode/reverse?lat=${destination.lat}&lon=${destination.lng}&apiKey=${myAPIKey}`;
      fetch(reverseGeocodingUrl)
        .then((result) => result.json())
        .then((featureCollection) => {
          const address = featureCollection.features[0]?.properties?.formatted || 'Address not found';
          setDestinationAddress(address);
        })
        .catch((reverseGeocodingError) => {
          console.error('Error in reverse geocoding:', reverseGeocodingError);
        });
    }
  }, [destination, myAPIKey]);

  // useEffect(() => {
  //   const newConnection = new HubConnectionBuilder()
  //     .withUrl('/signalRide')
  //     .build();
  //   newConnection.start().then(() => {
  //     console.log('SignalR Connected');
  //     setSignalRConnection(newConnection);
  //     setConnection(newConnection);
  //   }).catch((error: any) => console.error('Error starting SignalR connection:', error));
  //   return () => {
  //     if (newConnection && newConnection.state === HubConnectionState.Connected) {
  //       newConnection.stop().then(() => console.log('SignalR Connection Stopped'));
  //     }
  //   };
  // }, []);

  // useEffect(() => {
  //   if (signalRConnection) {
  //     signalRConnection.on('ReceiveLocationUpdate', (driverId: any, latitude: any, longitude: any) => {
  //       setPosition({ lat: latitude, lng: longitude });
  //       connection.invoke('UpdateDriverLocation', driverId, latitude, longitude)
  //         .catch((error: any) => console.error('Error updating driver location:', error));
  //     });
  //   }
  //   return () => {
  //     if (signalRConnection) {
  //       signalRConnection.off('ReceiveLocationUpdate');
  //     }
  //   };
  // }, [signalRConnection, connection]);

  return (
    <>
      {currentUser ? (
        <>
          <Info fontSize={'x-large'}>{t('homePageMessage')}</Info>
          <Box
            display='flex'
            alignItems='center'
            justifyContent='center'
            mt='5'
            mb='5'>
            <MapContainer
              id='chooseLocation'
              center={position}
              zoom={14}
              scrollWheelZoom={true}
              ref={mapRef}>
              <TileLayer
                attribution='&copy;
                <a href="https://www.openstreetmap.org/copyright">
                  OpenStreetMap
                </a> contributors'
                url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              />
              <Marker
                draggable={false}
                position={position}
                eventHandlers={eventHandlers}
                ref={markerRef}>
              </Marker>
              {destination && (
                <Marker
                  draggable={true}
                  position={destination}
                  eventHandlers={destinationEventHandlers}
                  ref={destinationMarkerRef}
                  icon={RedMarkerIcon}
                />
              )}
              {nearestAvailableVehicles &&
                nearestAvailableVehicles.map((data: any, index: number) => (
                  <Marker
                    key={index}
                    position={[parseFloat(data.latitude), parseFloat(data.longitude)]}
                    icon={VehicleMarkerIcon}>
                    <Popup>
                      <Box>
                        <Info>{t('brand')}: {data.brand}</Info>
                        <Info>{t('name')}: {data.firstName} {data.lastName}</Info>
                        <Info>{t('startPrice')}: {data.startPrice}</Info>
                        <Info>{t('pricePerKM')}: {data.pricePerKM}</Info>
                      </Box>
                    </Popup>
                  </Marker>
                ))}
            </MapContainer>
          </Box>
          <Grid templateColumns='repeat(3, 1fr)' gap={2} p={5} mb={5}>
            {!isLoading && nearestAvailableVehicles &&
              nearestAvailableVehicles?.slice(0, 10).map((vehicle: any, index: number) => (
                <GridItem
                  key={index}
                  bg='blue.300'
                  mb='5'
                  mt='5'
                  w='100%'
                  flex='center'
                  alignItems='center'
                  justifyContent='center'
                  height='full'
                  borderRadius='10'
                  textColor='white'>
                  <Box ml={3} fontSize={18}>
                    <Info>{t('brand')}: {vehicle.brand}</Info>
                    <Info>{t('driver')}: {vehicle.firstName} {vehicle.lastName}</Info>
                    <Info>{t('distanceFromPassenger')}: {vehicle.distanceToCurrentLocation} {'m'}</Info>
                    <Info>{t('startingPrice')}: {vehicle.startPrice}</Info>
                    <Info>{t('pricePerKM')}: {vehicle.pricePerKM}</Info>
                    <Info>{t('totalPrice')}: {vehicle.totalPrice} {t('eur')}</Info>
                  </Box>
                  <Button
                    type='button'
                    minW='100px'
                    size='lg'
                    top='15px'
                    textColor='white'
                    bg='blue.600'
                    _hover={{bg: 'blue.400'}}
                    ml={3}
                    mb={3}
                    cursor='pointer'
                    onClick={() =>
                      handleBookVehicle({
                        id: vehicle.id,
                        userId: currentUser.id,
                        startingLocation: currentLocationAddress,
                        endingLocation: destinationAddress,
                        totalPrice: JSON.stringify(vehicle.totalPrice),
                        firstName: vehicle.firstName,
                        lastName: vehicle.lastName
                      })}>
                    {t('bookVehicle')}
                  </Button>
                </GridItem>
              ))}
          </Grid>
        </>
      ) : (
        <Info fontSize='xxx-large' textColor='blue.800'>{t('welcomeToDeltaDrive')}</Info>
      )}
    </>
  );
};
