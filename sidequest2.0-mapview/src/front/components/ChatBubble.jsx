import React from "react";
import "./chatBubble.css";

const ChatBubble = ({ message, isSent = false, showTime = true }) => {
  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className={`chat-bubble-wrapper ${isSent ? "sent" : "received"}`}>
      <div className={`chat-bubble ${isSent ? "sent-bubble" : "received-bubble"}`}>
        <p className="bubble-text">{message.text}</p>
        {showTime && (
          <span className="bubble-time">
            {formatTime(message.created_at)}
          </span>
        )}
      </div>
    </div>
  );
};

export default ChatBubble;
