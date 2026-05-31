import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
	Container,
	Card,
	Form,
	Button,
} from "react-bootstrap";
import { FiMail, FiLock, FiLogIn } from "react-icons/fi";

// Style coherent avec Friends / Profile / EventModal (dark mode, accents indigo)
const AUTH_CSS = `
.sq-auth-wrap {
	min-height: calc(100vh - 56px);
	display: flex;
	align-items: center;
	justify-content: center;
	background: radial-gradient(circle at top, #1a1d29 0%, #0b0d13 70%);
	padding: 4rem 1rem 2rem;
}
.sq-auth-card {
	background: #161922;
	color: #e9ecef;
	border: 1px solid #262a36;
	border-radius: 14px;
	max-width: 420px;
	width: 100%;
	box-shadow: 0 10px 40px rgba(0,0,0,0.4);
}
.sq-auth-card .form-control,
.sq-auth-card .form-control:focus {
	background-color: #0f111a !important;
	color: #e9ecef !important;
	border-color: #2a2f42 !important;
	box-shadow: none;
}
.sq-auth-card .form-control::placeholder { color: #6c757d; }
.sq-auth-card .form-label {
	color: #adb5bd;
	font-size: 0.78rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	margin-bottom: 0.35rem;
}
.sq-auth-title {
	font-weight: 700;
	background: linear-gradient(135deg, #6366f1, #ec4899);
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
	background-clip: text;
}
.sq-auth-submit {
	background: linear-gradient(135deg, #6366f1, #4f46e5);
	border: none;
	font-weight: 600;
}
.sq-auth-submit:hover,
.sq-auth-submit:focus {
	background: linear-gradient(135deg, #4f46e5, #4338ca);
}
.sq-auth-link {
	color: #6366f1;
	text-decoration: none;
	font-weight: 600;
}
.sq-auth-link:hover { color: #ec4899; }
`;

export const Login = () => {
	const navigate = useNavigate();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	const handleLogin = async (e) => {
		e.preventDefault();

		try {
			const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/login`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email,
					password,
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				alert(data.msg || "Login error");
				return;
			}

			localStorage.setItem("token", data.token);
			localStorage.setItem("user", JSON.stringify(data.user));

			alert("Login successful");
			navigate("/");

		} catch (error) {
			console.error("Login error:", error);
			alert("Server error");
		}
	};

	return (
		<>
			<style>{AUTH_CSS}</style>

			<div className="sq-auth-wrap">
				<Container className="d-flex justify-content-center">
					<Card className="sq-auth-card p-4">
						<h2 className="sq-auth-title text-center mb-1">SQ</h2>
						<p className="text-center text-secondary mb-4">Login</p>

						<Form onSubmit={handleLogin}>
							<Form.Group className="mb-3">
								<Form.Label>
									<FiMail className="me-2" /> Email
								</Form.Label>
								<Form.Control
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="Enter email"
								/>
							</Form.Group>

							<Form.Group className="mb-4">
								<Form.Label>
									<FiLock className="me-2" /> Password
								</Form.Label>
								<Form.Control
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="Enter password"
								/>
							</Form.Group>

							<Button type="submit" className="sq-auth-submit w-100 py-2">
								<FiLogIn className="me-2" /> Login
							</Button>
						</Form>

						<div className="text-center mt-4 text-secondary small">
							No tienes cuenta ?{" "}
							<Link to="/register" className="sq-auth-link">
								Crear cuenta
							</Link>
						</div>
					</Card>
				</Container>
			</div>
		</>
	);
};
