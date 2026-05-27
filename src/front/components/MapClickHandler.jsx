import { useMapEvents } from "react-leaflet";

export default function MapClickHandler({
    onMapClick
}) {

    useMapEvents({
        click(e){

            onMapClick({
                latitude:e.latlng.lat,
                longitude:e.latlng.lng
            });

        }
    });

    return null;
}