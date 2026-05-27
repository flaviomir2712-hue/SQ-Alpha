import { useState, useEffect } from "react";

import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";

const API_URL =
	import.meta.env.VITE_BACKEND_URL + "/api";
export default function EventCard({

	eventData = {},
	show,
	handleClose,
	refreshEvents

}) {
	const token = localStorage.getItem("token");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [date, setDate] = useState("");
	const [time, setTime] = useState("");

	const [address, setAddress] = useState("");

	const [latitude, setLatitude] = useState(
		eventData?.latitude ?? null
	);

	const [longitude, setLongitude] = useState(
		eventData?.longitude ?? null
	);

	const [friends, setFriends] = useState([]);

	const [selectedFriends, setSelectedFriends] =
		useState([]);

	const [loading, setLoading] =
		useState(false);

	const [error, setError] =
		useState("");



	useEffect(() => {

		setLatitude(
			eventData?.latitude ?? null
		);

		setLongitude(
			eventData?.longitude ?? null
		);

	}, [eventData]);


	useEffect(() => {

		if (
			show &&
			token
		) {

			loadFriends();

		}

	}, [
		show,
		token
	]);



	async function loadFriends() {

		try {

			const response =
				await fetch(

					`${API_URL}/friends`,

					{

						headers: {

							Authorization:
								`Bearer ${token}`

						}

					}

				);

			const data =
				await response.json();

			if (response.ok) {

				setFriends(
					data
				);

			}

		}
		catch {

			console.log(
				"Could not load friends"
			);

		}

	}



	async function geocodeAddress() {

		const hasCoordinates = (

			latitude !== null &&
			longitude !== null

		);

		if (hasCoordinates) {

			return {

				latitude,
				longitude

			};

		}

		if (
			!address.trim()
		) {

			setError(
				"Please enter an address"
			);

			return null;

		}

		try {

			setLoading(
				true
			);

			const response =
				await fetch(

					`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`

				);

			const data =
				await response.json();

			if (
				data.length === 0
			) {

				setError(
					"Address not found"
				);

				return null;

			}

			const lat =
				parseFloat(
					data[0].lat
				);

			const lon =
				parseFloat(
					data[0].lon
				);

			setLatitude(
				lat
			);

			setLongitude(
				lon
			);

			return {

				latitude: lat,
				longitude: lon

			};

		}
		catch {

			setError(
				"Location service unavailable"
			);

			return null;

		}
		finally {

			setLoading(
				false
			);

		}

	}



	async function createEvent() {

		setError("");

		if (
			!title ||
			!date ||
			!time
		) {

			setError(
				"Please fill required fields"
			);

			return;

		}

		const location =
			await geocodeAddress();

		if (
			!location
		) {

			return;

		}

		try {

			setLoading(
				true
			);

			const response =
				await fetch(

					`${API_URL}/events`,

					{

						method: "POST",

						headers: {

							"Content-Type":
								"application/json",

							Authorization:
								`Bearer ${token}`

						},

						body: JSON.stringify({

							title,
							description,
							date,
							time,

							latitude:
								location.latitude,

							longitude:
								location.longitude,

							invited_friends:
								selectedFriends

						})

					}

				);

			const data =
				await response.json();

			if (
				!response.ok
			) {

				setError(

					data.msg ||
					"Could not create event"

				);

				return;

			}

			if (
				refreshEvents
			) {

				await refreshEvents();

			}

			resetForm();

			handleClose();

		}
		catch {

			setError(
				"Server error"
			);

		}
		finally {

			setLoading(
				false
			);

		}

	}



	function resetForm() {

		setTitle("");
		setDescription("");
		setDate("");
		setTime("");

		setAddress("");

		setSelectedFriends([]);

		setLatitude(
			null
		);

		setLongitude(
			null
		);

		setError("");

	}

	

	return (

		<Modal
			show={show}
			onHide={() => {
				resetForm();
				handleClose();
			}}
			centered
		>

			<Modal.Header closeButton>

				<Modal.Title>

					Create Event

				</Modal.Title>

			</Modal.Header>

			<Modal.Body>

				<Form.Control
					placeholder="Title *"
					value={title}
					onChange={(e) =>
						setTitle(
							e.target.value
						)}
				/>

				<br />

				<Form.Control
					placeholder="Description"
					value={description}
					onChange={(e) =>
						setDescription(
							e.target.value
						)}
				/>

				<br />

				<Form.Control
					type="date"
					value={date}
					onChange={(e) =>
						setDate(
							e.target.value
						)}
				/>

				<br />

				<Form.Control
					type="time"
					value={time}
					onChange={(e) =>
						setTime(
							e.target.value
						)}
				/>

				<br />

				{

					latitude === null && (

						<>

							<Form.Control
								placeholder="Exact address"
								value={address}
								onChange={(e) =>
									setAddress(
										e.target.value
									)}
							/>

							<br />

						</>

					)

				}

				{

					latitude !== null && (

						<div>

							<p>

								Latitude:
								{latitude}

							</p>

							<p>

								Longitude:
								{longitude}

							</p>

						</div>

					)

				}


				<h6>

					Invite friends

				</h6>

				{

					friends.length === 0 ?

						<p>

							No friends available

						</p>

						:

						friends.map(

							friend => (

								<div
									key={
										friend.id
									}
								>

									<input

										type="checkbox"

										checked={

											selectedFriends.includes(
												friend.id
											)

										}

										onChange={(e) => {

											if (
												e.target.checked
											) {

												setSelectedFriends(

													prev => [
														...prev,
														friend.id
													]

												);

											}
											else {

												setSelectedFriends(

													prev =>

														prev.filter(

															id =>

																id !== friend.id

														)

												);

											}

										}}

									/>

									{" "}
									{friend.email}

								</div>

							)

						)

				}


				{

					error && (

						<p
							style={{
								color: "red"
							}}
						>

							{error}

						</p>

					)

				}

			</Modal.Body>

			<Modal.Footer>

				<Button

					onClick={
						createEvent
					}

					disabled={
						loading
					}

				>

					{

						loading

							?

							"Loading..."

							:

							"Create"

					}

				</Button>

			</Modal.Footer>

		</Modal>

	);

}