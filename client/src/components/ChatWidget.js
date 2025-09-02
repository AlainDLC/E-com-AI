import React, { useState, useEffect, useRef } from "react";
import { FaRobot, FaPaperPlane, FaTimes, FaCommentDots } from "react-icons/fa";

const isOpen = true;

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [thredId, setTreadId] = useState(null);
  const messafeEndRef = useRef(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const initialMessages = [
        {
          text: "Hello I'm your shopping assistant. How can I help you?",
          isAgent: true,
        },
      ];
      setMessages(initialMessages);
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    messafeEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toogleChat = () => {
    setIsOpen(!isOpen);
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  console.log(messages);

  const handleMessage = async (e) => {
    e.preventDefault();
    console.log(inputValue);

    const message = {
      text: inputValue,
      isAgent: false,
    };
    setMessages((prevMessage) => [...prevMessage, message]);
    setInputValue("");
  };

  return (
    <div className={`chat-widget-container ${isOpen ? "open" : ""}`}>
      {isOpen ? (
        <>
          <div className="chat-header">
            <div className="chat-title">
              <FaRobot />
              <h3>Shop Assistans</h3>
            </div>
            <button className="close-button" onClick={toogleChat}>
              <FaTimes />
            </button>
          </div>

          <div className="chat-massages">
            {messages.map((message, index) => (
              <div key={index}>
                <div
                  className={`message ${
                    message.isAgent ? "message-bot" : "message-user"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
            <div ref={messafeEndRef} />
          </div>
          <form className="chat-input-container" onSubmit={handleMessage}>
            <input
              type="text"
              className="message-input"
              placeholder="Type your message..."
              value={inputValue}
              onChange={handleInputChange}
            />
            <button
              type="submit"
              className="send-button"
              disabled={inputValue.trim() === ""}
            >
              <FaPaperPlane size={16} />
            </button>
          </form>
        </>
      ) : (
        <button className="chat-button" onClick={toogleChat}>
          <FaCommentDots />
        </button>
      )}
    </div>
  );
};

export default ChatWidget;
