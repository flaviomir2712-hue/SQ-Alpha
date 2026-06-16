import { useNavigate } from "react-router-dom";

export const Private = () => {

	const navigate = useNavigate();

	const user = JSON.parse(localStorage.getItem("user"));

	const handleLogout = () => {
		localStorage.removeItem("token");
		localStorage.removeItem("user");

		navigate("/login");
	};

	return (
		<div className="container mt-5">

			<h1>Private Page</h1>

			{/* RGPD: nunca mostramos el email. Usamos username
			    (siempre obligatorio en registro). */}
			<h3>Welcome @{user?.username || "user"}</h3>

			<p>You are logged in.</p>

			<button
				className="btn btn-danger mt-3"
				onClick={handleLogout}
			>
				Logout
			</button>

		</div>
	);
};