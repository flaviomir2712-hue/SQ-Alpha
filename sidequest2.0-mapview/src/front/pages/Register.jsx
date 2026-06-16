import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
	Container,
	Card,
	Form,
	Button,
	Alert,
	Spinner,
} from "react-bootstrap";
import { FiMail, FiLock, FiUserPlus, FiAtSign, FiCheckCircle } from "react-icons/fi";
import logoSideQuest from "../assets/img/logoSideQuest.png";
import { ResetPasswordModal } from "../components/ResetPasswordModal";

// Style coherent avec Friends / Profile / EventModal (dark mode, accents indigo).
const AUTH_CSS = `
.sq-auth-wrap {
	min-height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	background: radial-gradient(circle at top, #1a1d29 0%, #0b0d13 70%);
	padding: 2rem 1rem;
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

/* Tanda 4D — Checkbox de aceptación de Terms.
   Bootstrap pone el check en azul brand por defecto; lo
   sincronizamos con la paleta indigo de SideQuest para
   coherencia visual. */
.sq-auth-card .form-check-input {
	background-color: #0f111a;
	border: 1px solid #2a2f42;
	width: 1.1rem;
	height: 1.1rem;
	margin-top: 0.2rem;
}
.sq-auth-card .form-check-input:checked {
	background-color: #6366f1;
	border-color: #6366f1;
}
.sq-auth-card .form-check-input:focus {
	border-color: #6366f1;
	box-shadow: 0 0 0 0.15rem rgba(99,102,241,0.25);
}
.sq-auth-card .form-check-label {
	cursor: pointer;
	padding-left: 0.4rem;
	line-height: 1.4;
}

.sq-auth-hint {
	color: #6c757d;
	font-size: 0.72rem;
	margin-top: 0.25rem;
}
`;

export const Register = () => {
	const navigate = useNavigate();

	const [showReset, setShowReset] = useState(false);
	// Tanda 7E — tras crear la cuenta mostramos la pantalla "revisa tu
	// correo" (con el aviso de verificación) en vez de saltar a /login.
	const [registered, setRegistered] = useState(false);
	const [emailSent, setEmailSent] = useState(false);
	const [email, setEmail] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	// Tanda 4D — consentimiento explícito de Terms + Privacy.
	// Obligatorio por RGPD Art. 6.1.a (consent) y por buenas prácticas
	// de cumplimiento. El botón Register SIEMPRE es clickable; si el
	// usuario no ha marcado el checkbox al hacer click, mostramos un
	// alert claro (mejor UX que un botón disabled que el usuario no
	// sabe por qué no responde).
	const [acceptedTerms, setAcceptedTerms] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	// Helper: si el usuario marca el checkbox después de ver el error
	// de "accept terms", limpiamos el mensaje para que no se quede
	// estancado en pantalla.
	const handleAcceptTermsChange = (checked) => {
		setAcceptedTerms(checked);
		if (checked && error && error.toLowerCase().includes("terms")) {
			setError("");
		}
	};

	const handleRegister = async (e) => {
		e.preventDefault();
		setError("");

		// Validación de aceptación de Terms — el botón ya no está
		// disabled, así que esta es la única barrera antes del submit.
		// Si el usuario llega aquí sin marcar, mostramos un mensaje
		// explícito y hacemos scroll al Alert para que sea visible
		// (importante en móvil, donde el Alert puede caer fuera del
		// viewport si el usuario está al final del form).
		if (!acceptedTerms) {
			setError("Please accept the Terms of Service and Privacy Policy to register your account.");
			// Pequeño delay para que el Alert se renderice antes del scroll
			setTimeout(() => {
				const alertEl = document.querySelector(".sq-auth-card .alert");
				if (alertEl) alertEl.scrollIntoView({ behavior: "smooth", block: "center" });
			}, 50);
			return;
		}

		// Tanda 7D — espejo de la validación nueva del backend (que antes
		// aceptaba contraseñas de 1 carácter). Feedback inmediato sin
		// round-trip.
		if ((password || "").length < 6) {
			setError("Password must be at least 6 characters.");
			return;
		}

		setLoading(true);

		try {
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/api/register`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email, username, password }),
				}
			);

			const data = await response.json().catch(() => ({}));

			if (!response.ok) {
				setError(data.msg || "Error creating user");
				return;
			}

			// Tanda 7E — el backend dice si pudo enviar el email de
			// confirmación; mostramos la pantalla de éxito acorde.
			setEmailSent(!!data.verification_email_sent);
			setRegistered(true);
		} catch (err) {
			console.error("Register error:", err);
			setError("Server error");
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
						<h2 className="sq-auth-title text-center mb-1">
							<img
								src={logoSideQuest}
								alt="SideQuest"
								style={{ filter: "brightness(0) invert(1)", height: "60px", width: "auto" }}
							/>
						</h2>
						<p className="text-center text-secondary mb-4">Your SideQuest waits for you!</p>

						{/* Tanda 7E — pantalla de éxito post-registro */}
						{registered ? (
							<div className="text-center py-3">
								<FiCheckCircle size={44} color="#22c55e" className="mb-3" />
								<h5 className="mb-2">Account created!</h5>
								{emailSent ? (
									<p className="text-secondary mb-3">
										We've sent a confirmation link to{" "}
										<strong className="text-light">{email}</strong>.
										Check your inbox (and spam folder) to verify your
										email — meanwhile you can already log in.
									</p>
								) : (
									<p className="text-secondary mb-3">
										You can now log in with your new account.
									</p>
								)}
								<Button
									className="sq-auth-submit w-100 py-2"
									onClick={() => navigate("/login")}
								>
									Go to login
								</Button>
							</div>
						) : (
						<>
						{error && (
							<Alert variant="danger" onClose={() => setError("")} dismissible>
								{error}
							</Alert>
						)}

						<Form onSubmit={handleRegister}>
							<Form.Group className="mb-3">
								<Form.Label>
									<FiMail className="me-2" /> Email
								</Form.Label>
								<Form.Control
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="alex@example.com"
									required
									autoComplete="email"
								/>
							</Form.Group>

							<Form.Group className="mb-3">
								<Form.Label>
									<FiAtSign className="me-2" /> Username
								</Form.Label>
								<Form.Control
									type="text"
									value={username}
									onChange={(e) => setUsername(e.target.value)}
									placeholder="alexchen"
									required
									minLength={3}
									maxLength={30}
									pattern="[A-Za-z0-9._-]{3,30}"
									autoComplete="username"
								/>
								<div className="sq-auth-hint">
									3-30 caracteres · letras, dígitos, . _ -
								</div>
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
									required
									minLength={6}
									autoComplete="new-password"
								/>
							</Form.Group>

							{/* Tanda 4D — Aceptación obligatoria de Terms + Privacy.
							    `required` activa la validación HTML5 nativa del
							    navegador, y el check JS-side en handleRegister
							    es la red de seguridad. Los enlaces abren en una
							    nueva pestaña para que el usuario no pierda lo
							    que ya escribió en el form. */}
							<Form.Group className="mb-4">
								<Form.Check
									type="checkbox"
									id="register-accept-terms"
									checked={acceptedTerms}
									onChange={(e) => handleAcceptTermsChange(e.target.checked)}
									label={
										<span className="small text-secondary">
											I have read and accept the{" "}
											<Link to="/terms" target="_blank" rel="noreferrer" className="sq-auth-link">
												Terms of Service
											</Link>{" "}
											and the{" "}
											<Link to="/privacy" target="_blank" rel="noreferrer" className="sq-auth-link">
												Privacy Policy
											</Link>
											.
										</span>
									}
									aria-required="true"
								/>
								{/* Nota: quitamos `required` del checkbox para que el
								    submit DEJE de bloquearse en la validación nativa
								    del navegador. Ahora el flujo es: el botón siempre
								    es clickable → handleRegister hace la validación →
								    si no está marcado, muestra Alert visible. */}
							</Form.Group>

							<Button
								type="submit"
								className="sq-auth-submit w-100 py-2"
								disabled={loading}
							>
								{loading
									? <><Spinner size="sm" animation="border" /> Creating...</>
									: <><FiUserPlus className="me-2" /> Register</>
								}
							</Button>
						</Form>

						<div className="text-center mt-4 text-secondary small">
							Ya tienes cuenta?{" "}
							<Link to="/login" className="sq-auth-link">
								Iniciar sesion
							</Link>
						</div>

						<div className="text-center mt-2 text-secondary small">
							<button
								type="button"
								className="sq-auth-link btn btn-link p-0"
								onClick={() => setShowReset(true)}
							>
								Forgot your password?
							</button>
						</div>
						</>
						)}
					</Card>
				</Container>
			</div>

			<ResetPasswordModal show={showReset} onHide={() => setShowReset(false)} />
		</>
	);
};

export default Register;
