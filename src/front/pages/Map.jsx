import React from "react";
import { Container } from "react-bootstrap";
import { Mapview } from "../components/Mapview";
import "./map.css";

// Thin wrapper around <Mapview/>. Mapview owns the events fetch, the
// geolocation watcher and the EventModal lifecycle (open/close, create
// vs. view mode, prefill from a map click, etc.), so this page only
// has to mount it.
//
// IMPORTANT: do NOT render <EventModal/> here as well. Mapview already
// mounts its own modal — duplicating it (and the modalOpen/activeEventId
// state) caused the modal to open twice on every marker click, because
// Mapview.handleMarkerClick both opens its internal modal AND invokes
// the onMarkerClick callback, which then re-opened a second modal here.
const Map = () => {
  return (
    <Container fluid className="map-page p-0">
      <Mapview />
    </Container>
  );
};

export default Map;
