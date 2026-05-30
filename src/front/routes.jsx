// Import necessary components and functions from react-router-dom.

import {
	createBrowserRouter,
	createRoutesFromElements,
	Route,
} from "react-router-dom";

import { Layout } from "./pages/Layout";
import { Home } from "./pages/Home";
import { Single } from "./pages/Single";
import { Demo } from "./pages/Demo";
import { Register } from "./pages/Register";
import { Login } from "./pages/Login";
import { Friends } from "./pages/Friends";
import { FriendProfile } from "./pages/FriendProfile";
import { EventsList } from "./pages/EventsList";
import Map from "./pages/Map";

export const router = createBrowserRouter(
	createRoutesFromElements(

		// Root Route
		<Route
			path="/"
			element={<Layout />}
			errorElement={<h1>Not found!</h1>}
		>

			{/* Home */}
			<Route path="/" element={<Home />} />

			{/* Demo */}
			<Route path="/demo" element={<Demo />} />

			{/* Single */}
			<Route path="/single/:theId" element={<Single />} />

			{/* Register */}
			<Route path="/register" element={<Register />} />

			<Route path="/login" element={<Login />} />

			{/* Friends */}
			<Route path="/friends" element={<Friends />} />

			<Route path="/friends/:userId" element={<FriendProfile />} />

			{/* Events */}
			<Route path="/events" element={<EventsList />} />

			<Route path="/map" element={<Map />} />
		</Route>
	)
);