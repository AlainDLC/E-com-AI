import React, { useState, useEffect, useRef } from "react";
import { FaRobot, FaPaperPlane, FaTimes, FaCommentDots } from "react-icons/fa";

const isOpen = true;
const ChatWidget = () => {
  return (
    <div className={`chat-widget-container ${isOpen ? "open" : ""}`}>
      ChatWidget
    </div>
  );
};

export default ChatWidget;
