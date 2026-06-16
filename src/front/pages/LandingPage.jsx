import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiInstagram } from "react-icons/fi";
import "./landingPage.css";
import { isLoggedIn } from "../services/auth";

import sqMark from "../assets/img/logoSideQuest.png";
import wordmark from "../assets/img/lp-wordmark.png";
import shotFind from "../assets/img/lp-phone-find.png";
import shotCreate from "../assets/img/lp-phone-create.png";
import shotPrivacy from "../assets/img/lp-phone-privacy.png";

const DIVIDER = "◆".repeat(120);

export const LandingPage = () => {
	const navigate = useNavigate();

	useEffect(() => {
		if (isLoggedIn()) {
			navigate("/app", { replace: true });
		}
	}, [navigate]);

	return (
		<div className="lp-root">

			{/* ── Top bar ── */}
			<header className="lp-bar">
				<Link to="/" className="lp-bar__brand">
					<img className="lp-bar__logo" src={sqMark} alt="SideQuest" />
				</Link>
				<nav className="lp-bar__auth">
					<Link to="/login" className="lp-bar__btn-outline">
						Sign in
					</Link>
					<Link to="/register" className="lp-bar__btn-primary">
						Sign up
					</Link>
				</nav>
			</header>

			<section className="lp-container">

				{/* ── Hero ── */}
				<section className="lp-hero">
					<img
						className="lp-hero__wordmark"
						src={wordmark}
						alt="SIDE QUEST"
					/>
				</section>

				<div className="lp-divider" aria-hidden="true">{DIVIDER}</div>

				{/* ── Headline + Tagline ── */}
				<h1 className="lp-headline">Your city. Your rules.</h1>
				<p className="lp-tagline">
					The people you want to see, the places you want to be —
					all in one place, <b>when you decide</b>.
				</p>

				{/* ── Hero CTAs ── */}
				<div className="lp-hero-ctas">
					<Link to="/register" className="lp-cta-primary">
						Take control — it's free
					</Link>
					<Link to="/login" className="lp-cta-secondary">
						Already in? Sign in
					</Link>
				</div>

				{/* ── Down arrow ── */}
				<div className="lp-arrow" aria-hidden="true">
					<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
						<path d="M10 2h4v11h4l-6 8-6-8h4z" />
					</svg>
				</div>

				{/* ── Feature columns ── */}
				<section className="lp-features">
					<article className="lp-feature">
						<h2 className="lp-feature__title">find<br />events</h2>
						<span className="lp-feature__bullet" aria-hidden="true">◆</span>
						<img className="lp-feature__shot" src={shotFind} alt="Find events on the map" />
						<span className="lp-feature__bullet" aria-hidden="true">◆</span>
						<p className="lp-feature__copy">Know before everyone else.</p>
					</article>

					<article className="lp-feature">
						<h2 className="lp-feature__title">create<br />events</h2>
						<span className="lp-feature__bullet" aria-hidden="true">◆</span>
						<img className="lp-feature__shot" src={shotCreate} alt="Create an event" />
						<span className="lp-feature__bullet" aria-hidden="true">◆</span>
						<p className="lp-feature__copy">You set the time, the place, the vibe.</p>
					</article>

					<article className="lp-feature">
						<h2 className="lp-feature__title">private<br />or public</h2>
						<span className="lp-feature__bullet" aria-hidden="true">◆</span>
						<img className="lp-feature__shot" src={shotPrivacy} alt="Private or public visibility" />
						<span className="lp-feature__bullet" aria-hidden="true">◆</span>
						<p className="lp-feature__copy">Your world, shared only with who matters.</p>
					</article>
				</section>

				<div className="lp-divider" aria-hidden="true">{DIVIDER}</div>

				{/* ── Bottom CTA section ── */}
				<div className="lp-bottom-cta">
					<p className="lp-cta-title">
						The ones who shape their world<br />use <b>SideQuest</b>.
					</p>
					<p className="lp-cta-sub">
						Your friends. Your events. Your terms.
					</p>
					<div className="lp-hero-ctas">
						<Link to="/register" className="lp-cta-primary lp-cta-primary--lg">
							Take control — it's free
						</Link>
						<Link to="/login" className="lp-cta-secondary">
							Already in? Sign in
						</Link>
					</div>
				</div>

				{/* ── Closing line ── */}
				<p className="lp-closing">
					Life is better when you make it happen.
				</p>

			</section>

			{/* ── Footer ── */}
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
				<div className="lp-footer__right">
					<Link to="/terms" className="lp-footer__legal">Terms</Link>
					<span className="lp-footer__pipe" aria-hidden="true" />
					<Link to="/privacy" className="lp-footer__legal">Privacy</Link>
					<span className="lp-footer__pipe" aria-hidden="true" />
					<Link to="/legal" className="lp-footer__legal">Legal</Link>
					<span className="lp-footer__pipe" aria-hidden="true" />
					<span className="lp-footer__rights">All rights reserved</span>
				</div>
			</footer>
		</div>
	);
};

export default LandingPage;
