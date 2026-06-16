import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
	Container,
	Row,
	Col,
	Card,
	Button,
	Form,
	Modal,
	Spinner,
	Alert,
	Badge,
	Dropdown,
} from "react-bootstrap";
import {
	FiMapPin,
	FiClock,
	FiStar,
	FiEdit2,
	FiPlus,
	FiTrash2,
	FiImage,
	FiCalendar,
	FiArrowLeft,
	FiBriefcase,
	FiChevronDown,
} from "react-icons/fi";

import { api } from "../services/api";
import { getStoredUser } from "../services/auth";
import { compressAndUpload } from "../utils/uploadImage";

// =============================================================
// STYLES — dark mode, same palette as Profile / FriendProfile
// =============================================================
const CSS = `
.biz-page {
	min-height: 100vh;
	background:
		radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.15), transparent 60%),
		radial-gradient(900px 500px at 100% 10%, rgba(236,72,153,0.10), transparent 60%),
		#0b0d12;
	color: #e9ecef;
	padding-top: 80px;
	padding-bottom: 110px;
}
.biz-card {
	background: #161922;
	border: 1px solid #262a36;
	border-radius: 14px;
	color: #e9ecef;
}
.biz-hero-avatar {
	width: 120px; height: 120px;
	border-radius: 18px;
	object-fit: cover;
	border: 3px solid #6366f1;
	background: #0f111a;
}
.biz-hero-fallback {
	width: 120px; height: 120px;
	border-radius: 18px;
	display: flex; align-items: center; justify-content: center;
	background: linear-gradient(135deg, #1e2230, #0f111a);
	color: #3a3f55; border: 1px solid #262a36;
}
.biz-section-title {
	font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;
	color: #8a90a2; font-weight: 600; margin-bottom: 0.75rem;
}
.biz-stars svg { color: #f5b301; }
.biz-stars svg.empty { color: #3a3f55; }
.biz-hours-row { display: flex; justify-content: space-between; padding: 0.2rem 0; border-bottom: 1px dashed #20242f; }
.biz-hours-row:last-child { border-bottom: none; }
.biz-hours-day { color: #adb5bd; text-transform: capitalize; }
.biz-carousel { display: flex; gap: 0.85rem; overflow-x: auto; padding-bottom: 0.5rem; scroll-snap-type: x mandatory; }
.biz-event-card {
	flex: 0 0 220px; scroll-snap-align: start;
	background: #0f111a; border: 1px solid #262a36; border-radius: 12px; overflow: hidden;
}
.biz-event-img { width: 100%; height: 110px; object-fit: cover; border-bottom: 1px solid #262a36; }
.biz-event-noimg { width: 100%; height: 110px; display: flex; align-items: center; justify-content: center; color: #2a2f42; background: linear-gradient(135deg,#1e2230,#0f111a); }
.biz-post { background: #0f111a; border: 1px solid #262a36; border-radius: 12px; overflow: hidden; }
.biz-post-img { width: 100%; max-height: 360px; object-fit: cover; }
.biz-review { border-bottom: 1px solid #20242f; padding: 0.75rem 0; }
.biz-review:last-child { border-bottom: none; }
.biz-page .form-control, .biz-page .form-control:focus,
.biz-page .form-select, .biz-page .form-select:focus,
.biz-modal .form-control, .biz-modal .form-control:focus,
.biz-modal .form-select, .biz-modal .form-select:focus {
	background-color: #0f111a !important; color: #e9ecef !important;
	border-color: #2a2f42 !important; box-shadow: none;
}
.biz-modal .modal-content { background: #161922; color: #e9ecef; border: 1px solid #262a36; border-radius: 14px; }
.biz-modal .modal-header, .biz-modal .modal-footer { border-color: #262a36; }
.biz-rate-star { cursor: pointer; }
.sq-grad-btn { background: linear-gradient(135deg,#6366f1,#4f46e5); border: none; font-weight: 600; }
.sq-grad-btn:hover, .sq-grad-btn:focus { background: linear-gradient(135deg,#4f46e5,#4338ca); }
/* Multi-business switcher (wireframe: business name ▼ → business 1 / 2) */
.biz-switch-toggle.dropdown-toggle::after { display: none; }
.biz-switch-toggle {
  display: inline-flex; align-items: center; gap: 0.4rem;
  background: #0f111a !important; border: 1px solid #2a2f42 !important; color: #fff !important;
  border-radius: 999px !important; padding: 0.35rem 0.8rem !important; font-weight: 600; font-size: 0.9rem;
  max-width: 240px;
}
.biz-switch-toggle:hover { border-color: #6366f1 !important; }
.biz-switch-menu { background: #161922; border: 1px solid #262a36; min-width: 240px; }
.biz-switch-menu .dropdown-item { color: #e9ecef; }
.biz-switch-menu .dropdown-item:hover { background: #1e2230; color: #fff; }
.biz-switch-menu .dropdown-item.active, .biz-switch-menu .dropdown-item:active { background: rgba(99,102,241,0.18) !important; color: #fff !important; }
.biz-switch-menu .dropdown-divider { border-color: #262a36; }
`;

const DAYS = [
	["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"],
	["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
];

// Read-only star row for a 1-5 rating (supports halves via rounding).
const Stars = ({ value = 0, size = 16 }) => {
	const rounded = Math.round(value);
	return (
		<span className="biz-stars d-inline-flex align-items-center gap-1">
			{[1, 2, 3, 4, 5].map((n) => (
				<FiStar
					key={n}
					size={size}
					className={n <= rounded ? "" : "empty"}
					style={{ fill: n <= rounded ? "currentColor" : "none" }}
				/>
			))}
		</span>
	);
};

const fmtDate = (iso) => {
	if (!iso) return "";
	try { return new Date(iso).toLocaleDateString(); } catch { return ""; }
};

// =============================================================
// MAIN
// =============================================================
export const BusinessProfile = () => {
	const { id } = useParams();
	const navigate = useNavigate();
	const me = getStoredUser();

	const [biz, setBiz] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [toast, setToast] = useState(null);

	// edit-business modal
	const [editing, setEditing] = useState(false);
	const [savingBiz, setSavingBiz] = useState(false);
	const [form, setForm] = useState({});
	const editPhotoRef = useRef(null);

	// new-post composer
	const [postText, setPostText] = useState("");
	const [postImage, setPostImage] = useState("");
	const [postingBusy, setPostingBusy] = useState(false);
	const postPhotoRef = useRef(null);

	// my review
	const [myRating, setMyRating] = useState(0);
	const [myReviewText, setMyReviewText] = useState("");
	const [reviewBusy, setReviewBusy] = useState(false);

	const showToast = (text, variant = "success") => {
		setToast({ text, variant });
		setTimeout(() => setToast(null), 2200);
	};

	const reload = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await api.get(`/business/${id}`);
			setBiz(data);
			if (data.my_review) {
				setMyRating(data.my_review.rating || 0);
				setMyReviewText(data.my_review.text || "");
			}
		} catch (e) {
			setError(e.message);
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => { reload(); }, [reload]);

	// ---------- edit business ----------
	const openEdit = () => {
		setForm({
			name: biz.name || "",
			category: biz.category || "",
			location: biz.location || "",
			description: biz.description || "",
			profile_picture_url: biz.profile_picture_url || "",
			hours: { ...(biz.hours || {}) },
		});
		setEditing(true);
	};
	const setField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
	const setHour = (day, which, value) =>
		setForm((f) => ({
			...f,
			hours: { ...f.hours, [day]: { ...(f.hours[day] || {}), [which]: value } },
		}));
	const clearDay = (day) =>
		setForm((f) => {
			const h = { ...f.hours };
			delete h[day];
			return { ...f, hours: h };
		});

	const pickEditPhoto = () => editPhotoRef.current?.click();
	const onEditPhoto = async (e) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		try {
			const url = await compressAndUpload(file, "profile");
			setForm((f) => ({ ...f, profile_picture_url: url }));
		} catch { showToast("Image upload failed", "danger"); }
	};

	const saveBiz = async () => {
		setSavingBiz(true);
		try {
			// drop days with neither open nor close set
			const hours = {};
			for (const [k, v] of Object.entries(form.hours || {})) {
				if (v && (v.open || v.close)) hours[k] = v;
			}
			await api.put(`/business/${id}`, { ...form, hours });
			showToast("Business updated");
			setEditing(false);
			reload();
		} catch (e) { showToast(e.message, "danger"); }
		finally { setSavingBiz(false); }
	};

	// ---------- posts ----------
	const pickPostPhoto = () => postPhotoRef.current?.click();
	const onPostPhoto = async (e) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		try {
			const url = await compressAndUpload(file, "event");
			setPostImage(url);
		} catch { showToast("Image upload failed", "danger"); }
	};
	const submitPost = async () => {
		if (!postText.trim() && !postImage) return;
		setPostingBusy(true);
		try {
			await api.post(`/business/${id}/posts`, { text: postText, image: postImage });
			setPostText(""); setPostImage("");
			showToast("Posted");
			reload();
		} catch (e) { showToast(e.message, "danger"); }
		finally { setPostingBusy(false); }
	};
	const deletePost = async (postId) => {
		try {
			await api.del(`/business/${id}/posts/${postId}`);
			reload();
		} catch (e) { showToast(e.message, "danger"); }
	};

	// ---------- reviews ----------
	const submitReview = async () => {
		if (!myRating) { showToast("Pick a star rating first", "danger"); return; }
		setReviewBusy(true);
		try {
			await api.post(`/business/${id}/reviews`, { rating: myRating, text: myReviewText });
			showToast("Thanks for your review");
			reload();
		} catch (e) { showToast(e.message, "danger"); }
		finally { setReviewBusy(false); }
	};
	const deleteReview = async (reviewId) => {
		try {
			await api.del(`/business/${id}/reviews/${reviewId}`);
			setMyRating(0); setMyReviewText("");
			reload();
		} catch (e) { showToast(e.message, "danger"); }
	};

	// =====================================================
	// RENDER
	// =====================================================
	if (loading) {
		return (
			<div className="biz-page">
				<style>{CSS}</style>
				<Container className="text-center py-5"><Spinner animation="border" /></Container>
			</div>
		);
	}
	if (error || !biz) {
		return (
			<div className="biz-page">
				<style>{CSS}</style>
				<Container className="py-5">
					<Alert variant="danger">{error || "Business not found"}</Alert>
					<Button variant="outline-light" size="sm" onClick={() => navigate(-1)}>
						<FiArrowLeft className="me-1" /> Back
					</Button>
				</Container>
			</div>
		);
	}

	const isOwner = !!biz.is_owner;
	const hasHours = biz.hours && Object.keys(biz.hours).length > 0;

	return (
		<div className="biz-page">
			<style>{CSS}</style>
			<Container>
				<div className="mb-3 d-flex justify-content-between align-items-center gap-2 flex-wrap">
					<Button variant="outline-light" size="sm" onClick={() => navigate(-1)}>
						<FiArrowLeft className="me-1" /> Back
					</Button>
					{isOwner && (
						<div className="d-flex align-items-center gap-2 ms-auto">
							{/* Switcher — jump between the businesses you manage */}
							<Dropdown>
								<Dropdown.Toggle as={Button} className="biz-switch-toggle">
									<FiBriefcase size={14} />
									<span className="text-truncate">{biz.name}</span>
									<FiChevronDown size={14} />
								</Dropdown.Toggle>
								<Dropdown.Menu className="biz-switch-menu" align="end">
									{(biz.my_businesses || []).map((b) => (
										<Dropdown.Item
											key={b.id}
											active={b.id === biz.id}
											onClick={() => { if (b.id !== biz.id) navigate(`/business/${b.id}`); }}
										>
											<FiBriefcase className="me-2" />{b.name}
										</Dropdown.Item>
									))}
									<Dropdown.Divider />
									<Dropdown.Item onClick={() => navigate("/businesses")}>
										<FiPlus className="me-2" /> Manage / add business
									</Dropdown.Item>
								</Dropdown.Menu>
							</Dropdown>
							<Button className="sq-grad-btn" size="sm" onClick={openEdit}>
								<FiEdit2 className="me-1" /> Edit
							</Button>
						</div>
					)}
				</div>

				{toast && <Alert variant={toast.variant} className="py-2">{toast.text}</Alert>}

				{/* HERO */}
				<Card className="biz-card mb-4">
					<Card.Body>
						<Row className="align-items-center g-4">
							<Col xs={12} md="auto" className="text-center">
								{biz.profile_picture_url ? (
									<img src={biz.profile_picture_url} alt={biz.name} className="biz-hero-avatar" />
								) : (
									<div className="biz-hero-fallback"><FiBriefcase size={40} /></div>
								)}
							</Col>
							<Col>
								<div className="d-flex align-items-center gap-2 flex-wrap mb-1">
									<h1 className="text-light mb-0">{biz.name}</h1>
									{biz.category && <Badge bg="secondary" className="text-capitalize">{biz.category}</Badge>}
								</div>
								<div className="d-flex align-items-center gap-2 mb-2">
									{biz.rating != null ? (
										<>
											<Stars value={biz.rating} />
											<span className="text-light fw-semibold">{biz.rating}</span>
											<span className="text-secondary small">({biz.reviews_count} review{biz.reviews_count === 1 ? "" : "s"})</span>
										</>
									) : (
										<span className="text-secondary small">No reviews yet</span>
									)}
								</div>
								{biz.location && (
									<div className="text-secondary"><FiMapPin className="me-1" />{biz.location}</div>
								)}
								{biz.description && <p className="text-light mt-2 mb-0">{biz.description}</p>}
							</Col>
						</Row>
					</Card.Body>
				</Card>

				<Row className="g-4">
					{/* LEFT: hours + reviews */}
					<Col lg={4}>
						{/* HOURS */}
						<Card className="biz-card mb-4">
							<Card.Body>
								<div className="biz-section-title"><FiClock className="me-1" /> Opening hours</div>
								{hasHours ? (
									DAYS.filter(([k]) => biz.hours[k]).map(([k, label]) => (
										<div className="biz-hours-row" key={k}>
											<span className="biz-hours-day">{label}</span>
											<span>{biz.hours[k].open || "—"} – {biz.hours[k].close || "—"}</span>
										</div>
									))
								) : (
									<div className="text-secondary small">Hours not set yet.</div>
								)}
							</Card.Body>
						</Card>

						{/* REVIEWS */}
						<Card className="biz-card">
							<Card.Body>
								<div className="biz-section-title"><FiStar className="me-1" /> Reviews</div>

								{!isOwner && (
									<div className="mb-3">
										<div className="mb-2 small text-secondary">Your rating</div>
										<div className="mb-2">
											{[1, 2, 3, 4, 5].map((n) => (
												<FiStar
													key={n}
													size={26}
													className="biz-rate-star me-1"
													onClick={() => setMyRating(n)}
													style={{
														color: n <= myRating ? "#f5b301" : "#3a3f55",
														fill: n <= myRating ? "#f5b301" : "none",
													}}
												/>
											))}
										</div>
										<Form.Control
											as="textarea" rows={2} className="mb-2"
											placeholder="Share your experience (optional)…"
											value={myReviewText}
											onChange={(e) => setMyReviewText(e.target.value)}
										/>
										<div className="d-flex gap-2">
											<Button className="sq-grad-btn" size="sm" onClick={submitReview} disabled={reviewBusy}>
												{biz.my_review ? "Update review" : "Submit review"}
											</Button>
											{biz.my_review && (
												<Button variant="outline-danger" size="sm" onClick={() => deleteReview(biz.my_review.id)}>
													Remove
												</Button>
											)}
										</div>
										<hr style={{ borderColor: "#20242f" }} />
									</div>
								)}

								{(biz.reviews || []).length === 0 ? (
									<div className="text-secondary small">Be the first to review.</div>
								) : (
									(biz.reviews || []).map((r) => (
										<div className="biz-review" key={r.id}>
											<div className="d-flex justify-content-between align-items-center">
												<span className="fw-semibold text-light">@{r.author_username}</span>
												<Stars value={r.rating} size={13} />
											</div>
											{r.text && <div className="small text-secondary mt-1">{r.text}</div>}
											{(isOwner || r.author_id === me?.id) && (
												<Button variant="link" size="sm" className="text-danger p-0 mt-1"
													onClick={() => deleteReview(r.id)}>
													<FiTrash2 size={13} /> remove
												</Button>
											)}
										</div>
									))
								)}
							</Card.Body>
						</Card>
					</Col>

					{/* RIGHT: events carousel + posts feed */}
					<Col lg={8}>
						{/* EVENTS CAROUSEL */}
						<Card className="biz-card mb-4">
							<Card.Body>
								<div className="biz-section-title"><FiCalendar className="me-1" /> Events</div>
								{(biz.events || []).length === 0 ? (
									<div className="text-secondary small">No events yet.</div>
								) : (
									<div className="biz-carousel">
										{(biz.events || []).map((ev) => (
											<div className="biz-event-card" key={ev.id}>
												{ev.image ? (
													<img src={ev.image} alt={ev.title} className="biz-event-img" />
												) : (
													<div className="biz-event-noimg"><FiImage size={32} /></div>
												)}
												<div className="p-2">
													<div className="fw-semibold text-light text-truncate">{ev.title || "(untitled)"}</div>
													<div className="small text-secondary"><FiCalendar size={12} className="me-1" />{ev.date} · {ev.time}</div>
													{ev.location && (
														<div className="small text-secondary text-truncate"><FiMapPin size={12} className="me-1" />{ev.location}</div>
													)}
												</div>
											</div>
										))}
									</div>
								)}
							</Card.Body>
						</Card>

						{/* POSTS FEED */}
						<Card className="biz-card">
							<Card.Body>
								<div className="biz-section-title"><FiPlus className="me-1" /> Posts</div>

								{isOwner && (
									<div className="mb-3">
										<Form.Control
											as="textarea" rows={2} className="mb-2"
											placeholder="Share an update…"
											value={postText}
											onChange={(e) => setPostText(e.target.value)}
										/>
										{postImage && (
											<img src={postImage} alt="preview" className="biz-post-img mb-2" style={{ maxHeight: 200 }} />
										)}
										<div className="d-flex gap-2">
											<Button variant="outline-light" size="sm" onClick={pickPostPhoto}>
												<FiImage className="me-1" /> {postImage ? "Change image" : "Add image"}
											</Button>
											<Button className="sq-grad-btn" size="sm" onClick={submitPost} disabled={postingBusy}>
												<FiPlus className="me-1" /> Post
											</Button>
											<input ref={postPhotoRef} type="file" accept="image/*" hidden onChange={onPostPhoto} />
										</div>
										<hr style={{ borderColor: "#20242f" }} />
									</div>
								)}

								{(biz.posts || []).length === 0 ? (
									<div className="text-secondary small">No posts yet.</div>
								) : (
									<div className="d-flex flex-column gap-3">
										{(biz.posts || []).map((p) => (
											<div className="biz-post" key={p.id}>
												{p.image && <img src={p.image} alt="" className="biz-post-img" />}
												<div className="p-3">
													{p.text && <div className="text-light">{p.text}</div>}
													<div className="d-flex justify-content-between align-items-center mt-2">
														<span className="small text-secondary">{fmtDate(p.created_at)}</span>
														{isOwner && (
															<Button variant="link" size="sm" className="text-danger p-0" onClick={() => deletePost(p.id)}>
																<FiTrash2 size={14} /> delete
															</Button>
														)}
													</div>
												</div>
											</div>
										))}
									</div>
								)}
							</Card.Body>
						</Card>
					</Col>
				</Row>
			</Container>

			{/* EDIT BUSINESS MODAL */}
			<Modal show={editing} onHide={() => setEditing(false)} centered dialogClassName="biz-modal" size="lg">
				<Modal.Header closeButton closeVariant="white">
					<Modal.Title>Edit business</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<div className="text-center mb-3">
						{form.profile_picture_url ? (
							<img src={form.profile_picture_url} alt="" className="biz-hero-avatar" />
						) : (
							<div className="biz-hero-fallback mx-auto"><FiBriefcase size={40} /></div>
						)}
						<div className="mt-2">
							<Button variant="outline-light" size="sm" onClick={pickEditPhoto}>
								<FiImage className="me-1" /> {form.profile_picture_url ? "Change photo" : "Add photo"}
							</Button>
							<input ref={editPhotoRef} type="file" accept="image/*" hidden onChange={onEditPhoto} />
						</div>
					</div>

					<Row>
						<Col md={7} className="mb-3">
							<Form.Label>Name</Form.Label>
							<Form.Control name="name" value={form.name || ""} onChange={setField} />
						</Col>
						<Col md={5} className="mb-3">
							<Form.Label>Category</Form.Label>
							<Form.Select name="category" value={form.category || ""} onChange={setField}>
								<option value="">Select…</option>
								<option value="restaurant">Restaurant</option>
								<option value="bar">Bar</option>
								<option value="cafe">Café</option>
								<option value="brand">Clothing / brand</option>
								<option value="shop">Shop</option>
								<option value="other">Other</option>
							</Form.Select>
						</Col>
					</Row>
					<Form.Group className="mb-3">
						<Form.Label>Location</Form.Label>
						<Form.Control name="location" value={form.location || ""} onChange={setField} placeholder="Street, city" />
					</Form.Group>
					<Form.Group className="mb-3">
						<Form.Label>Description</Form.Label>
						<Form.Control as="textarea" rows={2} name="description" value={form.description || ""} onChange={setField} />
					</Form.Group>

					<div className="biz-section-title mt-3">Opening hours</div>
					{DAYS.map(([k, label]) => {
						const day = (form.hours && form.hours[k]) || null;
						return (
							<Row key={k} className="align-items-center mb-2 g-2">
								<Col xs={4} className="text-capitalize text-secondary small">{label}</Col>
								<Col xs={3}>
									<Form.Control type="time" value={day?.open || ""} onChange={(e) => setHour(k, "open", e.target.value)} />
								</Col>
								<Col xs={3}>
									<Form.Control type="time" value={day?.close || ""} onChange={(e) => setHour(k, "close", e.target.value)} />
								</Col>
								<Col xs={2}>
									{day && (
										<Button variant="link" size="sm" className="text-danger p-0" onClick={() => clearDay(k)}>
											clear
										</Button>
									)}
								</Col>
							</Row>
						);
					})}
				</Modal.Body>
				<Modal.Footer>
					<Button variant="outline-light" onClick={() => setEditing(false)}>Cancel</Button>
					<Button className="sq-grad-btn" onClick={saveBiz} disabled={savingBiz}>
						{savingBiz ? "Saving…" : "Save changes"}
					</Button>
				</Modal.Footer>
			</Modal>
		</div>
	);
};

export default BusinessProfile;
