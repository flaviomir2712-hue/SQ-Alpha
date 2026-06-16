import { Mapview } from "../components/Mapview";

// Home is a thin wrapper that renders the fullscreen map.
//
// Navbar (top) and BottomNavbar (pill) are owned by Layout.jsx and
// rendered around every page, so we MUST NOT re-mount them here —
// doing so used to produce duplicate navbars stacked over each other.
//
// EventModal lifecycle (marker click → view, map click → create) is
// owned internally by <Mapview/>, so we do not render any EventCard
// or EventModal here either; that previously caused the modal to
// open twice on every marker click.
//
// SEMÁNTICA / SEO: el mapa por sí solo no es scrapable por Google,
// así que añadimos un <h1> invisible (.visually-hidden = Bootstrap)
// para que el crawler tenga un título de página claro. Los lectores
// de pantalla lo leen también ("estás en la página principal — mapa
// de eventos cerca de ti"). El usuario vidente no lo ve.
export const Home = () => {
	return (
		<div className="home-page">
			<h1 className="visually-hidden">
				SideQuest — Map of events near you
			</h1>
			<Mapview />
		</div>
	);
};
