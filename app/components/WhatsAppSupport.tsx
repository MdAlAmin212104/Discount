import { useState, useRef, useEffect } from "react";

interface WhatsAppSupportProps {
  phone: string;
}

export default function WhatsAppSupport({ phone }: WhatsAppSupportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  const handleSend = () => {
    if (!message.trim()) return;
    const formattedPhone = phone.replace(/[^0-9]/g, ""); // Clean formatting (only numbers)
    const encodedText = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedText}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    setMessage("");
    setIsOpen(false);
  };

  return (
    <>
      <style>{`
        .wa-support-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        /* Floating WhatsApp Button */
        .wa-float-btn {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background-color: #25D366;
          color: white;
          border: none;
          box-shadow: 0 4px 16px rgba(37, 211, 102, 0.4);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          position: relative;
        }

        .wa-float-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(37, 211, 102, 0.6);
          background-color: #22c35e;
        }

        .wa-float-btn:active {
          transform: scale(0.95);
        }

        /* Badge/Tooltip on Hover */
        .wa-tooltip {
          position: absolute;
          right: 70px;
          background: #333333;
          color: #ffffff;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease;
          transform: translateX(10px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .wa-float-btn:hover .wa-tooltip {
          opacity: 1;
          transform: translateX(0);
        }

        /* Chat Card Popup */
        .wa-chat-card {
          position: absolute;
          bottom: 72px;
          right: 0;
          width: 320px;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          border: 1px solid rgba(0, 0, 0, 0.08);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
          transform-origin: bottom right;
          opacity: 0;
          transform: scale(0.9) translateY(20px);
          pointer-events: none;
        }

        .wa-chat-card.open {
          opacity: 1;
          transform: scale(1) translateY(0);
          pointer-events: auto;
        }

        /* Card Header */
        .wa-card-header {
          background-color: #075E54;
          padding: 16px;
          color: white;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .wa-avatar {
          width: 40px;
          height: 40px;
          background-color: #128C7E;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 18px;
          border: 2px solid rgba(255,255,255,0.2);
        }

        .wa-header-info {
          display: flex;
          flex-direction: column;
          flex-grow: 1;
        }

        .wa-header-title {
          font-size: 15px;
          font-weight: 600;
          margin: 0;
        }

        .wa-header-status {
          font-size: 12px;
          color: #25D366;
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: 500;
          margin: 2px 0 0 0;
        }

        .wa-header-status::before {
          content: "";
          display: inline-block;
          width: 6px;
          height: 6px;
          background-color: #25D366;
          border-radius: 50%;
        }

        .wa-close-btn {
          background: transparent;
          border: none;
          color: white;
          cursor: pointer;
          opacity: 0.8;
          font-size: 20px;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.2s;
        }

        .wa-close-btn:hover {
          opacity: 1;
        }

        /* Card Body */
        .wa-card-body {
          padding: 16px;
          background-color: #ECE5DD;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .wa-bubble-msg {
          background: white;
          padding: 10px 14px;
          border-radius: 0 10px 10px 10px;
          font-size: 13px;
          color: #303030;
          line-height: 1.4;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
          max-width: 90%;
        }

        .wa-textarea {
          width: 100%;
          border: 1px solid #e1e3e5;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
          resize: none;
          box-sizing: border-box;
          outline: none;
          font-family: inherit;
          transition: border-color 0.2s;
        }

        .wa-textarea:focus {
          border-color: #128C7E;
        }

        .wa-send-btn {
          background-color: #25D366;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 2px 6px rgba(37, 211, 102, 0.2);
          transition: background-color 0.2s, transform 0.1s;
        }

        .wa-send-btn:hover {
          background-color: #22c35e;
        }

        .wa-send-btn:active {
          transform: scale(0.98);
        }

        .wa-send-btn:disabled {
          background-color: #b2ebd4;
          cursor: not-allowed;
          box-shadow: none;
        }
      `}</style>

      <div className="wa-support-container">
        {/* Chat Card Popup */}
        <div ref={cardRef} className={`wa-chat-card ${isOpen ? "open" : ""}`}>
          <div className="wa-card-header">
            <div className="wa-avatar">💬</div>
            <div className="wa-header-info">
              <h4 className="wa-header-title">App Support</h4>
              <p className="wa-header-status">Online</p>
            </div>
            <button className="wa-close-btn" onClick={() => setIsOpen(false)}>
              &times;
            </button>
          </div>

          <div className="wa-card-body">
            <div className="wa-bubble-msg">
              Hello! If you have any questions or face issues with the app, type your message below to chat with us on WhatsApp.
            </div>

            <textarea
              className="wa-textarea"
              rows={3}
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />

            <button
              className="wa-send-btn"
              onClick={handleSend}
              disabled={!message.trim()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 0 0 1.333 4.993L2 22l5.13-1.343a9.92 9.92 0 0 0 4.881 1.282c5.506 0 9.99-4.478 9.99-9.985s-4.485-9.985-9.989-9.985zm0 18.294a8.275 8.275 0 0 1-4.218-1.155l-.303-.18-3.13.82.836-3.05-.197-.314A8.28 8.28 0 0 1 3.722 12c0-4.57 3.72-8.29 8.29-8.29 4.57 0 8.29 3.72 8.29 8.29 0 4.57-3.72 8.29-8.29 8.29z"/>
              </svg>
              Send on WhatsApp
            </button>
          </div>
        </div>

        {/* Floating Button */}
        <button
          ref={buttonRef}
          className="wa-float-btn"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="WhatsApp Support"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997a11.966 11.966 0 0 1-5.748-1.483L0 24zm6.59-3.235c.789.468 1.632.714 2.502.715a9.81 9.81 0 0 0 9.802-9.803c.002-2.618-1.017-5.08-2.873-6.936C14.223 2.886 11.758 1.866 9.136 1.868A9.816 9.816 0 0 0 .736 11.674c-.001 1.705.446 3.371 1.299 4.846L1.01 20.97l4.637-1.215-.001.002-.001.002-.001.006zM18.06 14.85c-.328-.164-1.94-.957-2.24-1.066-.3-.11-.518-.164-.737.164-.22.329-.848 1.066-1.039 1.285-.19.22-.383.246-.71.082-.328-.164-1.385-.511-2.64-1.63-1-.893-1.675-2.002-1.872-2.33-.197-.329-.022-.507.142-.67.149-.147.329-.383.493-.575.164-.191.22-.328.328-.548.11-.219.055-.411-.027-.575-.083-.164-.737-1.777-1.011-2.435-.267-.64-.539-.553-.737-.563-.19-.01-.41-.01-.628-.01s-.574.082-.875.411c-.3.328-1.148 1.123-1.148 2.738 0 1.615 1.176 3.176 1.34 3.395.164.22 2.313 3.532 5.6 4.95.782.338 1.393.54 1.868.692.786.25 1.5.215 2.065.13.63-.095 1.94-.793 2.213-1.56.273-.767.273-1.423.191-1.56-.082-.136-.3-.22-.628-.383z"/>
          </svg>
          <span className="wa-tooltip">Need Help? Chat with us</span>
        </button>
      </div>
    </>
  );
}
