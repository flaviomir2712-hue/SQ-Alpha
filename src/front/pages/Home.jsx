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
export const Home = () => {
	return (
		<div className="home-page">
			<Mapview />
		</div>
	);
};