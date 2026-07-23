import { useState, useRef, useEffect } from "react";

interface WhatsAppSupportProps {
  phone: string;
}

export default function WhatsAppSupport({ phone }: WhatsAppSupportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [hasUnread, setHasUnread] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Formatted current time for chat timestamp
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    };
    updateTime();
  }, []);

  // Close when clicking outside the widget
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isOpen &&
        cardRef.current &&
        !cardRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen) {
      setHasUnread(false);
    }
    setIsOpen(!isOpen);
  };

  const handleSend = (textToSend?: string) => {
    const finalMsg = textToSend || message;
    if (!finalMsg.trim()) return;
    const formattedPhone = phone.replace(/[^0-9]/g, ""); // Clean formatting
    const encodedText = encodeURIComponent(finalMsg);
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedText}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    setMessage("");
    setIsOpen(false);
  };

  const quickQuestions = [
    "🚀 Need help with Campaign setup",
    "🎨 How to customize Theme Widget?",
    "💬 Talk to a Live Specialist",
  ];

  return (
    <>
      <style>{`
        .wa-support-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        /* Floating WhatsApp Button */
        .wa-float-btn {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
          color: white;
          border: none;
          box-shadow: 0 8px 24px rgba(37, 211, 102, 0.45), 0 2px 6px rgba(0, 0, 0, 0.12);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          outline: none;
        }

        .wa-float-btn:hover {
          transform: scale(1.08) translateY(-2px);
          box-shadow: 0 12px 28px rgba(37, 211, 102, 0.6), 0 4px 10px rgba(0, 0, 0, 0.15);
        }

        .wa-float-btn:active {
          transform: scale(0.95);
        }

        /* Pulse Ring Animation */
        .wa-pulse-ring {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border: 2px solid #25D366;
          animation: waPulse 2s infinite ease-out;
          pointer-events: none;
        }

        @keyframes waPulse {
          0% {
            transform: scale(0.95);
            opacity: 0.8;
          }
          100% {
            transform: scale(1.45);
            opacity: 0;
          }
        }

        /* Unread Badge */
        .wa-unread-badge {
          position: absolute;
          top: -2px;
          right: -2px;
          background: #E53935;
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          animation: bounce 1s infinite alternate;
        }

        @keyframes bounce {
          from { transform: translateY(0); }
          to { transform: translateY(-3px); }
        }

        /* Hover Tooltip */
        .wa-tooltip {
          position: absolute;
          right: 74px;
          background: rgba(30, 30, 30, 0.9);
          backdrop-filter: blur(8px);
          color: #ffffff;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s ease, transform 0.25s ease;
          transform: translateX(10px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        }

        .wa-float-btn:hover .wa-tooltip {
          opacity: 1;
          transform: translateX(0);
        }

        /* Chat Card Container */
        .wa-chat-card {
          position: absolute;
          bottom: 76px;
          right: 0;
          width: 350px;
          max-width: calc(100vw - 32px);
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22), 0 4px 12px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.08);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          transform-origin: bottom right;
          opacity: 0;
          transform: scale(0.85) translateY(24px);
          pointer-events: none;
        }

        .wa-chat-card.open {
          opacity: 1;
          transform: scale(1) translateY(0);
          pointer-events: auto;
        }

        /* Official Header Styling */
        .wa-card-header {
          background: linear-gradient(135deg, #075E54 0%, #128C7E 100%);
          padding: 16px 18px;
          color: white;
          display: flex;
          align-items: center;
          gap: 12px;
          position: relative;
        }

        .wa-avatar-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .wa-avatar {
          width: 44px;
          height: 44px;
          background: #ffffff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }

        .wa-avatar svg {
          width: 28px;
          height: 28px;
        }

        .wa-online-dot {
          position: absolute;
          bottom: 1px;
          right: 1px;
          width: 11px;
          height: 11px;
          background-color: #25D366;
          border: 2px solid #075E54;
          border-radius: 50%;
        }

        .wa-header-info {
          display: flex;
          flex-direction: column;
          flex-grow: 1;
        }

        .wa-header-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .wa-header-title {
          font-size: 15px;
          font-weight: 700;
          margin: 0;
          color: #ffffff;
          letter-spacing: 0.2px;
        }

        .wa-verified-badge {
          display: inline-flex;
          align-items: center;
        }

        .wa-header-subtitle {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.85);
          margin: 3px 0 0 0;
          display: flex;
          align-items: center;
          gap: 5px;
          font-weight: 400;
        }

        .wa-close-btn {
          background: rgba(255, 255, 255, 0.15);
          border: none;
          color: white;
          cursor: pointer;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s ease;
          outline: none;
        }

        .wa-close-btn:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        /* WhatsApp Chat Wallpaper Body */
        .wa-card-body {
          padding: 16px;
          background-color: #EFEAE2;
          background-image: radial-gradient(rgba(0, 0, 0, 0.04) 1px, transparent 0);
          background-size: 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          max-height: 420px;
          overflow-y: auto;
        }

        /* Incoming Chat Bubble with Tail */
        .wa-chat-bubble-container {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          max-width: 88%;
        }

        .wa-bubble-msg {
          background: #FFFFFF;
          padding: 12px 14px;
          border-radius: 0 12px 12px 12px;
          font-size: 13.5px;
          color: #111b21;
          line-height: 1.45;
          box-shadow: 0 1px 3px rgba(11, 20, 26, 0.13);
          position: relative;
        }

        .wa-bubble-msg::before {
          content: "";
          position: absolute;
          top: 0;
          left: -8px;
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 0 10px 10px 0;
          border-color: transparent #FFFFFF transparent transparent;
        }

        .wa-bubble-sender {
          font-weight: 700;
          font-size: 12px;
          color: #075E54;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .wa-bubble-time {
          font-size: 10px;
          color: #667781;
          text-align: right;
          margin-top: 4px;
        }

        /* Quick Suggestions Chips */
        .wa-suggestions-title {
          font-size: 11px;
          font-weight: 600;
          color: #667781;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 4px 0 2px 2px;
        }

        .wa-chips-wrapper {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .wa-chip-btn {
          background: #FFFFFF;
          border: 1px solid #E1E3E5;
          border-radius: 20px;
          padding: 8px 14px;
          font-size: 12.5px;
          color: #075E54;
          font-weight: 600;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .wa-chip-btn:hover {
          background: #F0FDF4;
          border-color: #25D366;
          color: #128C7E;
          transform: translateX(2px);
        }

        .wa-chip-btn svg {
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .wa-chip-btn:hover svg {
          opacity: 1;
        }

        /* Input Area Container */
        .wa-card-footer {
          padding: 12px 14px;
          background: #F0F2F5;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .wa-input-box {
          flex: 1;
          background: #FFFFFF;
          border: 1px solid #D1D5DB;
          border-radius: 20px;
          padding: 9px 14px;
          font-size: 13.5px;
          outline: none;
          color: #111B21;
          font-family: inherit;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .wa-input-box::placeholder {
          color: #8696A0;
        }

        .wa-input-box:focus {
          border-color: #128C7E;
          box-shadow: 0 0 0 2px rgba(18, 140, 126, 0.15);
        }

        .wa-send-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: #25D366;
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          box-shadow: 0 2px 6px rgba(37, 211, 102, 0.3);
          outline: none;
          flex-shrink: 0;
        }

        .wa-send-btn:hover {
          background: #20bd5a;
          transform: scale(1.05);
        }

        .wa-send-btn:active {
          transform: scale(0.95);
        }

        .wa-send-btn:disabled {
          background: #CCCCCC;
          cursor: not-allowed;
          box-shadow: none;
        }
      `}</style>

      <div className="wa-support-container">
        {/* Chat Card Popup */}
        <div ref={cardRef} className={`wa-chat-card ${isOpen ? "open" : ""}`}>
          {/* Header */}
          <div className="wa-card-header">
            <div className="wa-avatar-wrapper">
              <div className="wa-avatar">
                {/* Official WhatsApp Logo Icon */}
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12.012 2C6.506 2 2.023 6.478 2.022 11.984C2.02 13.746 2.483 15.467 3.364 16.98L2 22L7.13 20.657C8.59 21.455 10.28 21.98 12.012 21.98C17.518 21.98 22.002 17.502 22.002 11.995C22.002 6.488 17.517 2 12.012 2ZM12.012 20.294C10.457 20.294 8.932 19.875 7.6 19.085L7.297 18.905L4.256 19.702L5.067 16.738L4.87 16.424C4.004 15.048 3.547 13.535 3.548 11.984C3.549 7.322 7.34 3.531 12.012 3.531C16.684 3.531 20.474 7.322 20.474 11.995C20.474 16.668 16.684 20.294 12.012 20.294ZM16.577 14.28C16.326 14.154 15.093 13.548 14.863 13.464C14.633 13.38 14.466 13.338 14.298 13.59C14.13 13.842 13.648 14.409 13.501 14.577C13.354 14.745 13.207 14.766 12.956 14.64C12.705 14.514 11.897 14.249 10.938 13.394C10.19 12.727 9.686 11.903 9.539 11.651C9.392 11.399 9.524 11.263 9.65 11.138C9.763 11.026 9.901 10.845 10.027 10.698C10.153 10.551 10.195 10.446 10.279 10.278C10.363 10.11 10.321 9.963 10.258 9.837C10.195 9.711 9.692 8.473 9.482 7.969C9.278 7.478 9.07 7.545 8.917 7.537C8.772 7.529 8.604 7.529 8.436 7.529C8.268 7.529 7.995 7.592 7.765 7.844C7.535 8.096 6.885 8.705 6.885 9.944C6.885 11.183 7.786 12.38 7.912 12.548C8.038 12.716 9.687 15.258 12.21 16.348C12.81 16.607 13.277 16.762 13.642 16.878C14.244 17.069 14.79 17.042 15.222 16.978C15.704 16.906 16.708 16.37 16.918 15.782C17.128 15.194 17.128 14.69 17.065 14.585C17.002 14.48 16.834 14.417 16.577 14.28Z"
                    fill="#25D366"
                  />
                </svg>
              </div>
              <span className="wa-online-dot" />
            </div>

            <div className="wa-header-info">
              <div className="wa-header-title-row">
                <h4 className="wa-header-title">Discount App Support</h4>
                <span className="wa-verified-badge" title="Official Verified Support">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="#00DA76">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </span>
              </div>
              <p className="wa-header-subtitle">
                <span>Typically replies instantly</span>
              </p>
            </div>

            <button
              className="wa-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close Chat"
            >
              &times;
            </button>
          </div>

          {/* Body */}
          <div className="wa-card-body">
            {/* Incoming Message Bubble */}
            <div className="wa-chat-bubble-container">
              <div className="wa-bubble-msg">
                <div className="wa-bubble-sender">
                  Support Specialist
                </div>
                Hi there! 👋 Welcome to Discount App Support. How can we help you boost your store sales today?
                <div className="wa-bubble-time">{currentTime || "11:00 AM"}</div>
              </div>
            </div>

            {/* Quick Action Chips */}
            <div className="wa-suggestions-title">Frequently Asked:</div>
            <div className="wa-chips-wrapper">
              {quickQuestions.map((q, idx) => (
                <button
                  key={idx}
                  className="wa-chip-btn"
                  onClick={() => handleSend(q)}
                >
                  <span>{q}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          {/* Footer Input Area */}
          <div className="wa-card-footer">
            <input
              type="text"
              className="wa-input-box"
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />

            <button
              className="wa-send-btn"
              onClick={() => handleSend()}
              disabled={!message.trim()}
              title="Send Message"
            >
              {/* Paper Plane / Send Icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Floating Button */}
        <button
          ref={buttonRef}
          className="wa-float-btn"
          onClick={handleToggle}
          aria-label="WhatsApp Support"
        >
          {hasUnread && <div className="wa-pulse-ring" />}
          {hasUnread && <div className="wa-unread-badge">1</div>}

          {/* Official WhatsApp Logo */}
          <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997a11.966 11.966 0 0 1-5.748-1.483L0 24zm6.59-3.235c.789.468 1.632.714 2.502.715a9.81 9.81 0 0 0 9.802-9.803c.002-2.618-1.017-5.08-2.873-6.936C14.223 2.886 11.758 1.866 9.136 1.868A9.816 9.816 0 0 0 .736 11.674c-.001 1.705.446 3.371 1.299 4.846L1.01 20.97l4.637-1.215-.001.002-.001.002-.001.006zM18.06 14.85c-.328-.164-1.94-.957-2.24-1.066-.3-.11-.518-.164-.737.164-.22.329-.848 1.066-1.039 1.285-.19.22-.383.246-.71.082-.328-.164-1.385-.511-2.64-1.63-1-.893-1.675-2.002-1.872-2.33-.197-.329-.022-.507.142-.67.149-.147.329-.383.493-.575.164-.191.22-.328.328-.548.11-.219.055-.411-.027-.575-.083-.164-.737-1.777-1.011-2.435-.267-.64-.539-.553-.737-.563-.19-.01-.41-.01-.628-.01s-.574.082-.875.411c-.3.328-1.148 1.123-1.148 2.738 0 1.615 1.176 3.176 1.34 3.395.164.22 2.313 3.532 5.6 4.95.782.338 1.393.54 1.868.692.786.25 1.5.215 2.065.13.63-.095 1.94-.793 2.213-1.56.273-.767.273-1.423.191-1.56-.082-.136-.3-.22-.628-.383z"/>
          </svg>

          <span className="wa-tooltip">Chat on WhatsApp</span>
        </button>
      </div>
    </>
  );
}
