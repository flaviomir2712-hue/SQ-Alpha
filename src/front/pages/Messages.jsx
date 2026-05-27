import React, { useEffect, useState, useRef } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Form,
  Spinner,
  Alert,
  InputGroup
} from "react-bootstrap";

import "./messages.css";

const Messages = () => {
  // STATES
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");

  const messagesEndRef = useRef(null);

  // API BASE
  const API_URL =
    import.meta.env.VITE_BACKEND_URL;

  // AUTH HEADER
  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization:`Bearer ${localStorage.getItem("token")}`
  });

  // FETCH CURRENT USER
  const fetchCurrentUser = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users/me`,{
        headers: authHeaders()
      });

      if (!res.ok) throw new Error("Unauthorized");

      const data = await res.json();
      setCurrentUser(data);
    } catch (e) {
      setError(e.message);
    }
  };

  // FETCH USERS
  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users`, {
        headers: authHeaders()
      });

      if (!res.ok) return;

      const data = await res.json();
      setUsers(data);
    } catch (e) {
      console.error(e);
    }
  };

  // CONVERSATIONS
  const fetchConversations = async () => {
    try {
      setLoading(true);

      const res = await fetch(`${API_URL}/api/chat/rooms/${conversationId}`, {
        headers: authHeaders()
      });

      if (!res.ok) throw new Error("Failed to load conversations");

      const data = await res.json();
      setConversations(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // MESSAGES
  const fetchMessages = async (conversationId) => {
    try {
      const res = await fetch(
        `${API_URL}/api/chat/rooms/${conversationId}`,
        { headers: authHeaders() }
      );

      if (!res.ok) return;

      const data = await res.json();
      setMessages(data);
    } catch (e) {
      console.error(e);
    }
  };

  // SEND MESSAGE
  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!messageText.trim() || !selectedConversation) return;

    try {
      const res = await fetch(`${API_URL}/api/chat/rooms/${selectedConversation.id}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          conversation_id: selectedConversation.id,
          content:messageText
        })
      });

      if (!res.ok) throw new Error("Send failed");

      setMessageText("");
      fetchMessages(selectedConversation.id);
      fetchConversations();
    } catch (e) {
      console.error(e);
    }
  };

  // START CONVERSATION
  const startConversation = async (userId) => {
    try {
      const res = await fetch(
        `${API_URL}/api/chat/private/${id}${userId}`,
        {
          method: "POST",
          headers: authHeaders()
        }
      );

      if (!res.ok) throw new Error("Failed");

      const data = await res.json();

      setSelectedConversation(data);
      fetchConversations();
    } catch (e) {
      console.error(e);
    }
  };

  // INIT
  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      setError("Login required");
      setLoading(false);
      return;
    }

    fetchCurrentUser();
    fetchUsers();
    fetchConversations();
  }, []);

  // AUTO REFRESH MESSAGES
  useEffect(() => {
    if (!selectedConversation) return;

    fetchMessages(selectedConversation.id);

    const interval = setInterval(() => {
      fetchMessages(selectedConversation.id);
    }, 2000);

    return () => clearInterval(interval);
  }, [selectedConversation]);

  // AUTO SCROLL
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (loading) {
    return (
      <Container className="mt-5 text-center">
        <Spinner animation="border" />
      </Container>
    );
  }

  return (
    <Container fluid className="vh-100 p-3" style={{ background: "#0b141a" }}>
      <Row className="h-100 g-3">

        {/* LEFT */}
        <Col md={4}>
          <Card className="h-100 border-0" style={{ background: "#111b21" }}>
            <Card.Header style={{ background: "#202c33", color: "white" }}>
              Messages
            </Card.Header>

            <Card.Body className="p-0">

              <div className="p-3">
                <Form.Control
                  placeholder="Search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ background: "#202c33", border: "none", color: "white" }}
                />
              </div>

              {users
                .filter(u => u.email.includes(search))
                .map(user => (
                  <div
                    key={user.id}
                    onClick={() => startConversation(user.id)}
                    style={{
                      padding: 12,
                      cursor: "pointer",
                      borderBottom: "1px solid #1f2c34",
                      color: "white"
                    }}
                  >
                    {user.email}
                  </div>
                ))}

              {conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  style={{
                    padding: 12,
                    cursor: "pointer",
                    background: selectedConversation?.id === conv.id ? "#2a3942" : "transparent",
                    color: "white"
                  }}
                >
                  {conv.other_user.email}
                </div>
              ))}

            </Card.Body>
          </Card>
        </Col>

        {/* RIGHT */}
        <Col md={8}>
          {selectedConversation ? (
            <Card className="h-100 border-0" style={{ background: "#0b141a" }}>

              <Card.Header style={{ background: "#202c33", color: "white" }}>
                {selectedConversation.other_user.email}
              </Card.Header>

              <div className="flex-grow-1 p-3" style={{ overflowY: "auto" }}>
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      justifyContent: msg.sender_id === currentUser?.id ? "flex-end" : "flex-start",
                      marginBottom: 10
                    }}
                  >
                    <div style={{
                      background: msg.sender_id === currentUser?.id ? "#005c4b" : "#202c33",
                      color: "white",
                      padding: 10,
                      borderRadius: 10,
                      maxWidth: "70%"
                    }}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <Card.Footer style={{ background: "#202c33" }}>
                <Form onSubmit={handleSendMessage}>
                  <InputGroup>
                    <Form.Control
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      style={{ background: "#2a3942", border: "none", color: "white" }}
                    />
                    <Button type="submit" style={{ background: "#25d366", border: "none" }}>
                      Send
                    </Button>
                  </InputGroup>
                </Form>
              </Card.Footer>

            </Card>
          ) : (
            <Card className="h-100 d-flex justify-content-center align-items-center">
              Select a conversation
            </Card>
          )}
        </Col>

      </Row>
    </Container>
  );
};

export default Messages;