import { useState } from "react";
import { Modal, Form, Button, Alert, Spinner } from "react-bootstrap";
import { FiAtSign, FiMail, FiCheckCircle } from "react-icons/fi";

// ════════════════════════════════════════════════════════════════
// ResetPasswordModal — Tanda 7E (email-link flow)
// ════════════════════════════════════════════════════════════════
//
// Sustituye el flujo MVP "directo" (cualquiera con un username podía
// cambiar la contraseña — el disclaimer ámbar que vivía aquí ya no es
// necesario). Ahora este modal solo PIDE el link:
//
//   1. El usuario escribe su email o username.
//   2. POST /api/password-recovery → el backend envía un email con un
//      link firmado (caduca en 1 h) a la dirección de la cuenta.
//   3. El link abre /reset-password/<token> (página ResetPassword.jsx)
//      donde se elige la contraseña nueva.
//
// El backend SIEMPRE responde 200 exista o no la cuenta (anti
// user-enumeration), así que el mensaje de éxito es neutro a propósito.
// ════════════════════════════════════════════════════════════════

const MODAL_CSS = `
.sq-reset-modal .modal-content {
	background: #161922;
	color: #e9ecef;
	border: 1px solid #262a36;
	border-radius: 14px;
}
.sq-reset-modal .form-control,
.sq-reset-modal .form-control:focus {
	background-color: #0f111a !important;
	color: #e9ecef !important;
	border-color: #2a2f42 !important;
	box-shadow: none;
}
.sq-reset-modal .form-control::placeholder { color: #6c757d; }
.sq-reset-modal .form-label {
	color: #adb5bd;
	font-size: 0.78rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	margin-bottom: 0.35rem;
}
.sq-reset-submit {
	background: linear-gradient(135deg, #6366f1, #4f46e5);
	border: none;
	font-weight: 600;
}
.sq-reset-submit:hover,
.sq-reset-submit:focus {
	background: linear-gradient(135deg, #4f46e5, #4338ca);
}
`;

export const ResetPasswordModal = ({ show, onHide }) => {
	const [identifier, setIdentifier] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [done, setDone] = useState(false);

	const resetState = () => {
		setIdentifier("");
		setError("");
		setDone(false);
		setLoading(false);
	};

	const close = () => {
		resetState();
		onHide();
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError("");
		setLoading(true);
		try {
			const res = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/api/password-recovery`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ identifier }),
				}
			);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				setError(data.msg || "Could not send the reset email.");
				return;
			}
			setDone(true);
		} catch (err) {
			console.error("Password recovery error:", err);
			setError("Server error. Please try again later.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<style>{MODAL_CSS}</style>
			<Modal show={show} onHide={close} centered dialogClassName="sq-reset-modal">
				<Modal.Header closeButton closeVariant="white" className="border-secondary">
					<Modal.Title>Reset your password</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					{done ? (
						<div className="text-center py-2">
							<FiCheckCircle size={44} color="#22c55e" className="mb-3" />
							<h5 className="mb-2">Check your inbox</h5>
							<p className="text-secondary mb-3">
								If that account exists, we've sent a reset link to its email
								address. The link is valid for <strong>1 hour</strong> — check
								your spam folder too.
							</p>
							<Button className="sq-reset-submit w-100" onClick={close}>
								Close
							</Button>
						</div>
					) : (
						<>
							{error && (
								<Alert variant="danger" onClose={() => setError("")} dismissible>
									{error}
								</Alert>
							)}
							<p className="text-secondary small">
								<FiMail className="me-1" /> Tell us your email or username and
								we'll send you a link to choose a new password.
							</p>
							<Form onSubmit={handleSubmit}>
								<Form.Group className="mb-4">
									<Form.Label>
										<FiAtSign className="me-2" /> Email or username
									</Form.Label>
									<Form.Control
										type="text"
										value={identifier}
										onChange={(e) => setIdentifier(e.target.value)}
										placeholder="alex@example.com or alexchen"
										required
										autoComplete="username"
									/>
								</Form.Group>

								<Button
									type="submit"
									className="sq-reset-submit w-100 py-2"
									disabled={loading}
								>
									{loading ? (
										<>
											<Spinner size="sm" animation="border" /> Sending...
										</>
									) : (
										"Send reset link"
									)}
								</Button>
							</Form>
						</>
					)}
				</Modal.Body>
			</Modal>
		</>
	);
};

export default ResetPasswordModal;
