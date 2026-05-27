import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import useGlobalReducer from "../hooks/useGlobalReducer";

import Container from "react-bootstrap/Container";
import NavbarBs from "react-bootstrap/Navbar";
import Nav from "react-bootstrap/Nav";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import ListGroup from "react-bootstrap/ListGroup";
import Form from "react-bootstrap/Form";

import { NotificationBell } from "./NotificationBell.jsx";

import {
    FiMenu,
    FiMail,
    FiX,
    FiSend
} from "react-icons/fi";

export const Navbar = () => {
    const navigate = useNavigate();

    const { store, dispatch } = useGlobalReducer();

    const [showMessages, setShowMessages] = useState(false);

    const [replyRoomId, setReplyRoomId] = useState(null);

    const [replyText, setReplyText] = useState("");

    // =====================================================
    // LOAD CHAT ROOMS
    // =====================================================

    useEffect(() => {
        if (store.token) {
            getChatRooms(dispatch);
        }
    }, [store.token]);

    // =====================================================
    // LOGOUT
    // =====================================================

    const handleLogout = () => {
        logout(dispatch);
        navigate("/login");
    };

    // =====================================================
    // CHAT NAME
    // =====================================================

    const getChatName = (room) => {
        if (!store.user) return "Chat";

        const friend = room.participants?.find(
            (participant) => participant.id !== store.user.id
        );

        return friend
            ? friend.email
            : "Grupo / Evento";
    };

    // =====================================================
    // OPEN REPLY
    // =====================================================

    const handleOpenReply = (roomId) => {
        setReplyRoomId(roomId);
        setReplyText("");
    };

    // =====================================================
    // SEND MESSAGE
    // =====================================================

    const handleSendReply = async () => {
        if (!replyText.trim()) return;

        try {
            await sendChatMessage(
                dispatch,
                replyRoomId,
                replyText
            );

            setReplyText("");
            setReplyRoomId(null);

            await getChatRooms(dispatch);

        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    return (
        <>
            <NavbarBs
                bg="dark"
                variant="dark"
                className="px-4 py-3 fixed-top"
            >
                <Container
                    fluid
                    className="d-flex justify-content-between"
                >
                    <Link
                        to="/"
                        className="text-decoration-none"
                    >
                        <NavbarBs.Brand className="fw-bold fs-3">
                            SQ
                        </NavbarBs.Brand>
                    </Link>

                    <Nav className="d-flex flex-row align-items-center gap-4">

                        {store.token ? (
                            <>
                                <span className="text-light d-none d-md-block">
                                    {store.user?.email}
                                </span>

                                <NotificationBell />

                                <Button
                                    variant="dark"
                                    className="position-relative border-0"
                                    onClick={() => setShowMessages(true)}
                                >
                                    <FiMail
                                        size={28}
                                        color="white"
                                    />

                                    {store.chatRooms?.length > 0 && (
                                        <Badge
                                            bg="danger"
                                            pill
                                            className="position-absolute top-0 start-100 translate-middle"
                                        >
                                            {store.chatRooms.length}
                                        </Badge>
                                    )}
                                </Button>

                                <Button
                                    variant="outline-danger"
                                    size="sm"
                                    onClick={handleLogout}
                                >
                                    Salir
                                </Button>
                            </>
                        ) : (
                            <>
                                <Link to="/login">
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        className="me-2"
                                    >
                                        Ingresar
                                    </Button>
                                </Link>

                                <Link to="/register">
                                    <Button
                                        variant="success"
                                        size="sm"
                                    >
                                        Registro
                                    </Button>
                                </Link>
                            </>
                        )}

                        <FiMenu
                            size={34}
                            color="white"
                            style={{ cursor: "pointer" }}
                        />
                    </Nav>
                </Container>
            </NavbarBs>

            {/* =====================================================
                CHAT MODAL
            ===================================================== */}

            <Modal
                show={showMessages}
                onHide={() => setShowMessages(false)}
                centered
            >
                <Modal.Header closeButton>
                    <Modal.Title>
                        Tus Chats
                    </Modal.Title>
                </Modal.Header>

                <Modal.Body>

                    {!store.chatRooms ||
                    store.chatRooms.length === 0 ? (

                        <p className="text-muted mb-0">
                            No tienes chats activos.
                        </p>

                    ) : (

                        <ListGroup>

                            {store.chatRooms.map((room) => (

                                <ListGroup.Item key={room.id}>

                                    <div className="d-flex justify-content-between align-items-start gap-3">

                                        <div>
                                            <strong>
                                                {getChatName(room)}
                                            </strong>

                                            <br />

                                            <span
                                                className="text-muted"
                                                style={{
                                                    fontSize: "0.85em"
                                                }}
                                            >
                                                Sala ID: {room.id}
                                                {" | "}
                                                Tipo: {room.type}
                                            </span>
                                        </div>

                                        <Button
                                            variant="light"
                                            size="sm"
                                            className="border-0"
                                        >
                                            <FiX />
                                        </Button>
                                    </div>

                                    <div className="mt-3">

                                        <Button
                                            variant="outline-primary"
                                            size="sm"
                                            onClick={() =>
                                                handleOpenReply(room.id)
                                            }
                                        >
                                            Abrir Chat / Responder
                                        </Button>
                                    </div>

                                    {replyRoomId === room.id && (

                                        <div className="mt-3">

                                            <Form.Control
                                                as="textarea"
                                                rows={2}
                                                placeholder="Escribe un mensaje..."
                                                value={replyText}
                                                onChange={(e) =>
                                                    setReplyText(
                                                        e.target.value
                                                    )
                                                }
                                            />

                                            <div className="d-flex justify-content-end gap-2 mt-2">

                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() =>
                                                        setReplyRoomId(null)
                                                    }
                                                >
                                                    Cancelar
                                                </Button>

                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={handleSendReply}
                                                >
                                                    <FiSend />
                                                    {" "}
                                                    Enviar
                                                </Button>

                                            </div>
                                        </div>
                                    )}
                                </ListGroup.Item>
                            ))}
                        </ListGroup>
                    )}
                </Modal.Body>

                <Modal.Footer>
                    <Button
                        variant="secondary"
                        onClick={() =>
                            setShowMessages(false)
                        }
                    >
                        Cerrar
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
};