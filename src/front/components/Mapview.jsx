import React, { useState } from "react";

import {
    MapContainer,
    TileLayer,
    Marker
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

import { createMarkerAvatar } from "./MarkerAvatar";

import MapClickHandler from "./MapClickHandler";

const DEFAULT_CENTER=[40.4168,-3.7038];

export const Mapview=({
    events=[],
    setSelectedEvent,
    center,
    setCreateEventData
})=>{

    const [tempPosition,setTempPosition]=useState(null);

    const mapCenter=
        center ||
        (events.length>0 &&
        events[0].position)
        || DEFAULT_CENTER;

    return(

        <div className="map-wrapper">

            <MapContainer
                center={mapCenter}
                zoom={13}
                className="map-container"
            >

                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="OpenStreetMap"
                />

                <MapClickHandler
                    onMapClick={(coords)=>{

                        setTempPosition([
                            coords.latitude,
                            coords.longitude
                        ]);

                        setCreateEventData({
                            latitude:coords.latitude,
                            longitude:coords.longitude
                        });

                    }}
                />

                {tempPosition && (

                    <Marker
                        position={tempPosition}
                    />

                )}

                {events.map((event)=>(

                    <Marker
                        key={event.id}
                        position={event.position}
                        icon={
                            createMarkerAvatar(
                                event.image
                            )
                        }
                        eventHandlers={{

                            click:()=>{

                                setSelectedEvent(
                                    event
                                );

                            }

                        }}
                    />

                ))}

            </MapContainer>

        </div>

    );

};

export default Mapview;