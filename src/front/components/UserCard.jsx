import React from "react";
import { Card, Button } from "react-bootstrap";
import "./userCard.css";

const UserCard = ({
  user,
  onMessage,
  onAddFriend,
  onViewProfile,
  showMessageButton = true,
  showAddFriendButton = false,
  showProfileLink = true,
  compact = false,
}) => {
  return (
    <Card className={`user-card shadow-sm ${compact ? "compact" : ""}`}>
      <Card.Body className="text-center">
        <div className="user-card-avatar">
          {user.profile_picture_url ? (
            <img src={user.profile_picture_url} alt={user.username} />
          ) : (
            <div className="avatar-placeholder">
              {user.username?.charAt(0)?.toUpperCase() || "U"}
            </div>
          )}
        </div>

        <Card.Title className="user-card-name">
          {user.first_name} {user.last_name}
        </Card.Title>

        <p className="user-card-username">@{user.username}</p>

        {user.bio && !compact && (
          <p className="user-card-bio">{user.bio}</p>
        )}

        {user.friends_count !== undefined && !compact && (
          <p className="user-card-stats">
            <span className="stat-item">
              <strong>{user.friends_count || 0}</strong> Friends
            </span>
            {user.events_attended !== undefined && (
              <span className="stat-item">
                <strong>{user.events_attended || 0}</strong> Events
              </span>
            )}
          </p>
        )}

        <div className="user-card-actions">
          {showMessageButton && (
            <Button
              variant="primary"
              size="sm"
              className="flex-grow-1"
              onClick={() => onMessage?.(user.id)}
            >
              💬 Message
            </Button>
          )}

          {showAddFriendButton && (
            <Button
              variant="outline-primary"
              size="sm"
              className="flex-grow-1"
              onClick={() => onAddFriend?.(user.id)}
            >
              ➕ Add Friend
            </Button>
          )}

          {showProfileLink && (
            <Button
              variant="outline-secondary"
              size="sm"
              className="flex-grow-1"
              onClick={() => onViewProfile?.(user.id)}
            >
              View Profile
            </Button>
          )}
        </div>
      </Card.Body>
    </Card>
  );
};

export default UserCard;
