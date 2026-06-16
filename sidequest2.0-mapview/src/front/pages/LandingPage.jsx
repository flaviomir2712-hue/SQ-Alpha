import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiInstagram } from "react-icons/fi";
import "./landingPage.css";
// Tanda 7D — señal de sesión basada en el user persistido (el JWT vive
// en una cookie httpOnly).
import { isLoggedIn } from "../services/auth";

// Brand + marketing assets (cropped from the official landing design).
import sqMark from "../assets/img/logoSideQuest.png";
import wordmark from "../assets/img/lp-wordmark.png";
import shotFind from "../assets/img/lp-phone-find.png";
import shotCreate from "../assets/img/lp-phone-create.png";
import shotPrivacy from "../assets/img/lp-phone-privacy.png";
import qrCode from "../assets/img/lp-qr.png";

// A row of solid diamonds used as a section divider. Rendered long and
// clipped by the container so it always spans the full width regardless
// of viewport size.
const DIVIDER = "◆".repeat(120);

// ─────────────────────────────────────────────────────────────────────────
// LandingPage
//
// Public entry point of the app (route "/"). It is intentionally
// self-contained: it does NOT mount the in-app Navbar / BottomNavbar
// (Layout hides those on "/"). The only ways forward are the top-right
// "login" / "register" links, which route to the existing auth screens.
// On successful login the app sends the user to "/app" (the map).
// ─────────────────────────────────────────────────────────────────────────
export const LandingPage = () => {
	const navigate = useNavigate();

	// Logged-out visitors always see this landing (it's the public entry
	// point). Returning users who already have a session skip straight to
	// the app instead of being shown the marketing page again.
	// Remove this effect if you'd rather show the landing to everyone.
	// Tanda 7D — la señal de sesión es el user persistido (el JWT vive
	// en una cookie httpOnly que JS no puede leer).
	useEffect(() => {
		if (isLoggedIn()) {
			navigate("/app", { replace: true });
		}
	}, [navigate]);

	return (
		<div className="lp-root">
			{/* ── Top bar ─────────────────────────────────────────────── */}
			<header className="lp-bar">
				<Link to="/">
					<img className="lp-bar__logo" src={sqMark} alt="SideQuest" />
				</Link>
				<nav className="lp-bar__auth">
					<Link to="/login" className="lp-bar__link">login</Link>
					<span className="lp-bar__sep">/</span>
					<Link to="/register" className="lp-bar__link">register</Link>
				</nav>
			</header>

			{/* NOTA SEMÁNTICA: este wrapper ANTES era <main>. Como ahora
			    Layout.jsx envuelve todas las rutas en un <main> global
			    para que TODA la app tenga un punto de entrada accesible
			    consistente, aquí bajamos a <section> para no anidar dos
			    <main> (HTML5 inválido). Misma clase, mismo CSS, cero
			    impacto visual. */}
			<section className="lp-container">
				{/* ── Hero wordmark ──────────────────────────────────── */}
				<section className="lp-hero">
					<img
						className="lp-hero__wordmark"
						src={wordmark}
						alt="SIDE QUEST"
					/>
				</section>

				<div className="lp-divider" aria-hidden="true">{DIVIDER}</div>

				{/* ── Tagline ────────────────────────────────────────── */}
				<p className="lp-tagline">
					A <b>social network</b> for the <b>real world</b>, connecting
					people on their <b>screens</b> to the <b>streets</b>.
				</p>

				{/* ── Down arrow ─────────────────────────────────────── */}
				<div className="lp-arrow" aria-hidden="true">
					<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
						<path d="M10 2h4v11h4l-6 8-6-8h4z" />
					</svg>
				</div>

				{/* ── Feature columns ────────────────────────────────── */}
				<section className="lp-features">
					<article className="lp-feature">
						<h2 className="lp-feature__title">find<br />events</h2>
						<span className="lp-feature__bullet" aria-hidden="true">◆</span>
						<img className="lp-feature__shot" src={shotFind} alt="Find events on the map" />
						<span className="lp-feature__bullet" aria-hidden="true">◆</span>
					</article>

					<article className="lp-feature">
						<h2 className="lp-feature__title">create<br />events</h2>
						<span className="lp-feature__bullet" aria-hidden="true">◆</span>
						<img className="lp-feature__shot" src={shotCreate} alt="Create an event" />
						<span className="lp-feature__bullet" aria-hidden="true">◆</span>
					</article>

					<article className="lp-feature">
						<h2 className="lp-feature__title">private<br />or public</h2>
						<span className="lp-feature__bullet" aria-hidden="true">◆</span>
						<img className="lp-feature__shot" src={shotPrivacy} alt="Private or public visibility" />
						<span className="lp-feature__bullet" aria-hidden="true">◆</span>
					</article>
				</section>

				<div className="lp-divider" aria-hidden="true">{DIVIDER}</div>

				{/* ── Register / download ────────────────────────────── */}
				<p className="lp-cta-title">
					Register and download the <b>app</b>
				</p>

				<div className="lp-qr">
					<img src={qrCode} alt="Download SideQuest — scan to get the app" />
				</div>

				<p className="lp-closing">
					A <b>social network</b> to <b>delete</b> your other social networks.
				</p>
			</section>

			{/* ── Footer ─────────────────────────────────────────────── */}
			<footer className="lp-footer">
				<div className="lp-footer__left">
					<img className="lp-footer__logo" src={sqMark} alt="SideQuest" />
					<span className="lp-footer__pipe" aria-hidden="true" />
					<a
						className="lp-footer__social"
						href="https://instagram.com"
						target="_blank"
						rel="noreferrer"
					>
						<FiInstagram size={18} />
						<span className="lp-footer__note">(you can find us here just in case)</span>
					</a>
				</div>
				<span className="lp-footer__rights">All right reserved</span>
			</footer>
		</div>
	);
};

export default LandingPage;
