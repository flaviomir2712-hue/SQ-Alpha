import { useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Container, Card, Form, Button, Alert, Spinner } from "react-bootstrap";
import { FiLock, FiCheckCircle } from "react-icons/fi";
import logoSideQuest from "../assets/img/logoSideQuest.png";

// ════════════════════════════════════════════════════════════════
// ResetPassword — Tanda 7E (email-link flow, paso 2)
// ════════════════════════════════════════════════════════════════
//
// Destino del link que llega por email: /reset-password/<token>.
// El token va firmado por el backend (itsdangerous, caducidad 1 h);
// aquí el usuario elige la contraseña nueva y se confirma con
// POST /api/password-reset-confirm.
//
// Página PÚBLICA (sin sesión) — estilo idéntico a Login/Register.
// ════════════════════════════════════════════════════════════════

const AUTH_CSS = `
.sq-auth-wrap {
	min-height: 100vh;
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

export const ResetPassword = () => {
	// Tanda 7H — el token llega por query string (?token=...) porque los
	// tokens de itsdangerous llevan puntos y Vite no aplica el fallback
	// SPA a paths con "." (daba 404). Se acepta también el path param
	// legacy para emails enviados antes del cambio.
	const { token: tokenFromPath } = useParams();
	const [searchParams] = useSearchParams();
	const token = searchParams.get("token") || tokenFromPath || "";
	const navigate = useNavigate();

	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [done, setDone] = useState(false);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError("");

		if (password.length < 6) {
			setError("Password must be at least 6 characters.");
			return;
		}
		if (password !== confirm) {
			setError("Passwords don't match.");
			return;
		}

		setLoading(true);
		try {
			const res = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/api/password-reset-confirm`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ token, password }),
				}
			);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				setError(data.msg || "Could not reset your password.");
				return;
			}
			setDone(true);
		} catch (err) {
			console.error("Reset confirm error:", err);
			setError("Server error. Please try again later.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<style>{AUTH_CSS}</style>
			<div className="sq-auth-wrap">
				<Container className="d-flex justify-content-center">
					<Card className="sq-auth-card p-4">
						<h2 className="text-center mb-1">
							<img
								src={logoSideQuest}
								alt="SideQuest"
								style={{ filter: "brightness(0) invert(1)", height: "60px", width: "auto" }} />
						</h2>

						{done ? (
							<div className="text-center py-3">
								<FiCheckCircle size={44} color="#22c55e" className="mb-3" />
								<h5 className="mb-2">Password updated</h5>
								<p className="text-secondary mb-3">
									You can now log in with your new password.
								</p>
								<Button
									className="sq-auth-submit w-100 py-2"
									onClick={() => navigate("/login")}
								>
									Go to login
								</Button>
							</div>
						) : (
							<>
								<p className="text-center text-secondary mb-4">
									Choose a new password for your account.
								</p>

								{error && (
									<Alert variant="danger" onClose={() => setError("")} dismissible>
										{error}
									</Alert>
								)}

								<Form onSubmit={handleSubmit}>
									<Form.Group className="mb-3">
										<Form.Label>
											<FiLock className="me-2" /> New password
										</Form.Label>
										<Form.Control
											type="password"
											value={password}
											onChange={(e) => setPassword(e.target.value)}
											placeholder="Enter new password"
											required
											minLength={6}
											autoComplete="new-password"
										/>
									</Form.Group>

									<Form.Group className="mb-4">
										<Form.Label>
											<FiLock className="me-2" /> Confirm password
										</Form.Label>
										<Form.Control
											type="password"
											value={confirm}
											onChange={(e) => setConfirm(e.target.value)}
											placeholder="Re-enter new password"
											required
											minLength={6}
											autoComplete="new-password"
										/>
									</Form.Group>

									<Button
										type="submit"
										className="sq-auth-submit w-100 py-2"
										disabled={loading}
									>
										{loading ? (
											<><Spinner size="sm" animation="border" /> Updating...</>
										) : (
											"Update password"
										)}
									</Button>
								</Form>

								<div className="text-center mt-3 text-secondary small">
									Link expired?{" "}
									<Link to="/login" className="sq-auth-link">
										Request a new one from the login page
									</Link>
								</div>
							</>
						)}
					</Card>
				</Container>
			</div>
		</>
	);
};

export default ResetPassword;
