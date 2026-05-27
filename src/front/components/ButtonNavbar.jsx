import { useState } from "react";
import { Button, Modal, Form } from "react-bootstrap";
import {
  FiHome,
  FiCompass,
  FiPlus,
  FiMessageSquare,
  FiUser
} from "react-icons/fi";

export const BottomNavbar = () => {
  const [showProfile, setShowProfile] = useState(false);
  const [showQuest, setShowQuest] = useState(false);

  // PROFILE STATE
  const [userData, setUserData] = useState({
    name: "Alex Chen",
    email: "alexchen@email.com",
    username: "alexchen",
    city: "Madrid",
    bio: "Gym lover and morning runner.",
    profileImage: "https://i.pravatar.cc/150?img=12"
  });

  // QUEST STATE
  const [eventData, setEventData] = useState({
    date: "",
    time: "",
    location: "",
    details: "",
    image: "",
    invitedFriends: []
  });

  const friends = [
    { id: 1, name: "Sarah Kim", username: "@sarahk" },
    { id: 2, name: "Lucas Reed", username: "@lucasr" },
    { id: 3, name: "Mia Lopez", username: "@mial" }
  ];

  // PROFILE HANDLERS
  const handleProfileChange = (e) => {
    setUserData({
      ...userData,
      [e.target.name]: e.target.value
    });
  };

  const handleProfileImage = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUserData({
        ...userData,
        profileImage: URL.createObjectURL(file)
      });
    }
  };

  const saveProfile = () => {
    console.log("PROFILE:", userData);
    setShowProfile(false);
  };

  // QUEST HANDLERS
  const handleQuestChange = (e) => {
    setEventData({
      ...eventData,
      [e.target.name]: e.target.value
    });
  };

  const handleQuestImage = (e) => {
    const file = e.target.files[0];
    if (file) {
      setEventData({
        ...eventData,
        image: URL.createObjectURL(file)
      });
    }
  };

  const toggleFriend = (id) => {
    setEventData((prev) => {
      const exists = prev.invitedFriends.includes(id);

      return {
        ...prev,
        invitedFriends: exists
          ? prev.invitedFriends.filter((f) => f !== id)
          : [...prev.invitedFriends, id]
      };
    });
  };

  const createQuest = () => {
    console.log("QUEST:", eventData);
    setShowQuest(false);
  };

  return (
    <>
      {/* NAVBAR */}
      <div className="bottom-navbar">

        <div className="bottom-item">
          <FiHome />
          <span>home</span>
        </div>

        <div className="bottom-item">
          <FiCompass />
          <span>explore</span>
        </div>

        <button
          className="bottom-item border-0 bg-transparent"
          onClick={() => setShowQuest(true)}
        >
          <FiPlus />
          <span>quest</span>
        </button>

        <div className="bottom-item">
          <FiMessageSquare />
          <span>inbox</span>
        </div>

        <button
          className="bottom-item border-0 bg-transparent"
          onClick={() => setShowProfile(true)}
        >
          <FiUser />
          <span>profile</span>
        </button>
      </div>

      {/* PROFILE MODAL */}
      <Modal show={showProfile} onHide={() => setShowProfile(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Profile</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <Form>

            <div className="text-center mb-3">
              <img
                src={userData.profileImage}
                alt="profile"
                width={90}
                height={90}
                style={{ borderRadius: "50%" }}
              />
              <Form.Control type="file" onChange={handleProfileImage} />
            </div>

            <Form.Control
              className="mb-2"
              name="name"
              value={userData.name}
              onChange={handleProfileChange}
              placeholder="Name"
            />

            <Form.Control
              className="mb-2"
              name="email"
              value={userData.email}
              onChange={handleProfileChange}
              placeholder="Email"
            />

            <Form.Control
              className="mb-2"
              name="username"
              value={userData.username}
              onChange={handleProfileChange}
              placeholder="Username"
            />

            <Form.Control
              className="mb-2"
              name="city"
              value={userData.city}
              onChange={handleProfileChange}
              placeholder="City"
            />

            <Form.Control
              as="textarea"
              rows={3}
              name="bio"
              value={userData.bio}
              onChange={handleProfileChange}
              placeholder="Bio"
            />

          </Form>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowProfile(false)}>
            Cancel
          </Button>

          <Button onClick={saveProfile}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>

      {/* QUEST MODAL */}
      <Modal show={showQuest} onHide={() => setShowQuest(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Create Quest</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <Form>

            <Form.Control
              type="date"
              name="date"
              className="mb-2"
              onChange={handleQuestChange}
            />

            <Form.Control
              type="time"
              name="time"
              className="mb-2"
              onChange={handleQuestChange}
            />

            <Form.Control
              type="text"
              name="location"
              className="mb-2"
              placeholder="Location"
              onChange={handleQuestChange}
            />

            <Form.Control
              as="textarea"
              rows={3}
              name="details"
              className="mb-2"
              placeholder="Details"
              onChange={handleQuestChange}
            />

            <Form.Control
              type="file"
              className="mb-3"
              onChange={handleQuestImage}
            />

            <div>
              <strong>Invite friends</strong>

              {friends.map((f) => (
                <Form.Check
                  key={f.id}
                  type="checkbox"
                  label={`${f.name} (${f.username})`}
                  checked={eventData.invitedFriends.includes(f.id)}
                  onChange={() => toggleFriend(f.id)}
                />
              ))}
            </div>

          </Form>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowQuest(false)}>
            Cancel
          </Button>

          <Button onClick={createQuest}>
            Create
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};